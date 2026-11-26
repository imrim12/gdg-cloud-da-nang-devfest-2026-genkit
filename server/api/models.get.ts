/** Gemini chat models the API key can use, for the model picker. */
export default defineEventHandler(async (event) => {
  const fallback = useRuntimeConfig().model
  // The user's own key; visitors without one get the default model only
  const key = await requireGeminiKey(event).catch(() => undefined)
  const models = await listModels(key).catch((error) => {
    console.error('listing models failed', error)
    return [] as Model[]
  })
  return {
    default: models.some(m => m.value === fallback) ? fallback : (models[0]?.value ?? fallback),
    models: models.length ? models : [{ label: fallback, value: fallback, icon: 'i-simple-icons-googlegemini', thinking: true }]
  }
})
