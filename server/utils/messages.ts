import type { MessageData, Part } from 'genkit'
import type { UIMessage } from 'ai'
import { z } from 'zod'

// Users only send text and uploaded files; reasoning and tool parts come from the model
export const userMessageSchema = z.object({
  id: z.string().default(() => crypto.randomUUID()),
  role: z.literal('user'),
  parts: z.array(z.discriminatedUnion('type', [
    z.object({ type: z.literal('text'), text: z.string().max(100_000) }),
    z.object({ type: z.literal('file'), mediaType: z.string(), url: z.string(), filename: z.string().optional() })
  ])).min(1)
})

const MAX_TOOL_NOTE = 4000

/** A tool call from an earlier turn, as text the model can read. */
function toolNote(part: { type: string, input?: unknown, output?: unknown, state?: string }) {
  const name = part.type.slice('tool-'.length)
  if (name === 'canvas') {
    const canvas = part.output as Canvas | undefined
    return canvas ? `[canvas built: canvasId=${canvas.id}, "${canvas.title}", version ${canvas.version}]` : '[canvas failed]'
  }
  const output = JSON.stringify(part.output ?? null)
  return `[called ${name}(${JSON.stringify(part.input ?? {})}) → ${output.length > MAX_TOOL_NOTE ? `${output.slice(0, MAX_TOOL_NOTE)}…` : output}]`
}

/** An uploaded file as inline media; only the user's own files under /api/files/users/{userId}/. */
async function media(url: string, contentType: string, userId: string): Promise<Part | undefined> {
  const path = url.startsWith('/api/files/') ? url.slice('/api/files/'.length) : ''
  if (!features().files || !path.startsWith(`users/${userId}/`) || path.includes('..')) return undefined
  const data = await bucket.download(path).catch(() => undefined)
  return data && { media: { url: `data:${contentType};base64,${data.toString('base64')}`, contentType } }
}

/** Stored UI messages → Genkit messages. Earlier tool calls become text notes, not function calls. */
export async function toGenkitMessages(messages: UIMessage[], userId: string): Promise<MessageData[]> {
  const result: MessageData[] = []
  for (const message of messages) {
    const content: Part[] = []
    for (const part of message.parts) {
      if (part.type === 'text' && part.text) content.push({ text: part.text })
      else if (part.type === 'file') {
        const file = await media(part.url, part.mediaType, userId)
        if (file) content.push(file)
      } else if (part.type.startsWith('tool-') && message.role === 'assistant') content.push({ text: toolNote(part as never) })
    }
    if (content.length) result.push({ role: message.role === 'assistant' ? 'model' : 'user', content })
  }
  return result
}
