import { z } from 'zod'

/** Creates a chat with its first message; the reply is streamed by POST /api/chats/:id. */
export default defineEventHandler(async (event) => {
  const user = await getUser(event)
  const { id, message } = await readValidatedBody(event, z.object({
    id: z.string().uuid(),
    message: userMessageSchema
  }).parse)

  const store = useStore()
  if (await store.getChat(id)) throw createError({ statusCode: 409, statusMessage: 'Chat already exists' })

  const chat: Chat = { id, userId: user.id, title: '', visibility: 'private', createdAt: new Date().toISOString() }
  await store.createChat(chat)
  await store.saveMessages(id, [message])
  return { id, title: chat.title, visibility: chat.visibility, createdAt: chat.createdAt }
})
