<script setup lang="ts">
const props = defineProps<{ part: ToolPart }>()

type Result = { expression: string, result?: string, error?: string }
const results = computed(() => (props.part.output as { results?: Result[] } | undefined)?.results ?? [])
const expressions = computed(() => (props.part.input as { expressions?: string[] } | undefined)?.expressions ?? [])
const answer = computed(() => results.value.at(-1)?.result)
</script>

<template>
  <UChatTool
    :text="isToolRunning(part) ? 'Calculating...' : 'Calculated'"
    :suffix="answer ? `= ${answer}` : expressions.at(-1)"
    icon="i-lucide-calculator"
    :loading="isToolRunning(part)"
    :error="part.state === 'output-error'"
    chevron="leading"
  >
    <div class="font-mono text-xs border border-default rounded-md divide-y divide-default overflow-x-auto">
      <div
        v-for="(row, index) in (results.length ? results : expressions.map(expression => ({ expression })))"
        :key="index"
        class="flex gap-3 px-3 py-1.5"
      >
        <span class="text-muted whitespace-pre">{{ row.expression }}</span>
        <span
          v-if="'result' in row && row.result"
          class="ms-auto text-highlighted whitespace-pre"
        >= {{ row.result }}</span>
        <span
          v-else-if="'error' in row && row.error"
          class="ms-auto text-error"
        >{{ row.error }}</span>
      </div>
    </div>
  </UChatTool>
</template>
