import { z } from 'genkit'
import { ai, model, type Context } from '..'
import { tools } from '../tools'

const Turn = z.object({ role: z.enum(['user', 'model']), text: z.string() })

export const Input = z.object({
  chatId: z.string(),
  userId: z.string(),
  messages: z.array(Turn).min(1),
})

/** Events streamed to the browser. */
export const Event = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('tool'), ref: z.string(), name: z.string(), input: z.unknown() }),
  z.object({ type: z.literal('result'), ref: z.string(), output: z.unknown() }),
])

function system(memories: string[]) {
  return [
    `You are a helpful assistant. Today is ${new Date().toDateString()}. Answer in Markdown.`,
    'Use tools when they help. When a tool returns a file or screenshot URL, link it in your reply.',
    memories.length && `What you remember about the user:\n${memories.map(fact => `- ${fact}`).join('\n')}`,
  ].filter(Boolean).join('\n\n')
}

/** Recalls memories, best effort: chat keeps working if Memory Bank fails. */
async function recall(userId: string, query: string) {
  if (!features().memory) return []
  return memory.recall(userId, query).catch((error) => {
    console.error('memory recall failed', error)
    return []
  })
}

export const chat = ai.defineFlow(
  { name: 'chat', inputSchema: Input, streamSchema: Event, outputSchema: z.string() },
  async ({ chatId, userId, messages }, { sendChunk }) => {
    const last = messages.at(-1)!
    const { stream, response } = ai.generateStream({
      model: model(),
      system: system(await recall(userId, last.text)),
      messages: messages.map(({ role, text }) => ({ role, content: [{ text }] })),
      tools: tools(),
      maxTurns: 10,
      context: { chatId, userId } satisfies Context,
    })

    for await (const chunk of stream) {
      for (const part of chunk.content) {
        if (part.text && !part.reasoning) sendChunk({ type: 'text', text: part.text })
        if (part.toolRequest) sendChunk({ type: 'tool', ref: part.toolRequest.ref ?? part.toolRequest.name, name: part.toolRequest.name, input: part.toolRequest.input })
        if (part.toolResponse) sendChunk({ type: 'result', ref: part.toolResponse.ref ?? part.toolResponse.name, output: part.toolResponse.output })
      }
    }

    const { text } = await response
    if (features().memory) {
      memory.remember(userId, [last, { role: 'model', text }]).catch(error => console.error('memory generation failed', error))
    }
    return text
  },
)
