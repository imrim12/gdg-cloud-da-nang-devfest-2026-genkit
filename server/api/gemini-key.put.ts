import { z } from 'zod'

/** Saves the user's Gemini API key: checked with Gemini first, then encrypted. */
export default defineEventHandler(async (event) => {
  const user = await getUser(event)
  if (!byot() || !user.signedIn) throw createError({ statusCode: 400, statusMessage: 'Sign in with Google to add a key' })
  const { key } = await readValidatedBody(event, z.object({ key: z.string().trim().min(20).max(200).regex(/^[\w-]+$/, 'That does not look like an API key') }).parse)
  await checkGeminiKey(key)
  await useStore().setGeminiKey(user.id, seal(key))
  return { required: true, saved: true, hint: keyHint(key) }
})
