/** A chat with its messages; shared chats can be read by anyone with the link. */
export default defineEventHandler(async (event) => {
  const user = await getUser(event)
  const chat = await readableChat(getRouterParam(event, 'id')!, user.id)
  const messages = await useStore().listMessages(chat.id)
  return {
    id: chat.id,
    title: chat.title,
    visibility: chat.visibility,
    createdAt: chat.createdAt,
    isOwner: chat.userId === user.id,
    messages: messages.map(({ id, role, parts, createdAt }) => ({ id, role, parts, createdAt }))
  }
})
