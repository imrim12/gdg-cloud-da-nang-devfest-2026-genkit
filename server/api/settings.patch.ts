import { z } from 'zod'

export default defineEventHandler(async (event) => {
  const user = await getUser(event)
  const patch = await readValidatedBody(event, z.object({
    instructions: z.string().max(8000).optional(),
    searchChats: z.boolean().optional(),
    generateMemory: z.boolean().optional()
  }).strict().parse)
  return useStore().updateSettings(user.id, patch)
})
