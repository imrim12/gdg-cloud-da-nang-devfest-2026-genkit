/** The user's settings (instructions, memory toggles). */
export default defineEventHandler(async (event) => {
  const user = await getUser(event)
  return useStore().getSettings(user.id)
})
