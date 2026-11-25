export default defineEventHandler(async (event) => {
  const user = await getUser(event)
  const chat = await ownChat(getRouterParam(event, 'id')!, user.id)
  return useStore().listVotes(chat.id)
})
