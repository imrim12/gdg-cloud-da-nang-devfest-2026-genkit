/** Whether the user has added a Gemini API key, and its last characters. Never the key. */
export default defineEventHandler(async (event) => {
  const user = await getUser(event)
  const key = user.signedIn ? await userGeminiKey(user.id) : undefined
  return { required: byot(), saved: !!key, hint: key ? keyHint(key) : undefined }
})
