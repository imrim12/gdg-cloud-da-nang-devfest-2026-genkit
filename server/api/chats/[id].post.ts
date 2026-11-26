import type { UIMessage, UIMessageStreamWriter } from 'ai'
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai'
import { z } from 'zod'
import { chat as chatFlow, type Event } from '../../flows/chat'
import { title as titleFlow } from '../../flows/title'

/**
 * Translates the chat flow's events into AI SDK UI message chunks, which the Nuxt UI chat
 * components render: text and reasoning blocks, tool calls and their results.
 */
function bridge(writer: UIMessageStreamWriter) {
  let open: { type: 'text' | 'reasoning', id: string } | undefined
  let count = 0
  // Tool calls waiting for their result, by tool name, for progress updates
  const pending = new Map<string, string>()
  // Tool calls already sent to the browser
  const announced = new Set<string>()
  const close = () => {
    if (open) writer.write({ type: `${open.type}-end`, id: open.id })
    open = undefined
  }
  const block = (type: 'text' | 'reasoning', delta: string) => {
    if (open?.type !== type) {
      close()
      open = { type, id: `${type}-${count++}` }
      writer.write({ type: `${type}-start`, id: open.id })
    }
    writer.write({ type: `${type}-delta`, id: open.id, delta })
  }

  return {
    write(event: Event) {
      switch (event.type) {
        case 'text':
        case 'reasoning':
          return block(event.type, event.text)
        case 'tool':
          close()
          pending.set(event.name, event.ref)
          announced.add(event.ref)
          return writer.write({ type: 'tool-input-available', toolCallId: event.ref, toolName: event.name, input: event.input })
        case 'progress': {
          const toolCallId = pending.get(event.name)
          if (!toolCallId) return
          return writer.write({ type: 'tool-output-available', toolCallId, output: event.output, preliminary: true })
        }
        case 'result': {
          close()
          // A tool call made by a fallback model is not streamed, only its result: announce it first
          if (!announced.has(event.ref)) {
            writer.write({ type: 'tool-input-available', toolCallId: event.ref, toolName: event.name, input: {} })
          }
          pending.delete(event.name)
          const error = (event.output as { error?: unknown } | null)?.error
          return writer.write(typeof error === 'string'
            ? { type: 'tool-output-error', toolCallId: event.ref, errorText: error }
            : { type: 'tool-output-available', toolCallId: event.ref, output: event.output })
        }
      }
    },
    close
  }
}

const firstText = (message?: UIMessage) => message?.parts.map(part => part.type === 'text' ? part.text : '').join(' ').trim() ?? ''

export default defineEventHandler(async (event) => {
  const user = await getUser(event)
  const id = getRouterParam(event, 'id')!
  const { model, messages, webSearch, reasoning } = await readValidatedBody(event, z.object({
    model: z.string().optional(),
    messages: z.array(z.custom<UIMessage>()).min(1),
    webSearch: z.boolean().default(true),
    reasoning: z.boolean().default(true)
  }).parse)

  const chat = await ownChat(id, user.id)
  const store = useStore()

  // The first message is saved when the chat is created; later ones arrive here
  const last = messages.at(-1)
  if (last?.role === 'user' && messages.length > 1) {
    const message = userMessageSchema.safeParse(last)
    if (!message.success) throw createError({ statusCode: 400, statusMessage: 'Invalid message' })
    await store.saveMessages(id, [message.data])
  }

  const history = await toGenkitMessages(messages, user.id)
  // Stop the model when the browser goes away (Stop button, closed tab). Not the request's `close`
  // event: Node emits it once the body has been read, which would cancel every reply.
  const abort = new AbortController()
  event.node.res.on('close', () => {
    if (!event.node.res.writableFinished) abort.abort()
  })

  const stream = createUIMessageStream({
    originalMessages: messages,
    execute: async ({ writer }) => {
      // `start` carries the reply's message id (injected by the SDK), so the browser and the store agree on it
      writer.write({ type: 'start' })
      writer.write({ type: 'start-step' })

      // The title is generated in parallel with the reply
      const titling = !chat.title && firstText(messages[0])
        ? titleFlow({ message: firstText(messages[0]) })
            .then(async (title) => {
              await store.updateChat(id, { title })
              writer.write({ type: 'data-chat-title', data: { title }, transient: true })
            })
            .catch(error => console.error('title generation failed', error))
        : undefined

      const out = bridge(writer)
      const { stream: events, output } = chatFlow.stream(
        { chatId: id, userId: user.id, messages: history, model: await resolveModel(model), webSearch, reasoning },
        { abortSignal: abort.signal }
      )
      for await (const flowEvent of events) out.write(flowEvent)
      await output
      out.close()
      await titling
      writer.write({ type: 'finish-step' })
      writer.write({ type: 'finish', finishReason: 'stop' })
    },
    onError: (error) => {
      console.error('chat failed', error)
      return error instanceof Error ? error.message : 'Something went wrong.'
    },
    onEnd: async ({ messages: all, isAborted }) => {
      const reply = all.at(-1)
      if (reply?.role !== 'assistant' || !reply.parts.some(part => part.type !== 'step-start')) return
      await store.saveMessages(id, [{ id: reply.id, role: 'assistant', parts: reply.parts }])
        .catch(error => console.error(`saving reply failed${isAborted ? ' (aborted)' : ''}`, error))
    }
  })

  return createUIMessageStreamResponse({ stream })
})
