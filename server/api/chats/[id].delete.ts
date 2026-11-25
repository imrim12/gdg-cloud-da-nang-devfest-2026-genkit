export default defineEventHandler(async (event) => {
  const user = await getUser(event)
  const chat = await ownChat(getRouterParam(event, 'id')!, user.id)
  await useStore().deleteChat(chat.id)
  return { success: true }
})
