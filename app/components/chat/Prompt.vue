<script setup lang="ts">
import type { ChatStatus } from 'ai'
import type { ChatPromptQueueItem } from '@nuxt/ui'

const props = withDefaults(defineProps<{
  status?: ChatStatus
  error?: Error
  /** The upload state of the files, in the same order as `v-model:files`. */
  uploads?: FileWithStatus[]
  uploading?: boolean
  disabled?: boolean
}>(), {
  status: 'ready',
  error: undefined,
  uploads: () => []
})

const emit = defineEmits<{
  submit: [event: Event]
  send: []
  stop: []
  reload: []
}>()

const input = defineModel<string>({ default: '' })
const files = defineModel<File[]>('files', { default: () => [] })
// Messages sent during a response wait in a queue where the parent binds `v-model:queue`
const queue = defineModel<ChatPromptQueueItem[]>('queue')

const toast = useToast()
const voice = useVoice()

const placeholder = computed(() => {
  if (voice.status.value === 'live') return 'Voice mode: talk to Gemini Live…'
  if (queue.value && (props.status === 'submitted' || props.status === 'streaming')) {
    return 'Queue a follow-up...'
  }
  return 'Ask anything, or ask for a canvas…'
})

// The microphone replaces the send button while the prompt is empty, like ChatGPT
const canTalk = computed(() => voice.status.value !== 'idle' || (props.status === 'ready' && !input.value.trim() && !files.value.length))

const { requireChatReady } = useSignInGate()

async function talk() {
  if (voice.status.value === 'idle' && !requireChatReady('to use voice mode')) return
  try {
    await voice.toggle()
  } catch (error) {
    toast.add({ title: 'Voice mode failed', description: (error as Error).message, icon: 'i-lucide-alert-circle', color: 'error' })
  }
}
</script>

<template>
  <UChatPrompt
    v-model="input"
    v-model:files="files"
    v-model:queue="queue"
    :accept="FILE_UPLOAD_CONFIG.acceptPattern"
    :status="status"
    :error="error"
    :disabled="disabled"
    :placeholder="placeholder"
    color="neutral"
    variant="subtle"
    :ui="{ base: ['px-1.5', voice.status.value !== 'idle' && 'placeholder:italic'] }"
    @submit="emit('submit', $event)"
    @send="emit('send')"
  >
    <template #files="{ remove }">
      <UChatAttachment
        v-for="(upload, index) in uploads"
        :key="upload.id"
        :file="upload.file"
        :icon="getFileIcon(upload.file.type, upload.file.name)"
        :status="upload.status === 'uploaded' ? 'idle' : upload.status"
        :description="upload.error"
        size="sm"
        removable
        @remove="remove(index)"
      />
    </template>

    <template #footer="{ open }">
      <ChatPromptMenu :open="open" />

      <div class="flex items-center gap-1">
        <ModelSelect />

        <UTooltip
          v-if="canTalk"
          :text="voice.status.value === 'live' ? 'End voice mode' : 'Voice mode (Gemini Live)'"
        >
          <UButton
            :icon="voice.status.value === 'live' ? 'i-lucide-audio-lines' : 'i-lucide-mic'"
            :color="voice.status.value === 'live' ? 'primary' : 'neutral'"
            :variant="voice.status.value === 'live' ? 'solid' : 'ghost'"
            :loading="voice.status.value === 'connecting'"
            :disabled="disabled"
            size="sm"
            aria-label="Voice mode"
            @click="talk"
          />
        </UTooltip>
        <UChatPromptSubmit
          v-else
          :status="status"
          :disabled="uploading || disabled"
          color="neutral"
          size="sm"
          @stop="emit('stop')"
          @reload="emit('reload')"
        />
      </div>
    </template>
  </UChatPrompt>
</template>
