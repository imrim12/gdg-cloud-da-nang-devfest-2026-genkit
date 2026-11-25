type ApiModel = {
  name: string
  displayName?: string
  supportedGenerationMethods?: string[]
  thinking?: boolean
}

/** Not chat models, or not meant for this app (speech, images, transcription, robotics, computer use...). */
const EXCLUDE = /tts|image|banana|transcribe|robotics|computer-use|customtools|omni|embedding|live|-exp/

let cache: { at: number, models: Model[] } | undefined
const HOUR = 60 * 60 * 1000

/** Version number in a model name, for sorting: gemini-3.5-flash → 3.5. Aliases (-latest) sort last. */
const version = (name: string) => name.includes('-latest') ? 0 : Number(name.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0)

/** Gemini chat models available to the API key, newest first. Cached for an hour. */
export async function listModels(): Promise<Model[]> {
  if (cache && Date.now() - cache.at < HOUR) return cache.models

  const found: ApiModel[] = []
  let pageToken: string | undefined
  do {
    const page = await $fetch<{ models?: ApiModel[], nextPageToken?: string }>('https://generativelanguage.googleapis.com/v1beta/models', {
      headers: { 'x-goog-api-key': useRuntimeConfig().geminiApiKey },
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

  cache = { at: Date.now(), models }
  return models
}

/** The requested model if the key can use it, else the configured default. */
export async function resolveModel(requested?: string) {
  const fallback = useRuntimeConfig().model
  if (!requested || requested === fallback) return fallback
  const models = await listModels().catch(() => [])
  return models.some(m => m.value === requested) ? requested : fallback
}
