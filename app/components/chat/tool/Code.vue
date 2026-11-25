<script setup lang="ts">
const props = defineProps<{ part: ToolPart, name: string }>()

const label = computed(() => TOOL_LABELS[props.name] ?? { icon: 'i-lucide-wrench', running: `Running ${props.name}...`, done: `Used ${props.name}` })
const input = computed(() => props.part.input as Record<string, unknown> | undefined)
const output = computed(() => props.part.output as Record<string, unknown> | undefined)

/** The input as a fenced code block: Python code, a shell command, or JSON. */
const source = computed(() => {
  if (typeof input.value?.code === 'string') return `\`\`\`python\n${input.value.code}\n\`\`\``
  if (typeof input.value?.command === 'string') return `\`\`\`bash\n${input.value.command}\n\`\`\``
  return `\`\`\`json\n${JSON.stringify(input.value ?? {}, null, 2)}\n\`\`\``
})

const files = computed(() => {
  const list = (output.value?.files ?? []) as { name: string, url?: string }[]
  const single = ['url', 'screenshot'].map(key => output.value?.[key]).filter((url): url is string => typeof url === 'string' && url.startsWith('/api/files/'))
  return [...list.filter(file => file.url), ...single.map(url => ({ name: getFileName(url), url }))]
})

const result = computed(() => {
  if (!output.value) return ''
  const { files: _files, url: _url, screenshot: _screenshot, ...rest } = output.value
  if (typeof rest.stdout === 'string' || typeof rest.stderr === 'string') {
    return [rest.stdout, rest.stderr].filter(Boolean).join('\n') || `(exit code ${rest.returncode ?? 0})`
  }
  return JSON.stringify(rest.output ?? rest, null, 2)
})

const suffix = computed(() => typeof input.value?.command === 'string'
  ? input.value.command
  : typeof input.value?.url === 'string' ? input.value.url : typeof input.value?.name === 'string' ? input.value.name : undefined)
</script>

<template>
  <UChatTool
    :text="isToolRunning(part) ? label.running : label.done"
    :suffix="suffix"
    :icon="label.icon"
    :loading="isToolRunning(part)"
    :error="part.state === 'output-error'"
    chevron="leading"
  >
    <div class="flex flex-col gap-2 min-w-0">
      <ChatComark :value="source" />
      <pre
        v-if="result"
        class="text-xs bg-elevated/50 rounded-md p-3 overflow-x-auto max-h-64"
      >{{ result }}</pre>
      <p
        v-if="part.state === 'output-error'"
        class="text-sm text-error"
      >
        {{ part.errorText }}
      </p>
      <div
        v-if="files.length"
        class="flex flex-wrap gap-2"
      >
        <UButton
          v-for="file in files"
          :key="file.url"
          :to="file.url"
          target="_blank"
          :label="removeRandomSuffix(file.name)"
          icon="i-lucide-download"
          size="xs"
          color="neutral"
          variant="outline"
        />
      </div>
    </div>
  </UChatTool>
</template>
