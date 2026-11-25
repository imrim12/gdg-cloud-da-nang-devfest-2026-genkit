<script setup lang="ts">
const { canvas, tab, close } = useCanvas()

// Model-written code: scripts may run, but without allow-same-origin the page gets an opaque origin,
// so it cannot read this app's cookies or call its API as the user
const SANDBOX = 'allow-scripts allow-forms allow-modals allow-popups allow-pointer-lock'

const html = computed(() => canvas.value ? bundleCanvas(canvas.value.files) : '')
const file = ref(0)
watch(() => canvas.value?.id, () => {
  file.value = 0
})

const language = (path: string) => ({ html: 'html', css: 'css', js: 'js', mjs: 'js', ts: 'ts', json: 'json' } as Record<string, string>)[path.split('.').pop() ?? ''] ?? ''
const code = computed(() => {
  const current = canvas.value?.files[file.value]
  return current ? `\`\`\`${language(current.path)}\n${current.content}\n\`\`\`` : ''
})

// Reloads the preview (the iframe is keyed on this)
const reloads = ref(0)

function download() {
  const url = URL.createObjectURL(new Blob([html.value], { type: 'text/html' }))
  const link = Object.assign(document.createElement('a'), { href: url, download: `${(canvas.value?.title ?? 'canvas').replace(/[^\w-]+/g, '-').toLowerCase()}.html` })
  link.click()
  URL.revokeObjectURL(url)
}

defineShortcuts({ escape: () => close() })
</script>

<template>
  <UDashboardPanel
    v-if="canvas"
    id="canvas"
    resizable
    :default-size="45"
    :min-size="30"
    :max-size="70"
    class="max-lg:fixed max-lg:inset-0 max-lg:z-50 bg-default border-s border-default"
    :ui="{ body: 'p-0 sm:p-0 gap-0' }"
  >
    <template #header>
      <UDashboardNavbar
        :toggle="false"
        :ui="{ left: 'min-w-0 gap-2', right: 'gap-1' }"
      >
        <template #left>
          <UIcon
            name="i-lucide-app-window"
            class="size-5 text-primary shrink-0"
          />
          <span class="font-medium text-highlighted truncate">{{ canvas.title }}</span>
          <UBadge
            v-if="canvas.preliminary"
            label="Writing..."
            color="primary"
            variant="soft"
            size="sm"
          />
          <UBadge
            v-else
            :label="`v${canvas.version}`"
            color="neutral"
            variant="soft"
            size="sm"
          />
        </template>

        <template #right>
          <UTabs
            v-model="tab"
            :items="[{ label: 'Preview', value: 'preview', icon: 'i-lucide-eye' }, { label: 'Code', value: 'code', icon: 'i-lucide-code' }]"
            :content="false"
            size="xs"
            color="neutral"
          />
          <UTooltip text="Reload">
            <UButton
              icon="i-lucide-rotate-cw"
              color="neutral"
              variant="ghost"
              size="sm"
              aria-label="Reload preview"
              @click="reloads++"
            />
          </UTooltip>
          <UTooltip text="Download HTML">
            <UButton
              icon="i-lucide-download"
              color="neutral"
              variant="ghost"
              size="sm"
              aria-label="Download HTML"
              @click="download"
            />
          </UTooltip>
          <UTooltip
            text="Close"
            :kbds="['esc']"
          >
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="sm"
              aria-label="Close canvas"
              @click="close"
            />
          </UTooltip>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UAlert
        v-if="canvas.issues?.length"
        icon="i-lucide-triangle-alert"
        color="warning"
        variant="soft"
        title="The sandbox browser reported problems"
        :description="canvas.issues.join(' · ')"
        class="rounded-none"
      />

      <iframe
        v-show="tab === 'preview'"
        v-if="!canvas.preliminary"
        :key="`${canvas.id}-${canvas.version}-${reloads}`"
        :srcdoc="html"
        :sandbox="SANDBOX"
        :title="canvas.title"
        class="flex-1 w-full bg-white"
      />

      <div
        v-if="tab === 'code'"
        class="flex-1 flex flex-col min-h-0"
      >
        <div class="flex gap-1 px-3 py-2 border-b border-default overflow-x-auto">
          <UButton
            v-for="(item, index) in canvas.files"
            :key="item.path"
            :label="item.path"
            size="xs"
            color="neutral"
            :variant="file === index ? 'soft' : 'ghost'"
            @click="file = index"
          />
        </div>
        <div class="flex-1 overflow-auto p-3 text-sm">
          <ChatComark :value="code" />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
