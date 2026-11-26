import { FieldValue, Firestore } from '@google-cloud/firestore'

/** A connector the user authorized. The OAuth tokens are encrypted (server/utils/seal.ts). */
export interface Connection {
  userId: string
  connectorId: string
  enabled: boolean
  /** Encrypted OAuth tokens (access, refresh, expiry). */
  tokens: string
  scopes: string[]
  account?: string
  /** The redirect URI used to connect: identifies a dynamically registered OAuth client. */
  redirectUri: string
  needsReconnect?: boolean
  connectedAt: string
}

/**
 * Chats, messages and votes, plus each user's settings and connectors. Firestore when NUXT_GCP_FIRESTORE is set, otherwise in memory
 * (local development; lost on restart).
 *
 * Firestore layout: chats/{chatId} with subcollections messages/{messageId} and votes/{messageId};
 * users/{userId} (settings) with subcollection connections/{connectorId}.
 * Message parts are stored as JSON: Firestore rejects nested arrays and undefined values.
 */
interface Store {
  listChats(userId: string): Promise<Chat[]>
  getChat(id: string): Promise<Chat | undefined>
  createChat(chat: Chat): Promise<void>
  updateChat(id: string, patch: Partial<Pick<Chat, 'title' | 'visibility' | 'userId'>>): Promise<void>
  deleteChat(id: string): Promise<void>
  listMessages(chatId: string): Promise<StoredMessage[]>
  /** Inserts or replaces messages; an existing message keeps its createdAt. */
  saveMessages(chatId: string, messages: Omit<StoredMessage, 'chatId' | 'createdAt'>[]): Promise<void>
  deleteMessages(chatId: string, ids: string[]): Promise<void>
  listVotes(chatId: string): Promise<Vote[]>
  setVote(vote: Vote): Promise<void>
  deleteVote(chatId: string, messageId: string): Promise<void>
  /** The user's Gemini API key, encrypted (server/utils/gemini-key.ts). */
  getGeminiKey(userId: string): Promise<string | undefined>
  setGeminiKey(userId: string, sealed: string | null): Promise<void>
  getSettings(userId: string): Promise<UserSettings>
  updateSettings(userId: string, patch: Partial<UserSettings>): Promise<UserSettings>
  listConnections(userId: string): Promise<Connection[]>
  getConnection(userId: string, connectorId: string): Promise<Connection | undefined>
  saveConnection(connection: Connection): Promise<void>
  updateConnection(userId: string, connectorId: string, patch: Partial<Omit<Connection, 'userId' | 'connectorId'>>): Promise<void>
  deleteConnection(userId: string, connectorId: string): Promise<void>
}

const newest = (a: Chat, b: Chat) => b.createdAt.localeCompare(a.createdAt)
const oldest = (a: StoredMessage, b: StoredMessage) => a.createdAt.localeCompare(b.createdAt)

/** Timestamps a batch of new messages a millisecond apart, so they keep their order. */
const stamp = (index: number) => new Date(Date.now() + index).toISOString()

function memoryStore(): Store {
  const chats = new Map<string, Chat>()
  const messages = new Map<string, Map<string, StoredMessage>>()
  const votes = new Map<string, Map<string, Vote>>()
  const settings = new Map<string, UserSettings>()
  const geminiKeys = new Map<string, string>()
  const connections = new Map<string, Map<string, Connection>>()
  const of = <T>(map: Map<string, Map<string, T>>, chatId: string) => {
    if (!map.has(chatId)) map.set(chatId, new Map())
    return map.get(chatId)!
  }

  return {
    listChats: async userId => [...chats.values()].filter(chat => chat.userId === userId).sort(newest),
    getChat: async id => chats.get(id),
    createChat: async (chat) => {
      chats.set(chat.id, chat)
    },
    updateChat: async (id, patch) => {
      const chat = chats.get(id)
      if (chat) chats.set(id, { ...chat, ...patch })
    },
    deleteChat: async (id) => {
      chats.delete(id)
      messages.delete(id)
      votes.delete(id)
    },
    listMessages: async chatId => [...of(messages, chatId).values()].sort(oldest),
    saveMessages: async (chatId, items) => {
      const stored = of(messages, chatId)
      items.forEach((message, index) => stored.set(message.id, {
        ...message,
        chatId,
        createdAt: stored.get(message.id)?.createdAt ?? stamp(index)
      }))
    },
    deleteMessages: async (chatId, ids) => {
      ids.forEach(id => of(messages, chatId).delete(id))
    },
    listVotes: async chatId => [...of(votes, chatId).values()],
    setVote: async (vote) => {
      of(votes, vote.chatId).set(vote.messageId, vote)
    },
    deleteVote: async (chatId, messageId) => {
      of(votes, chatId).delete(messageId)
    },
    getGeminiKey: async userId => geminiKeys.get(userId),
    setGeminiKey: async (userId, sealed) => {
      if (sealed) geminiKeys.set(userId, sealed)
      else geminiKeys.delete(userId)
    },
    getSettings: async userId => ({ ...DEFAULT_SETTINGS, ...settings.get(userId) }),
    updateSettings: async (userId, patch) => {
      const next = { ...DEFAULT_SETTINGS, ...settings.get(userId), ...patch }
      settings.set(userId, next)
      return next
    },
    listConnections: async userId => [...of(connections, userId).values()],
    getConnection: async (userId, connectorId) => of(connections, userId).get(connectorId),
    saveConnection: async (connection) => {
      of(connections, connection.userId).set(connection.connectorId, connection)
    },
    updateConnection: async (userId, connectorId, patch) => {
      const existing = of(connections, userId).get(connectorId)
      if (existing) of(connections, userId).set(connectorId, { ...existing, ...patch })
    },
    deleteConnection: async (userId, connectorId) => {
      of(connections, userId).delete(connectorId)
    }
  }
}

