/**
 * Search over the user's own chat history, for the search_chats and recent_chats tools.
 * A simple keyword ranking over the most recent chats: enough for a personal history, with no
 * index to maintain. (For large histories, store embeddings and use Firestore vector search.)
 */
const SCANNED_CHATS = 100

const textOf = (message: StoredMessage) => message.parts
  .map(part => part.type === 'text' ? part.text : '')
  .join(' ')
  .replace(/\s+/g, ' ')
  .trim()

const termsOf = (query: string) => [...new Set(query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(term => term.length > 1))]

const escape = (term: string) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** Matches a term at the start of a word ("an" matches "An", not "Grant"). */
const wordStart = (term: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escape(term)}`, 'gu')
const count = (text: string, term: string) => text.match(wordStart(term))?.length ?? 0
const includes = (text: string, term: string) => count(text, term) > 0

function snippet(text: string, terms: string[], size = 300) {
  const lower = text.toLowerCase()
  const at = Math.min(...terms.map(term => lower.search(wordStart(term))).filter(index => index >= 0), text.length)
  const start = Math.max(0, at - size / 3)
  return `${start > 0 ? '…' : ''}${text.slice(start, start + size)}${start + size < text.length ? '…' : ''}`
}

export async function searchChats(userId: string, query: string, { exclude, limit = 5 }: { exclude?: string, limit?: number } = {}) {
  const terms = termsOf(query)
  if (!terms.length) return []
  const store = useStore()
  const chats = (await store.listChats(userId)).filter(chat => chat.id !== exclude).slice(0, SCANNED_CHATS)

  const scored = await Promise.all(chats.map(async (chat) => {
    const messages = (await store.listMessages(chat.id)).map(message => ({ role: message.role, text: textOf(message) })).filter(m => m.text)
    const title = chat.title.toLowerCase()
    let score = terms.reduce((sum, term) => sum + count(title, term) * 3, 0)
    const hits = messages.map((message) => {
      const lower = message.text.toLowerCase()
      const matched = terms.filter(term => includes(lower, term))
      score += matched.reduce((sum, term) => sum + Math.min(count(lower, term), 5), 0)
      return { message, matched: matched.length }
    }).filter(hit => hit.matched).sort((a, b) => b.matched - a.matched).slice(0, 3)
    // Chats that match more of the terms rank first
    const coverage = terms.filter(term => includes(title, term) || messages.some(m => includes(m.text.toLowerCase(), term))).length
    return {
      score: score * coverage,
      chat: {
        chatId: chat.id,
        title: chat.title || 'Untitled',
        url: `/chat/${chat.id}`,
        date: chat.createdAt.slice(0, 10),
        excerpts: hits.map(({ message }) => ({ role: message.role, text: snippet(message.text, terms) }))
      }
    }
  }))
  return scored.filter(result => result.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map(result => result.chat)
}

export async function recentChats(userId: string, { exclude, limit = 10, before }: { exclude?: string, limit?: number, before?: string } = {}) {
  const store = useStore()
  const chats = (await store.listChats(userId))
    .filter(chat => chat.id !== exclude && (!before || chat.createdAt < before))
    .slice(0, limit)
  return Promise.all(chats.map(async (chat) => {
    const messages = await store.listMessages(chat.id)
    const first = messages.find(message => message.role === 'user')
    const last = messages.findLast(message => message.role === 'assistant')
    return {
      chatId: chat.id,
      title: chat.title || 'Untitled',
      url: `/chat/${chat.id}`,
      date: chat.createdAt.slice(0, 10),
      firstMessage: first ? textOf(first).slice(0, 300) : '',
      lastReply: last ? textOf(last).slice(0, 300) : ''
    }
  }))
}
