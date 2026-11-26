/**
 * Agent Platform Memory Bank: long-term memories about a user, shared across chats.
 *
 * Memories are scoped to { user_id }. Memory Bank extracts them from conversations (generate),
 * merges them with what it already knows (consolidation) and tags each with topics, which the
 * memory manager uses as sections (shared/utils/memory.ts). People can also add, edit and delete
 * memories directly (create, patch, delete).
 */
import { CUSTOM_MEMORY_TOPICS, MANAGED_MEMORY_TOPICS, MEMORY_SECTIONS, sectionOf, type MemoryTopicId } from '#shared/utils/memory'

type Turn = { role: 'user' | 'model', text: string }

interface Memory {
  name: string
  fact: string
  scope: Record<string, string>
  topics?: MemoryTopicId[]
  createTime?: string
  updateTime?: string
}

type Retrieved = { retrievedMemories?: { memory: Memory }[], nextPageToken?: string }

export interface GenerateResult {
  generatedMemories?: { memory?: Memory, action?: 'CREATED' | 'UPDATED' | 'DELETED' }[]
}

const scope = (userId: string) => ({ user_id: userId })
const engine = () => `${platform()}/${useRuntimeConfig().gcp.engine}`

const toItem = (memory: Memory): MemoryItem => ({
  id: memory.name.split('/').pop()!,
  fact: memory.fact,
  section: sectionOf(memory.topics),
  createTime: memory.createTime,
  updateTime: memory.updateTime
})

const topicsOf = (section: string) => {
  const topic = MEMORY_SECTIONS.find(s => s.key === section)?.topic
  return topic ? [topic] : []
}

/** A memory id from the browser or the model: only the user's own memories can be changed. */
async function owned(userId: string, id: string) {
  if (!/^[\w-]+$/.test(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid memory id' })
  const name = `${engine()}/memories/${id}`
  const memory = await gcp<Memory>(name).catch(() => undefined)
  if (memory?.scope?.user_id !== userId) throw createError({ statusCode: 404, statusMessage: 'Memory not found' })
  return name
}

type Engine = { contextSpec?: { memoryBankConfig?: { customizationConfigs?: { memoryTopics?: { customMemoryTopic?: { label: string } }[] }[] } & Record<string, unknown> } }

let topicsReady: Promise<void> | undefined

/**
 * Makes sure the engine sorts memories into our topics (shared/utils/memory.ts). Runs once per
 * instance, the first time memory is used: engines created before the topics existed get them,
 * so nobody has to run a script. Best effort: memory works without topics.
 */
function ensureTopics() {
  topicsReady ??= (async () => {
    const url = `${platform()}/${useRuntimeConfig().gcp.engine}`
    const current = await gcp<Engine>(url)
    const config = current.contextSpec?.memoryBankConfig
    const labels = new Set(config?.customizationConfigs?.flatMap(c => c.memoryTopics ?? []).map(t => t.customMemoryTopic?.label))
    if (CUSTOM_MEMORY_TOPICS.every(t => labels.has(t.customMemoryTopic.label))) return
    await operation(`${url}?updateMask=contextSpec.memoryBankConfig.customizationConfigs`, {
      contextSpec: { memoryBankConfig: { ...config, customizationConfigs: [{ memoryTopics: [...MANAGED_MEMORY_TOPICS, ...CUSTOM_MEMORY_TOPICS] }] } }
    }, 'PATCH')
    console.log('memory topics added to the engine')
  })().catch((error) => {
    console.error('adding memory topics to the engine failed (memory still works, without the custom topics)', error)
  })
  return topicsReady
}

/** Above this many memories, a chat gets the most relevant ones instead of all of them. */
const ALL_IN_PROMPT = 60

export const memory = {
  /** All of the user's memories (up to 500), newest first. */
  async list(userId: string): Promise<MemoryItem[]> {
    await ensureTopics()
    const memories: Memory[] = []
    let pageToken: string | undefined
    do {
      const page = await gcp<Retrieved>(`${engine()}/memories:retrieve`, {
        scope: scope(userId),
        simpleRetrievalParams: { pageSize: 100, ...(pageToken && { pageToken }) }
      })
      memories.push(...(page.retrievedMemories ?? []).map(({ memory }) => memory))
      pageToken = page.nextPageToken
    } while (pageToken && memories.length < 500)
    return memories.map(toItem).sort((a, b) => (b.updateTime ?? '').localeCompare(a.updateTime ?? ''))
  },

  /**
   * Memories for a chat's system prompt: all of them when there are few, like Claude's memory
   * summary; otherwise the "You" sections plus the ones most similar to the message.
   */
  async recall(userId: string, query: string): Promise<MemoryItem[]> {
    const all = await this.list(userId)
    if (all.length <= ALL_IN_PROMPT || !query) return all.slice(0, ALL_IN_PROMPT)
    const { retrievedMemories = [] } = await gcp<Retrieved>(`${engine()}/memories:retrieve`, {
      scope: scope(userId),
      similaritySearchParams: { searchQuery: query, topK: 20 }
    })
    const core = all.filter(item => MEMORY_SECTIONS.find(s => s.key === item.section)?.group === 'You').slice(0, 30)
    const similar = retrievedMemories.map(({ memory }) => toItem(memory))
    return [...new Map([...core, ...similar].map(item => [item.id, item])).values()]
  },

  /** Adds a memory as written, without extraction or consolidation. */
  async create(userId: string, fact: string, section = 'other') {
    const create = (topics: MemoryTopicId[]) => operation<Memory>(`${engine()}/memories`, { fact, scope: scope(userId), topics })
    // A custom topic the engine was not configured with is rejected: keep the memory anyway
    const created = await create(topicsOf(section)).catch(() => create([]))
    return toItem(created)
  },

  async update(userId: string, id: string, fact: string, section?: string) {
    const name = await owned(userId, id)
    const mask = section ? 'fact,topics' : 'fact'
    const updated = await operation<Memory>(`${platform()}/${name}?updateMask=${mask}`, { fact, ...(section && { topics: topicsOf(section) }) }, 'PATCH')
    return toItem(updated ?? { name, fact, scope: scope(userId) })
  },

  async remove(userId: string, id: string) {
    await operation(`${platform()}/${await owned(userId, id)}`, undefined, 'DELETE')
  },

  /** Extracts and consolidates facts from a chat turn in the background (a long-running operation). */
  async remember(userId: string, turns: Turn[]) {
    await ensureTopics()
    await gcp(`${engine()}/memories:generate`, {
      scope: scope(userId),
      directContentsSource: {
        events: turns.map(({ role, text }) => ({ content: { role, parts: [{ text }] } }))
      }
    })
  },

  /**
   * Imports what another AI assistant knows about the user. Memory Bank extracts the facts, sorts
   * them into topics and merges them with existing memories; this waits for the result.
   */
  async import(userId: string, text: string) {
    await ensureTopics()
    const result = await operation<GenerateResult>(`${engine()}/memories:generate`, {
      scope: scope(userId),
      directContentsSource: {
        events: [{
          content: {
            role: 'user',
            parts: [{ text: `Here is what my previous AI assistant knows about me. Please remember all of it:\n\n${text}` }]
          }
        }]
      }
    })
    const actions = (result?.generatedMemories ?? []).map(generated => generated.action)
    return {
      created: actions.filter(action => action === 'CREATED').length,
      updated: actions.filter(action => action === 'UPDATED').length,
      deleted: actions.filter(action => action === 'DELETED').length
    }
  }
}
