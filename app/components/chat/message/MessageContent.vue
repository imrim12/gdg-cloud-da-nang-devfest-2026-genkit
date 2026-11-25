<script setup lang="ts">
import { isReasoningUIPart, isTextUIPart, isToolUIPart, getToolName } from 'ai'
import type { UIMessage } from 'ai'
import { isPartStreaming, isToolStreaming } from '@nuxt/ui/utils/ai'

defineProps<{
  message: UIMessage
  streaming: boolean
  editing: boolean
}>()

const emit = defineEmits<{
  save: [message: UIMessage, text: string]
  cancelEdit: []
}>()
</script>

<template>
  <template
    v-for="(part, index) in getMergedParts(message.parts)"
    :key="`${message.id}-${part.type}-${index}`"
  >
    <UChatReasoning
      v-if="isReasoningUIPart(part) && message.role === 'assistant'"
      :text="part.text"
      :streaming="isPartStreaming(part, streaming)"
      chevron="leading"
    >
      <ChatComark
        :value="part.text"
        :streaming="isPartStreaming(part, streaming)"
      />
    </UChatReasoning>

    <template v-else-if="isToolUIPart(part)">
      <UChatTool
        v-if="getToolName(part) === 'search'"
        :text="isToolStreaming(part, streaming) ? 'Searching the web...' : 'Searched the web'"
        :suffix="getSearchQuery(part)"
        :streaming="isToolStreaming(part, streaming)"
        :error="part.state === 'output-error'"
        icon="i-lucide-globe"
        chevron="leading"
      >
        <ChatToolSources :sources="getSources(part)" />
      </UChatTool>
      <ChatToolCalculate
        v-else-if="getToolName(part) === 'calculate'"
        :part="part"
      />
      <ChatToolCanvas
        v-else-if="getToolName(part) === 'canvas'"
        :part="part"
        :streaming="streaming"
      />
      <ChatToolCode
        v-else
        :part="part"
        :name="getToolName(part)"
      />
    </template>

    <template v-else-if="isTextUIPart(part)">
      <ChatComark
        v-if="message.role === 'assistant'"
        :value="part.text"
        :streaming="isPartStreaming(part, streaming)"
      />
      <template v-else-if="message.role === 'user'">
        <ChatMessageEdit
          v-if="editing"
          :message="message"
          :text="part.text"
          @save="(msg, text) => emit('save', msg, text)"
          @cancel="emit('cancelEdit')"
        />
        <p
          v-else
          class="whitespace-pre-wrap"
        >
          {{ part.text }}
        </p>
      </template>
    </template>
  </template>
</template>
