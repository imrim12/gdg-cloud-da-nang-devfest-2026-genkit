import { z } from 'zod'
import { memoryEdit } from '../../flows/memory'

/** "Tell the assistant what to change": a request in plain words, applied by the memoryEdit flow. */
export default defineEventHandler(async (event) => {
  requireMemory()
  const user = await getUser(event)
  const { request } = await readValidatedBody(event, z.object({ request: z.string().trim().min(1).max(4000) }).parse)
  return memoryEdit({ userId: user.id, request })
})
