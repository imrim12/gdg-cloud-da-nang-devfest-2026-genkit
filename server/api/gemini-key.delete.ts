/** Forgets the user's Gemini API key. */
export default defineEventHandler(async (event) => {
  const user = await getUser(event)
  if (user.signedIn) await useStore().setGeminiKey(user.id, null)
  return { required: byot(), saved: false }
})
