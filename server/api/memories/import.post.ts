import { z } from 'zod'

/** Imports what another AI assistant knows about the user (see MEMORY_EXPORT_PROMPT). */
export default defineEventHandler(async (event) => {
  requireMemory()
  const user = await getUser(event)
  const { text } = await readValidatedBody(event, z.object({ text: z.string().trim().min(10).max(50_000) }).parse)
  return memory.import(user.id, text)
})
