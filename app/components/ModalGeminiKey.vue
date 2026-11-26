<script setup lang="ts">
/** Bring your own key: the user adds their Gemini API key, which the server checks and encrypts. */
const { keyOpen } = useSignInGate()
const { fetchSession } = useUserSession()
const toast = useToast()

const key = ref('')
const show = ref(false)
const saving = ref(false)
const error = ref('')

watch(keyOpen, (open) => {
  if (open) {
    key.value = ''
    error.value = ''
  }
})

async function save() {
  if (!key.value.trim()) return
  saving.value = true
  error.value = ''
  try {
    await $fetch('/api/gemini-key', { method: 'PUT', body: { key: key.value.trim() } })
    key.value = ''
    keyOpen.value = false
    await fetchSession()
    await refreshNuxtData(['models', 'gemini-key'])
    toast.add({ title: 'Gemini API key saved', description: 'It is encrypted, and only used for your chats.', icon: 'i-lucide-key-round' })
  } catch (e) {
    const data = (e as { data?: { statusMessage?: string, message?: string } }).data
    error.value = data?.statusMessage || data?.message || 'Could not save the key'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="keyOpen"
    title="Add your Gemini API key"
    description="This app runs on your own Gemini API key. It is checked, encrypted, and only used for your chats."
    :ui="{ content: 'sm:max-w-md' }"
  >
    <template #body>
      <form
        class="flex flex-col gap-4"
        @submit.prevent="save"
      >
        <ol class="text-sm text-muted flex flex-col gap-2 list-decimal ps-5">
          <li>
            Open
            <ULink
              to="https://aistudio.google.com/apikey"
              target="_blank"
              class="text-primary font-medium"
            >
              Google AI Studio → API keys
            </ULink>
            and click <span class="text-highlighted">Create API key</span>.
          </li>
          <li>Copy the key and paste it here.</li>
        </ol>

        <UFormField :error="error || undefined">
          <UInput
            v-model="key"
            :type="show ? 'text' : 'password'"
            placeholder="AIza..."
            autocomplete="off"
            spellcheck="false"
            size="lg"
            class="w-full"
            autofocus
            :ui="{ trailing: 'pe-1' }"
          >
            <template #trailing>
              <UButton
                :icon="show ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                color="neutral"
                variant="link"
                size="sm"
                :aria-label="show ? 'Hide key' : 'Show key'"
                @click="show = !show"
              />
            </template>
          </UInput>
        </UFormField>

        <p class="text-xs text-dimmed">
          A key from a project with billing works best: free-tier keys allow only a few requests per day, and no web search.
        </p>

        <UButton
          type="submit"
          label="Save key"
          icon="i-lucide-key-round"
          size="lg"
          block
          :loading="saving"
          :disabled="!key.trim()"
        />
      </form>
    </template>
  </UModal>
</template>
