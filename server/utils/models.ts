import { createHash } from 'node:crypto'

type ApiModel = {
  name: string
  displayName?: string
  supportedGenerationMethods?: string[]
  thinking?: boolean
}

/** Not chat models, or not meant for this app (speech, images, transcription, robotics, computer use...). */
const EXCLUDE = /tts|image|banana|transcribe|robotics|computer-use|customtools|omni|embedding|live|-exp/

/** Per API key (by hash): different keys can see different models. */
const cache = new Map<string, { at: number, models: Model[] }>()
const HOUR = 60 * 60 * 1000

/** Version number in a model name, for sorting: gemini-3.5-flash → 3.5. Aliases (-latest) sort last. */
const version = (name: string) => name.includes('-latest') ? 0 : Number(name.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0)

const hash = (key: string) => createHash('sha256').update(key).digest('hex')

/** Gemini chat models available to the API key, newest first. Cached for an hour. */
export async function listModels(key = geminiKey()): Promise<Model[]> {
  if (!key) return []
  const cached = cache.get(hash(key))
  if (cached && Date.now() - cached.at < HOUR) return cached.models

  const found: ApiModel[] = []
  let pageToken: string | undefined
  do {
    const page = await $fetch<{ models?: ApiModel[], nextPageToken?: string }>('https://generativelanguage.googleapis.com/v1beta/models', {
      headers: { 'x-goog-api-key': key },
      query: { pageSize: 1000, pageToken }
    })
    found.push(...page.models ?? [])
    pageToken = page.nextPageToken
  } while (pageToken)

  const models = found
    .filter(m => m.name.startsWith('models/gemini') && m.supportedGenerationMethods?.includes('generateContent') && !EXCLUDE.test(m.name))
    .map(m => ({
      label: m.displayName || m.name.slice('models/'.length),
      value: m.name.slice('models/'.length),
      icon: 'i-simple-icons-googlegemini',
      thinking: !!m.thinking
    }))
    .sort((a, b) => version(b.value) - version(a.value) || Number(a.value.includes('preview')) - Number(b.value.includes('preview')) || a.value.localeCompare(b.value))

  cache.set(hash(key), { at: Date.now(), models })
  return models
}

/** The requested model if the key can use it, else the configured default. */
export async function resolveModel(requested?: string, key?: string) {
  const fallback = useRuntimeConfig().model
  if (!requested || requested === fallback) return fallback
  const models = await listModels(key).catch(() => [])
  return models.some(m => m.value === requested) ? requested : fallback
}
