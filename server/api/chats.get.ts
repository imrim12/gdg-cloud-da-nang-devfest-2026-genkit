/** The user's chats, newest first. Visitors who have not signed in have none when sign-in is on. */
export default defineEventHandler(async (event) => {
  const user = await getUser(event)
  if (useRuntimeConfig().public.auth && !user.signedIn) return []
  const chats = await useStore().listChats(user.id)
  return chats.map(({ id, title, visibility, createdAt }) => ({ id, title, visibility, createdAt }))
})