function firestoreStore(db: Firestore): Store {
  const chats = db.collection('chats')
  const messages = (chatId: string) => chats.doc(chatId).collection('messages')
  const votes = (chatId: string) => chats.doc(chatId).collection('votes')
  const users = db.collection('users')
  const connections = (userId: string) => users.doc(userId).collection('connections')

  return {
    async listChats(userId) {
      // Sorted here rather than with orderBy, which would need a composite index
      const snapshot = await chats.where('userId', '==', userId).get()
      return snapshot.docs.map(doc => doc.data() as Chat).sort(newest)
    },
    async getChat(id) {
      return (await chats.doc(id).get()).data() as Chat | undefined
    },
    async createChat(chat) {
      await chats.doc(chat.id).create(chat)
    },
    async updateChat(id, patch) {
      await chats.doc(id).update(patch)
    },
    async deleteChat(id) {
      await db.recursiveDelete(chats.doc(id))
    },
    async listMessages(chatId) {
      const snapshot = await messages(chatId).orderBy('createdAt').get()
      return snapshot.docs.map((doc) => {
        const { parts, ...rest } = doc.data()
        return { ...rest, parts: JSON.parse(parts) } as StoredMessage
      })
    },
    async saveMessages(chatId, items) {
      if (!items.length) return
      const refs = items.map(message => messages(chatId).doc(message.id))
      const existing = await db.getAll(...refs)
      const batch = db.batch()
      items.forEach((message, index) => batch.set(refs[index]!, {
        id: message.id,
        chatId,
        role: message.role,
        parts: JSON.stringify(message.parts),
        createdAt: existing[index]?.get('createdAt') ?? stamp(index)
      }))
      await batch.commit()
    },
    async deleteMessages(chatId, ids) {
      const batch = db.batch()
      ids.forEach(id => batch.delete(messages(chatId).doc(id)))
      await batch.commit()
    },
    async listVotes(chatId) {
      return (await votes(chatId).get()).docs.map(doc => doc.data() as Vote)
    },
    async setVote(vote) {
      await votes(vote.chatId).doc(vote.messageId).set(vote)
    },
    async deleteVote(chatId, messageId) {
      await votes(chatId).doc(messageId).delete()
    },
    async getGeminiKey(userId) {
      return (await users.doc(userId).get()).get('geminiKey') as string | undefined
    },
    async setGeminiKey(userId, sealed) {
      await users.doc(userId).set({ geminiKey: sealed ?? FieldValue.delete() }, { merge: true })
    },
    async getSettings(userId) {
      const data = (await users.doc(userId).get()).get('settings') as Partial<UserSettings> | undefined
      return { ...DEFAULT_SETTINGS, ...data }
    },
    async updateSettings(userId, patch) {
      await users.doc(userId).set({ settings: patch }, { merge: true })
      return this.getSettings(userId)
    },
    async listConnections(userId) {
      return (await connections(userId).get()).docs.map(doc => doc.data() as Connection)
    },
    async getConnection(userId, connectorId) {
      return (await connections(userId).doc(connectorId).get()).data() as Connection | undefined
    },
    async saveConnection(connection) {
      await connections(connection.userId).doc(connection.connectorId).set(connection)
    },
    async updateConnection(userId, connectorId, patch) {
      await connections(userId).doc(connectorId).update(patch)
    },
    async deleteConnection(userId, connectorId) {
      await connections(userId).doc(connectorId).delete()
    }
  }
}

let instance: Store | undefined

export function useStore(): Store {
  if (!instance) {
    const { gcp } = useRuntimeConfig()
    instance = gcp.firestore
      ? firestoreStore(new Firestore({ projectId: gcp.project || undefined, databaseId: gcp.firestore, ignoreUndefinedProperties: true }))
      : memoryStore()
  }
  return instance
}

/** The chat, if the user may read it (owner, or shared publicly). */
export async function readableChat(id: string, userId: string) {
  const chat = await useStore().getChat(id)
  if (!chat || (chat.visibility === 'private' && chat.userId !== userId)) {
    throw createError({ statusCode: 404, statusMessage: 'Chat not found' })
  }
  return chat
}

/** The chat, if the user owns it. */
export async function ownChat(id: string, userId: string) {
  const chat = await useStore().getChat(id)
  if (!chat || chat.userId !== userId) {
    throw createError({ statusCode: 404, statusMessage: 'Chat not found' })
  }
  return chat
}
