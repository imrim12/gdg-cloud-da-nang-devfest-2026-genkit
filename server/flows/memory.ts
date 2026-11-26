import { z } from 'genkit'
import { MEMORY_SECTIONS } from '#shared/utils/memory'
import { ai, model, resilient, thinking } from '../genkit'

const sections = MEMORY_SECTIONS.map(section => section.key) as [string, ...string[]]

const Change = z.object({
  action: z.enum(['add', 'update', 'delete']),
  id: z.string().optional().describe('update/delete: the id of an existing memory'),
  fact: z.string().optional().describe('add/update: the full new text of the memory'),
  section: z.enum(sections).optional()
})

/**
 * "Tell the assistant what to change": turns a request in plain words ("I moved to Hà Nội",
 * "forget everything about my old job") into memory edits, with structured output, then applies them.
 */
export const memoryEdit = ai.defineFlow(
  {
    name: 'memoryEdit',
    inputSchema: z.object({ userId: z.string(), request: z.string().min(1).max(4000) }),
    outputSchema: z.object({ summary: z.string(), applied: z.number() })
  },
  async ({ userId, request }) => {
    const memories = await memory.list(userId)
    const { output } = await ai.generate({
      model: model(),
      system: [
        'You maintain an AI assistant\'s long-term memory about a user. Change it exactly as the user asks, nothing more.',
        'Each memory is one short fact in the third person ("The user ...").',
        'Update a memory rather than adding a near-duplicate. Delete memories the request makes wrong or asks to forget.',
        `Sections: ${MEMORY_SECTIONS.map(s => `${s.key}: ${s.description}`).join('; ')}.`,
        'The summary tells the user, in one or two short sentences, what changed (or why nothing did).'
      ].join('\n'),
      prompt: `Current memories (JSON):\n${JSON.stringify(memories.map(({ id, fact, section }) => ({ id, fact, section })))}\n\nThe user's request: ${request}`,
      output: { schema: z.object({ changes: z.array(Change), summary: z.string() }) },
      config: thinking(undefined, { level: 'LOW' }),
      use: resilient()
    })
    if (!output) throw new Error('The model did not return any changes')

    const known = new Set(memories.map(item => item.id))
    let applied = 0
    for (const change of output.changes) {
      try {
        if (change.action === 'add' && change.fact) await memory.create(userId, change.fact, change.section)
        else if (change.action === 'update' && change.id && known.has(change.id) && change.fact) await memory.update(userId, change.id, change.fact, change.section)
        else if (change.action === 'delete' && change.id && known.has(change.id)) await memory.remove(userId, change.id)
        else continue
        applied++
      } catch (error) {
        console.error('memory change failed', change, error)
      }
    }
    return { summary: output.summary, applied }
  }
)
