<script setup lang="ts">
const props = defineProps<{ part: ToolPart, streaming: boolean }>()

const { canvas: current, open } = useCanvas()
const output = computed(() => props.part.output as Canvas | undefined)
const request = computed(() => (props.part.input as { request?: string } | undefined)?.request)
const running = computed(() => isToolRunning(props.part))
const isOpen = computed(() => !!output.value && current.value?.id === output.value.id && current.value?.version === output.value.version)

const writing = computed(() => !!output.value?.preliminary)

// While streaming: the code shows up live in the panel, then the preview opens when it is done
watch(output, (value) => {
  if (!value || !props.streaming) return
  if (value.preliminary) {
    if (!current.value || current.value.id === value.id) open(value, 'code')
  } else {
    open(value, 'preview')
  }
})
</script>

<template>
  <div class="rounded-lg border border-default bg-elevated/30 p-3 flex items-center gap-3 my-2">
    <div class="size-10 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
      <UIcon
        :name="running ? 'i-lucide-loader-circle' : part.state === 'output-error' ? 'i-lucide-triangle-alert' : 'i-lucide-app-window'"
        :class="['size-5', running && 'animate-spin']"
      />
    </div>

    <div class="flex-1 min-w-0">
      <p class="text-sm font-medium text-highlighted truncate">
        <UChatShimmer
          v-if="running"
          text="Building canvas..."
        />
        <template v-else-if="output">
          {{ output.title }}
        </template>
        <template v-else>
          Canvas failed
        </template>
      </p>
      <p class="text-xs text-muted truncate">
        <template v-if="output && writing">
          {{ output.files.reduce((lines, file) => lines + (file.content?.split('\n').length ?? 0), 0) }} lines so far
        </template>
        <template v-else-if="output">
          Version {{ output.version }} · {{ output.files.length }} file{{ output.files.length === 1 ? '' : 's' }}
          <template v-if="output.screenshot">
            · checked in the sandbox browser
          </template>
        </template>
        <template v-else-if="part.state === 'output-error'">
          {{ part.errorText }}
        </template>
        <template v-else>
          {{ request }}
        </template>
      </p>
    </div>

    <UButton
      v-if="output && !writing"
      :label="isOpen ? 'Opened' : 'Open'"
      :icon="isOpen ? 'i-lucide-panel-right-open' : 'i-lucide-panel-right'"
      size="sm"
      color="neutral"
      :variant="isOpen ? 'soft' : 'outline'"
      @click="open(output)"
    />
  </div>
</template>
