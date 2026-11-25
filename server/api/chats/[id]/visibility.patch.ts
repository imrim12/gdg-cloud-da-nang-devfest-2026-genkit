import { z } from 'zod'

export default defineEventHandler(async (event) => {
  const user = await getUser(event)
  const chat = await ownChat(getRouterParam(event, 'id')!, user.id)
  const { visibility } = await readValidatedBody(event, z.object({ visibility: z.enum(['public', 'private']) }).parse)
  await useStore().updateChat(chat.id, { visibility })
  return { visibility }
})
