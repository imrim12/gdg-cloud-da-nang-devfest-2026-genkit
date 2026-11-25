import { z } from 'zod'

/** Thumbs up/down on an assistant message; without isUpvoted the vote is removed. */
export default defineEventHandler(async (event) => {
  const user = await getUser(event)
  const chat = await ownChat(getRouterParam(event, 'id')!, user.id)
  const { messageId, isUpvoted } = await readValidatedBody(event, z.object({
    messageId: z.string(),
    isUpvoted: z.boolean().optional()
  }).parse)

  const store = useStore()
  const message = (await store.listMessages(chat.id)).find(m => m.id === messageId)
  if (!message) throw createError({ statusCode: 404, statusMessage: 'Message not found' })
  if (message.role !== 'assistant') throw createError({ statusCode: 400, statusMessage: 'Can only vote on assistant messages' })

  if (isUpvoted === undefined) await store.deleteVote(chat.id, messageId)
  else await store.setVote({ chatId: chat.id, messageId, isUpvoted })
  return { chatId: chat.id, messageId, isUpvoted }
})
