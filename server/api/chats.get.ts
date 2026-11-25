/** The user's chats, newest first. */
export default defineEventHandler(async (event) => {
  const user = await getUser(event)
  const chats = await useStore().listChats(user.id)
  return chats.map(({ id, title, visibility, createdAt }) => ({ id, title, visibility, createdAt }))
})
