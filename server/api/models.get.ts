/** Gemini chat models the API key can use, for the model picker. */
export default defineEventHandler(async () => {
  const fallback = useRuntimeConfig().model
  const models = await listModels().catch((error) => {
    console.error('listing models failed', error)
    return [] as Model[]
  })
  return {
    default: models.some(m => m.value === fallback) ? fallback : (models[0]?.value ?? fallback),
    models: models.length ? models : [{ label: fallback, value: fallback, icon: 'i-simple-icons-googlegemini', thinking: true }]
  }
})
