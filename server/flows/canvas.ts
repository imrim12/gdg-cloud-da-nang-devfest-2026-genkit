import { z } from 'genkit'
import { ai, model, resilient, thinking } from '../genkit'
import { withSandboxPage } from '../tools/browse'

const File = z.object({
  path: z.string().describe('Relative path, e.g. index.html, style.css, app.js'),
  content: z.string()
})

const Draft = z.object({
  title: z.string().describe('Short name of the page or app'),
  files: z.array(File).min(1).describe('index.html first, then any local CSS/JS it references')
})

const CanvasSchema = z.object({
  id: z.string(),
  title: z.string(),
  version: z.number(),
  files: z.array(File),
  screenshot: z.string().optional(),
  issues: z.array(z.string()).optional()
})

const SYSTEM = `You build small, polished, self-contained web pages and apps that run in a sandboxed iframe.
Rules:
- Entry point is index.html. You may add style.css and app.js (referenced with relative paths), nothing else.
- No build step and no npm: use plain HTML/CSS/JS, or ES modules from https://esm.sh (e.g. import { createApp } from "https://esm.sh/vue@3"), and Tailwind from https://cdn.tailwindcss.com if useful.
- No API keys, no backend, no localStorage dependence; fetch only public CORS-enabled APIs.
- Responsive, accessible, good-looking by default, supports dark mode via prefers-color-scheme.
- Complete, working code. No placeholders, no TODOs.
- Compact: aim for under 300 lines in total. Prefer Tailwind classes over long custom CSS.`

/** Renders the canvas in the computer use sandbox: screenshot plus console errors. */
async function review(chatId: string, userId: string, html: string) {
  return withSandboxPage(chatId, async (page) => {
    const issues: string[] = []
    page.on('pageerror', error => issues.push(`Uncaught error: ${error.message}`))
    page.on('console', (message) => {
      if (message.type() === 'error') issues.push(`Console error: ${message.text()}`)
    })
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.setContent(html, { waitUntil: 'load', timeout: 20_000 })
    await page.waitForTimeout(1000)
    const screenshot = features().files
      ? await bucket.save(`users/${userId}/${chatId}/canvas-${Date.now()}.png`, await page.screenshot(), 'image/png')
      : undefined
    return { issues: issues.slice(0, 10), screenshot }
  })
}

/**
 * Builds or edits a canvas: Gemini writes the files as structured output; with the computer use
 * sandbox configured, the page is rendered there and errors get one automatic fix.
 */
export const canvasFlow = ai.defineFlow(
  {
    name: 'canvas',
    inputSchema: z.object({
      chatId: z.string(),
      userId: z.string(),
      request: z.string(),
      previous: CanvasSchema.optional()
    }),
    // Partial canvases while the code is being written, for the live view in the UI
    streamSchema: CanvasSchema.partial(),
    outputSchema: CanvasSchema
  },
  async ({ chatId, userId, request, previous }, { sendChunk }) => {
    const id = previous?.id ?? crypto.randomUUID()
    const version = (previous?.version ?? 0) + 1
    const current = previous && `Current version of the canvas "${previous.title}":\n${previous.files.map(file => `--- ${file.path}\n${file.content}`).join('\n')}`

    const draft = async (prompt: string) => {
      const { stream, response } = ai.generateStream({
        model: model(),
        system: SYSTEM,
        prompt,
        output: { schema: Draft },
        // Code generation does not need long thinking; this roughly halves the time
        config: thinking(undefined, { level: 'LOW' }),
        use: resilient()
      })
      let sent = 0
      for await (const chunk of stream) {
        if (Date.now() - sent < 400) continue
        sent = Date.now()
        const partial = chunk.output as Partial<z.infer<typeof Draft>> | null
        if (partial?.files?.length) sendChunk({ id, version, title: partial.title ?? 'Canvas', files: partial.files.filter(file => file?.path) as z.infer<typeof File>[] })
      }
      const { output } = await response
      if (!output) throw new Error('The model returned no canvas.')
      return output
    }

    let result = await draft([current, previous ? `Change it: ${request}\nReturn all files, complete.` : `Build: ${request}`].filter(Boolean).join('\n\n'))
    let checked: { issues: string[], screenshot?: string } | undefined

    if (features().browser) {
      checked = await review(chatId, userId, bundleCanvas(result.files)).catch((error) => {
        console.error('canvas review failed', error)
        return undefined
      })
      if (checked?.issues.length) {
        result = await draft([
          `This canvas has errors when it runs in a browser:\n${checked.issues.join('\n')}`,
          `Files:\n${result.files.map(file => `--- ${file.path}\n${file.content}`).join('\n')}`,
          'Fix them. Return all files, complete.'
        ].join('\n\n'))
        checked = await review(chatId, userId, bundleCanvas(result.files)).catch(() => checked)
      }
    }

    return {
      id,
      title: result.title,
      version,
      files: result.files,
      ...(checked?.screenshot && { screenshot: checked.screenshot }),
      ...(checked?.issues.length && { issues: checked.issues })
    }
  }
)
