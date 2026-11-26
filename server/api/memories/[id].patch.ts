import { z } from 'zod'

export default defineEventHandler(async (event) => {
  requireMemory()
  const user = await getUser(event)
  const { fact, section } = await readValidatedBody(event, z.object({
    fact: z.string().trim().min(1).max(2000),
    section: z.string().optional()
  }).parse)
  return memory.update(user.id, getRouterParam(event, 'id')!, fact, section)
})
