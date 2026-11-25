import { z } from 'zod'

/**
 * Before an edit or a regenerate: deletes the messages after an edited user message,
 * or a regenerated assistant message and everything after it.
 */
export default defineEventHandler(async (event) => {
  const user = await getUser(event)
  const chat = await ownChat(getRouterParam(event, 'id')!, user.id)
  const { messageId, type } = await readValidatedBody(event, z.object({
    messageId: z.string(),
    type: z.enum(['edit', 'regenerate'])
  }).parse)

  const store = useStore()
  const messages = await store.listMessages(chat.id)
  const index = messages.findIndex(message => message.id === messageId)
  if (index === -1) throw createError({ statusCode: 404, statusMessage: 'Message not found' })

  const role = messages[index]!.role
  if (type === 'edit' && role !== 'user') throw createError({ statusCode: 400, statusMessage: 'Can only edit user messages' })
  if (type === 'regenerate' && role !== 'assistant') throw createError({ statusCode: 400, statusMessage: 'Can only regenerate assistant messages' })

  const ids = messages.slice(type === 'edit' ? index + 1 : index).map(message => message.id)
  if (ids.length) await store.deleteMessages(chat.id, ids)
  return { success: true }
})
