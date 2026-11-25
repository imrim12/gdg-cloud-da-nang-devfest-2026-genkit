/** Gemini models from GET /api/models; the choice is remembered in a cookie. */
export function useModels() {
  const model = useCookie<string>('model', { default: () => '' })
  const { data } = useFetch('/api/models', { key: 'models', lazy: true, server: false })

  const models = computed(() => data.value?.models ?? [])

  // A model saved before it disappeared from the list falls back to the default
  watch(data, (value) => {
    if (value && !value.models.some(m => m.value === model.value)) model.value = value.default
  }, { immediate: true })

  return { model, models }
}
