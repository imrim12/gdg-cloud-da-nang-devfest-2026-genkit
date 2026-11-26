import { MessageSchema, z } from 'genkit'
import { ai, model, resilient, thinking, type Context } from '../genkit'
import { MEMORY_SECTIONS } from '#shared/utils/memory'
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

const sectionLabel = (key: string) => MEMORY_SECTIONS.find(section => section.key === key)?.label ?? key

function system({ memories, tools: names, instructions }: { memories: MemoryItem[], tools: string[], instructions: string }) {
  const has = (name: string) => names.includes(name)
  const connectors = CONNECTORS.filter(c => names.some(name => name.startsWith(`${c.id}_`)))
  const remembered = MEMORY_SECTIONS
    .map(section => ({ section, items: memories.filter(item => item.section === section.key) }))
    .filter(({ items }) => items.length)
    .map(({ section, items }) => `*${sectionLabel(section.key)}*\n${items.map(item => `- ${item.fact}${has('memory') ? ` [id:${item.id}]` : ''}`).join('\n')}`)
  return [
    `You are a knowledgeable, friendly AI assistant built with Genkit and Gemini on Google Cloud. Today is ${new Date().toDateString()}.`,
    `**Formatting:** answer in Markdown. Never use headings (#); use **bold** labels instead. Start with the content. Be concise but complete.`,
    `**Tools:**`,
    `- calculate: use it for every calculation, however simple. Never do arithmetic yourself.`,
    `- canvas: when the user wants something visual or interactive (a web page, app, game, dashboard, diagram, animation, prototype), build it with canvas instead of pasting HTML in the chat. To change an existing canvas, call canvas again with its canvasId. After building, describe it in one or two sentences; do not repeat the code.`,
    has('search') && `- search: only for current or recent information (news, prices, schedules, events). Cite the sources.`,
    has('python') && `- python: data analysis, statistics, plots and file generation. Link the files it returns.`,
    has('shell') && `- shell: a persistent Linux sandbox for this chat (git, package installs, builds).`,
    has('browse') && `- browse: open and interact with real web pages.`,
    has('save') && `- save: give the user a downloadable file. Link the URL it returns.`,
    has('search_chats') && `- search_chats, recent_chats: the user's earlier chats. Use them when the user refers to a past conversation or when earlier context would help; link chats as [title](url).`,
    has('memory') && `- memory: only when the user explicitly asks you to remember, update or forget something. Other facts are remembered automatically.`,
    connectors.length && `- ${connectors.map(c => c.name).join(', ')}: the user connected these accounts; their tools are prefixed ${connectors.map(c => `${c.id}_`).join(', ')}. Use them for the user's own email and files. Search before asking for ids. Prefer drafts over sending, and confirm before deleting, trashing or overwriting anything. Link documents and messages you mention.`,
    instructions.trim() && `**The user's instructions (always follow them):**\n${instructions.trim()}`,
    remembered.length && `**What you remember about the user** (from earlier chats; use it naturally, without saying "according to my memory"):\n${remembered.join('\n')}`
  ].filter(Boolean).join('\n')
}

/** Recalls memories, best effort: chat keeps working if Memory Bank fails. */
async function recall(userId: string, query: string, settings: UserSettings) {
  if (!features().memory || !settings.generateMemory) return []
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
    const settings = await useStore().getSettings(userId)
    const query = lastUserText(messages)
    const [available, memories] = await Promise.all([tools({ webSearch, userId, settings }), recall(userId, query, settings)])
    const { stream, response } = ai.generateStream({
      model: model(name),
      system: system({ memories, tools: available.map(tool => tool.__action.name), instructions: settings.instructions }),
      messages,
      tools: available,
      maxTurns: 10,
      // Extended thinking on: think a little and show it; off: think as little as possible
      config: thinking(name, { show: reasoning, level: reasoning ? 'LOW' : 'MINIMAL' }),
      use: resilient(name),
      context: { chatId, userId, progress: (name, output) => sendChunk({ type: 'progress', name, output }) } satisfies Context,
      abortSignal
    })

    // Text streamed since the last tool call, to spot a final answer that was not streamed
    let streamed = ''
    for await (const chunk of stream) {
      for (const part of chunk.content) {
        if (part.reasoning) sendChunk({ type: 'reasoning', text: part.reasoning })
        else if (part.text) {
          streamed += part.text
          sendChunk({ type: 'text', text: part.text })
        }
        if (part.toolRequest) {
          const { ref, name, input } = part.toolRequest
          sendChunk({ type: 'tool', ref: ref ?? name, name, input })
        }
        if (part.toolResponse) {
          const { ref, name, output } = part.toolResponse
          streamed = ''
          sendChunk({ type: 'result', ref: ref ?? name, name, output })
        }
      }
    }

    const { text } = await response
    // The fallback middleware answers without streaming (e.g. when the chosen model's quota is
    // used up): send whatever part of the final answer did not arrive as chunks.
    if (text && text !== streamed) {
      sendChunk({ type: 'text', text: text.startsWith(streamed) ? text.slice(streamed.length) : `\n\n${text}` })
    }
    // Awaited, not fire-and-forget: Cloud Run throttles CPU once the response ends. It only starts
    // a long-running operation, so it is quick.
    if (features().memory && settings.generateMemory && query) {
      await memory.remember(userId, [{ role: 'user', text: query }, { role: 'model', text }])
        .catch(error => console.error('memory generation failed', error))
    }
    return text
  }
)
