<script setup lang="ts">
import type { UIMessage } from 'ai'

defineProps<{ message: UIMessage }>()

const labels: Record<string, string> = {
  search: 'Searching the web',
  python: 'Running Python',
  shell: 'Running a command',
  browse: 'Browsing',
  save: 'Saving a file',
}
</script>

<template>
  <template
    v-for="(part, index) in message.parts"
    :key="index"
  >
    <MDC
      v-if="part.type === 'text'"
      :value="part.text"
      :cache-key="`${message.id}-${index}`"
      class="*:first:mt-0 *:last:mb-0"
    />
    <UChatTool
      v-else-if="part.type === 'dynamic-tool'"
      :text="labels[part.toolName] ?? part.toolName"
      :loading="part.state === 'input-available'"
      :streaming="part.state === 'input-available'"
    >
      <pre class="text-xs whitespace-pre-wrap overflow-x-auto">{{ part.input }}</pre>
      <pre
        v-if="part.state === 'output-available'"
        class="text-xs whitespace-pre-wrap overflow-x-auto max-h-64"
      >{{ part.output }}</pre>
    </UChatTool>
  </template>
</template>
