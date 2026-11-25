import { z } from 'zod'

export default defineEventHandler(async (event) => {
  const user = await getUser(event)
  const chat = await ownChat(getRouterParam(event, 'id')!, user.id)
  const { title } = await readValidatedBody(event, z.object({ title: z.string().trim().min(1).max(100) }).parse)
  await useStore().updateChat(chat.id, { title })
  return { title }
})
