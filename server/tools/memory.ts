import { z } from 'genkit'
import { MEMORY_SECTIONS } from '#shared/utils/memory'
import { defineTool, type Context } from '../genkit'

const sections = MEMORY_SECTIONS.map(section => section.key) as [string, ...string[]]

/**
 * Lets the agent change Memory Bank when the user asks ("remember that…", "forget…"). Everything
 * else is learned in the background after each turn (memory.remember in the chat flow).
 */
export const memoryTool = defineTool(
  {
    name: 'memory',
    description: `Change your long-term memory about the user, only when they explicitly ask you to remember, update or forget something. Memories you already have are listed in the system prompt with their ids. Sections: ${MEMORY_SECTIONS.map(s => `${s.key} (${s.description})`).join('; ')}.`,
    inputSchema: z.object({
      action: z.enum(['add', 'update', 'delete']),
      fact: z.string().optional().describe('add/update: one short fact about the user, e.g. "The user prefers answers in Vietnamese."'),
      id: z.string().optional().describe('update/delete: the memory id'),
      section: z.enum(sections).optional().describe('add: where the memory belongs')
    })
  },
  async ({ action, fact, id, section }, { context }) => {
    const { userId } = context as Context
    if (action === 'add') {
      if (!fact) return { error: 'fact is required' }
      return { added: await memory.create(userId, fact, section) }
    }
    if (!id) return { error: 'id is required' }
    if (action === 'update') {
      if (!fact) return { error: 'fact is required' }
      return { updated: await memory.update(userId, id, fact, section) }
    }
    await memory.remove(userId, id)
    return { deleted: id }
  }
)
