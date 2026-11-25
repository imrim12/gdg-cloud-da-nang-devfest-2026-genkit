import { genkit } from 'genkit'
import { googleAI } from '@genkit-ai/google-genai'

export const ai = genkit({
  plugins: [googleAI({ apiKey: useRuntimeConfig().geminiApiKey || undefined })],
})

export const model = () => googleAI.model(useRuntimeConfig().model)

/** Per-request values passed to tools through Genkit's context. */
export type Context = { chatId: string, userId: string }
