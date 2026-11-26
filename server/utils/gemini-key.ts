import { AsyncLocalStorage } from 'node:async_hooks'
import type { H3Event } from 'h3'

/**
 * Bring your own key. With Sign in with Google on, every user adds their own Gemini API key: it is
 * checked, encrypted with the auth secret (server/utils/seal.ts) and stored with their settings,
 * and the app's own key is never used. Without sign-in (local development, the Genkit Developer UI),
 * NUXT_GEMINI_API_KEY is used.
 *
 * The key of the current request lives in AsyncLocalStorage; the model middleware in
 * server/genkit/index.ts adds it to every Gemini call made while handling that request.
 */
const current = new AsyncLocalStorage<string>()

export const byot = () => !!useRuntimeConfig().public.auth

/** The Gemini API key for the code running now. */
export function geminiKey(): string | undefined {
  return current.getStore() ?? (byot() ? undefined : useRuntimeConfig().geminiApiKey || undefined)
}

/** Runs fn (and everything it starts) with this Gemini API key. */
export const withGeminiKey = <T>(key: string, fn: () => T): T => current.run(key, fn)

export async function userGeminiKey(userId: string) {
  const sealed = await useStore().getGeminiKey(userId)
  return sealed ? tryUnseal<string>(sealed) : undefined
}

/** "…AbCd": enough to recognize a key, never the key. */
export const keyHint = (key: string) => `…${key.slice(-4)}`

/**
 * The Gemini API key for this request. 428 when the user has not added one: the browser then
 * shows the "Add your Gemini API key" dialog.
 */
export async function requireGeminiKey(event: H3Event): Promise<string> {
  if (!byot()) {
    const key = useRuntimeConfig().geminiApiKey
    if (!key) throw createError({ statusCode: 500, statusMessage: 'NUXT_GEMINI_API_KEY is not set' })
    return key
  }
  const user = await getUser(event)
  const key = user.signedIn ? await userGeminiKey(user.id) : undefined
  if (!key) throw createError({ statusCode: 428, statusMessage: 'Add your Gemini API key to chat', data: { code: 'GEMINI_KEY_REQUIRED' } })
  return key
}

/** Checks a key with a cheap call (list models); throws a message the user can act on. */
export async function checkGeminiKey(key: string) {
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', { headers: { 'x-goog-api-key': key } })
  if (response.ok) return
  const body = await response.json().catch(() => ({})) as { error?: { message?: string, status?: string } }
  const reason = body.error?.status === 'INVALID_ARGUMENT' || response.status === 400
    ? 'This API key is not valid. Copy it again from Google AI Studio.'
    : body.error?.message ?? `Gemini rejected the key (HTTP ${response.status})`
  throw createError({ statusCode: 400, statusMessage: reason })
}
