import type { ChatStatus, DynamicToolUIPart, UIMessage } from 'ai'

type Event
  = | { type: 'text', text: string }
    | { type: 'tool', ref: string, name: string, input: unknown }
    | { type: 'result', ref: string, output: unknown }
    | { type: 'error', message: string }

async function* events(body: ReadableStream<Uint8Array>): AsyncGenerator<Event> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) return
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()!
    for (const line of lines) if (line) yield JSON.parse(line)
  }
}

function apply(message: UIMessage, event: Event) {
  const last = message.parts.at(-1)
  switch (event.type) {
    case 'text':
      if (last?.type === 'text') last.text += event.text
      else message.parts.push({ type: 'text', text: event.text })
      break
    case 'tool':
      message.parts.push({ type: 'dynamic-tool', toolName: event.name, toolCallId: event.ref, state: 'input-available', input: event.input })
      break
    case 'result': {
      const tool = message.parts.find((part): part is DynamicToolUIPart => part.type === 'dynamic-tool' && part.toolCallId === event.ref && part.state === 'input-available')
      if (tool) Object.assign(tool, { state: 'output-available', output: event.output })
      break
    }
    case 'error':
      throw new Error(event.message)
  }
}

/** Plain text of a message, as sent to the server. */
const text = (message: UIMessage) => message.parts.flatMap(part => part.type === 'text' ? [part.text] : []).join('')

/** A single chat: sends messages and streams the agent's reply. */
export function useChat(id: string) {
  const chats = useChats()
  const messages = ref<UIMessage[]>(chats.get(id)?.messages ?? [])
  const status = ref<ChatStatus>('ready')
  const error = ref<Error>()
  let controller: AbortController | undefined

  async function generate() {
    status.value = 'submitted'
    error.value = undefined
    controller = new AbortController()
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          messages: messages.value.map(message => ({ role: message.role === 'user' ? 'user' : 'model', text: text(message) })),
        }),
        signal: controller.signal,
      })
      if (!response.ok || !response.body) throw new Error(await response.text())

      messages.value.push({ id: crypto.randomUUID(), role: 'assistant', parts: [] })
      const reply = messages.value.at(-1)!
      status.value = 'streaming'
      for await (const event of events(response.body)) apply(reply, event)
      status.value = 'ready'
    }
    catch (cause) {
      const last = messages.value.at(-1)
      if (last?.role === 'assistant' && !last.parts.length) messages.value.pop()
      if (controller.signal.aborted) {
        status.value = 'ready'
      }
      else {
        error.value = cause as Error
        status.value = 'error'
      }
    }
    chats.save(id, messages.value)
  }

  function send(input: string) {
    messages.value.push({ id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text: input }] })
    chats.save(id, messages.value)
    return generate()
  }

  /** Answers again from the last user message. */
  function reload() {
    const index = messages.value.findLastIndex(message => message.role === 'user')
    messages.value = messages.value.slice(0, index + 1)
    return generate()
  }

  const stop = () => controller?.abort()

  return { messages, status, error, send, reload, stop }
}
