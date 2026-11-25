import { MessageSchema, z } from 'genkit'
import { ai, model, resilient, thinking, type Context } from '../genkit'
import { tools } from '../tools'

export const Input = z.object({
  chatId: z.string(),
  userId: z.string(),
  messages: z.array(MessageSchema).min(1),
  /** Gemini model name, e.g. gemini-3.5-flash. Defaults to NUXT_MODEL. */
  model: z.string().optional(),
  webSearch: z.boolean().default(true),
  /** Stream the model's thoughts (shown collapsed in the UI). */
  reasoning: z.boolean().default(true)
})

/** Events streamed out of the flow; server/api/chats/[id].post.ts turns them into AI SDK UI chunks. */
export const Event = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('reasoning'), text: z.string() }),
  z.object({ type: z.literal('tool'), ref: z.string(), name: z.string(), input: z.unknown() }),
  z.object({ type: z.literal('result'), ref: z.string(), name: z.string(), output: z.unknown() }),
  z.object({ type: z.literal('progress'), name: z.string(), output: z.unknown() })
])
export type Event = z.infer<typeof Event>

function system(memories: string[], hasTools: string[]) {
  return [
    `You are a knowledgeable, friendly AI assistant built with Genkit and Gemini on Google Cloud. Today is ${new Date().toDateString()}.`,
    `**Formatting:** answer in Markdown. Never use headings (#); use **bold** labels instead. Start with the content. Be concise but complete.`,
    `**Tools:**`,
    `- calculate: use it for every calculation, however simple. Never do arithmetic yourself.`,
    `- canvas: when the user wants something visual or interactive (a web page, app, game, dashboard, diagram, animation, prototype), build it with canvas instead of pasting HTML in the chat. To change an existing canvas, call canvas again with its canvasId. After building, describe it in one or two sentences; do not repeat the code.`,
    hasTools.includes('search') && `- search: only for current or recent information (news, prices, schedules, events). Cite the sources.`,
    hasTools.includes('python') && `- python: data analysis, statistics, plots and file generation. Link the files it returns.`,
    hasTools.includes('shell') && `- shell: a persistent Linux sandbox for this chat (git, package installs, builds).`,
    hasTools.includes('browse') && `- browse: open and interact with real web pages.`,
    hasTools.includes('save') && `- save: give the user a downloadable file. Link the URL it returns.`,
    memories.length && `**What you remember about the user:**\n${memories.map(fact => `- ${fact}`).join('\n')}`
  ].filter(Boolean).join('\n')
}

/** Recalls memories, best effort: chat keeps working if Memory Bank fails. */
async function recall(userId: string, query: string) {
  if (!features().memory) return []
  return memory.recall(userId, query).catch((error) => {
    console.error('memory recall failed', error)
    return []
  })
}

const lastUserText = (messages: z.infer<typeof MessageSchema>[]) =>
  messages.findLast(message => message.role === 'user')?.content.map(part => part.text ?? '').join(' ').trim() ?? ''

/** The chat agent: Gemini with tools, streaming text, thoughts, tool calls and tool results. */
export const chat = ai.defineFlow(
  { name: 'chat', inputSchema: Input, streamSchema: Event, outputSchema: z.string() },
  async ({ chatId, userId, messages, model: name, webSearch, reasoning }, { sendChunk, abortSignal }) => {
    const available = tools({ webSearch })
    const query = lastUserText(messages)
    const { stream, response } = ai.generateStream({
      model: model(name),
      system: system(await recall(userId, query), available.map(tool => tool.__action.name)),
      messages,
      tools: available,
      maxTurns: 10,
      // Extended thinking on: think a little and show it; off: think as little as possible
      config: thinking(name, { show: reasoning, level: reasoning ? 'LOW' : 'MINIMAL' }),
      use: resilient(name),
      context: { chatId, userId, progress: (name, output) => sendChunk({ type: 'progress', name, output }) } satisfies Context,
      abortSignal
    })

    for await (const chunk of stream) {
      for (const part of chunk.content) {
        if (part.reasoning) sendChunk({ type: 'reasoning', text: part.reasoning })
        else if (part.text) sendChunk({ type: 'text', text: part.text })
        if (part.toolRequest) {
          const { ref, name, input } = part.toolRequest
          sendChunk({ type: 'tool', ref: ref ?? name, name, input })
        }
        if (part.toolResponse) {
          const { ref, name, output } = part.toolResponse
          sendChunk({ type: 'result', ref: ref ?? name, name, output })
        }
      }
    }

    const { text } = await response
    // Awaited, not fire-and-forget: Cloud Run throttles CPU once the response ends. It only starts
    // a long-running operation, so it is quick.
    if (features().memory && query) {
      await memory.remember(userId, [{ role: 'user', text: query }, { role: 'model', text }])
        .catch(error => console.error('memory generation failed', error))
    }
    return text
  }
)
