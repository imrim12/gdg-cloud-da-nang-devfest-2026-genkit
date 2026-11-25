import { z } from 'genkit'
import { chat, Input } from '../genkit/flows/chat'

const Body = Input.pick({ messages: true }).extend({ id: z.string().uuid() })

/** Streams the chat flow as newline-delimited JSON events. */
export default defineEventHandler(async (event) => {
  const { id, messages } = await readValidatedBody(event, Body.parse)
  const { id: userId } = await getUser(event)
  const { stream } = chat.stream({ chatId: id, userId, messages })
  const encoder = new TextEncoder()
  const line = (value: unknown) => encoder.encode(`${JSON.stringify(value)}\n`)

  setHeader(event, 'Content-Type', 'application/x-ndjson')
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) controller.enqueue(line(chunk))
      }
      catch (error) {
        console.error(error)
        controller.enqueue(line({ type: 'error', message: error instanceof Error ? error.message : 'Something went wrong.' }))
      }
      controller.close()
    },
  })
})
