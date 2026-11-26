/** All of the user's memories, for the memory manager. */
export default defineEventHandler(async (event) => {
  requireMemory()
  const user = await getUser(event)
  return memory.list(user.id)
})
