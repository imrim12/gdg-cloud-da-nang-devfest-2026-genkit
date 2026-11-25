<script setup lang="ts">
import type { ChatStatus } from 'ai'

defineProps<{ status?: ChatStatus, error?: Error }>()
const emit = defineEmits<{ send: [text: string], stop: [], reload: [] }>()

const input = ref('')
const toast = useToast()
const voice = useVoice()

function submit() {
  const text = input.value.trim()
  if (!text) return
  emit('send', text)
  input.value = ''
}

async function talk() {
  try {
    await voice.toggle()
  }
  catch (error) {
    toast.add({ title: 'Voice mode failed', description: (error as Error).message, color: 'error' })
  }
}
</script>

<template>
  <UChatPrompt
    v-model="input"
    :status="status"
    :error="error"
    placeholder="Ask anything…"
    variant="subtle"
    @submit="submit"
  >
    <template #footer>
      <UTooltip :text="voice.status.value === 'live' ? 'End voice mode' : 'Voice mode'">
        <UButton
          :icon="voice.status.value === 'live' ? 'i-lucide-audio-lines' : 'i-lucide-mic'"
          :color="voice.status.value === 'live' ? 'primary' : 'neutral'"
          :variant="voice.status.value === 'live' ? 'solid' : 'ghost'"
          :loading="voice.status.value === 'connecting'"
          @click="talk"
        />
      </UTooltip>
      <UChatPromptSubmit
        :status="status"
        @stop="emit('stop')"
        @reload="emit('reload')"
      />
    </template>
  </UChatPrompt>
</template>
