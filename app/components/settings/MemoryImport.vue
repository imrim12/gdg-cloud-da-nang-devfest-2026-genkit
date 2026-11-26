<script setup lang="ts">
import { MEMORY_EXPORT_PROMPT } from '#shared/utils/memory'

const emit = defineEmits<{ back: [], done: [] }>()

const toast = useToast()
const copied = ref(false)
const text = ref('')
const importing = ref(false)

async function copy() {
  await navigator.clipboard.writeText(MEMORY_EXPORT_PROMPT)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}

async function submit() {
  importing.value = true
  try {
    const result = await $fetch<{ created: number, updated: number, deleted: number }>('/api/memories/import', { method: 'POST', body: { text: text.value } })
    toast.add({
      title: 'Memory imported',
      description: `${result.created} new, ${result.updated} updated${result.deleted ? `, ${result.deleted} replaced` : ''}.`,
      icon: 'i-lucide-brain'
    })
    await refreshNuxtData('memories')
    emit('done')
  } catch (error) {
    toast.add({ description: (error as Error).message || 'Could not import', icon: 'i-lucide-alert-circle', color: 'error' })
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center gap-1 text-sm">
      <UButton
        icon="i-lucide-arrow-left"
        label="Memory"
        color="neutral"
        variant="link"
        class="px-0"
        @click="emit('back')"
      />
      <span class="text-dimmed">/</span>
      <span class="font-medium text-highlighted">Import memory</span>
    </div>

    <div class="flex flex-col gap-2">
      <p class="text-sm">
        <span class="font-medium text-highlighted">1. Copy this prompt</span>
        <span class="text-muted"> and send it in a chat with your other AI assistant (ChatGPT, Gemini, Claude...).</span>
      </p>
      <div class="relative">
        <pre class="text-xs bg-elevated/50 rounded-md p-3 pe-12 whitespace-pre-wrap max-h-48 overflow-y-auto">{{ MEMORY_EXPORT_PROMPT }}</pre>
        <UButton
          :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
          color="neutral"
          variant="ghost"
          size="xs"
          class="absolute top-2 end-2"
          aria-label="Copy prompt"
          @click="copy"
        />
      </div>
    </div>

    <div class="flex flex-col gap-2">
      <p class="text-sm">
        <span class="font-medium text-highlighted">2. Paste its answer here.</span>
        <span class="text-muted"> Memory Bank picks out the facts, sorts them into topics and merges them with what it already knows.</span>
      </p>
      <UTextarea
        v-model="text"
        :rows="7"
        :maxrows="12"
        autoresize
        :maxlength="50000"
        placeholder="- Profile: The user is ..."
        class="w-full"
      />
    </div>

    <div class="flex justify-end gap-2">
      <UButton
        label="Cancel"
        color="neutral"
        variant="ghost"
        @click="emit('back')"
      />
      <UButton
        label="Add to memory"
        icon="i-lucide-brain"
        :loading="importing"
        :disabled="text.trim().length < 10"
        @click="submit"
      />
    </div>
    <p
      v-if="importing"
      class="text-xs text-muted text-end"
    >
      This can take up to a minute.
    </p>
  </div>
</template>
