export default defineEventHandler(async (event) => {
  requireMemory()
  const user = await getUser(event)
  await memory.remove(user.id, getRouterParam(event, 'id')!)
  return { ok: true }
})
