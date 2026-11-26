import { z } from 'zod'

/** Adds a memory written by the user. */
export default defineEventHandler(async (event) => {
  requireMemory()
  const user = await getUser(event)
  const { fact, section } = await readValidatedBody(event, z.object({
    fact: z.string().trim().min(1).max(2000),
    section: z.string().optional()
  }).parse)
  return memory.create(user.id, fact, section)
})
