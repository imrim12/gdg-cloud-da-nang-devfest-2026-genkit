import { z } from 'genkit'
import { defineTool, type Context } from '../genkit'

/** Claude-style "search and reference chats": the agent looks up the user's earlier conversations. */
export const searchChatsTool = defineTool(
  {
    name: 'search_chats',
    description: 'Search the user\'s earlier chats by keywords, when they refer to something discussed before ("like we talked about", "my project", "last time") or when past context would help. Returns matching chats with excerpts and links.',
    inputSchema: z.object({
      query: z.string().describe('Keywords: names, topics and distinctive words, not a full sentence'),
      limit: z.number().int().min(1).max(10).default(5)
    })
  },
  async ({ query, limit }, { context }) => {
    const { userId, chatId } = context as Context
    const chats = await searchChats(userId, query, { exclude: chatId, limit })
    return { chats, ...(!chats.length && { note: 'No earlier chat matches. Try other keywords, or recent_chats.' }) }
  }
)

export const recentChatsTool = defineTool(
  {
    name: 'recent_chats',
    description: 'List the user\'s most recent earlier chats (title, date, first message, last reply), e.g. "what did we talk about yesterday?" or "continue my last chat".',
    inputSchema: z.object({
      limit: z.number().int().min(1).max(20).default(10),
      before: z.string().optional().describe('Only chats created before this ISO date, to page back in time')
    })
  },
  async ({ limit, before }, { context }) => {
    const { userId, chatId } = context as Context
    return { chats: await recentChats(userId, { exclude: chatId, limit, before }) }
  }
)
