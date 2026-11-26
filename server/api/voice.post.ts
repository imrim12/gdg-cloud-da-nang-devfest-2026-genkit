import { GoogleGenAI, Modality } from '@google/genai'

const MINUTE = 60_000

/** Mints a single-use ephemeral token so the browser can talk to the Gemini Live API directly. */
export default defineEventHandler(async (event) => {
  const apiKey = await requireGeminiKey(event)
  const { liveModel } = useRuntimeConfig()
  const client = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1alpha' } })
  const token = await client.authTokens.create({
    config: {
      uses: 1,
      expireTime: new Date(Date.now() + 30 * MINUTE).toISOString(),
      newSessionExpireTime: new Date(Date.now() + MINUTE).toISOString(),
      liveConnectConstraints: { model: liveModel, config: { responseModalities: [Modality.AUDIO] } },
      httpOptions: { apiVersion: 'v1alpha' }
    }
  })
  return { token: token.name!, model: liveModel }
})
