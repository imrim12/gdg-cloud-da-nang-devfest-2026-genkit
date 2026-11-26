<script setup lang="ts">
import type { SettingsTab } from '~/composables/useSettings'

const { open, tab, settings, load } = useSettings()

const tabs: { value: SettingsTab, label: string, icon: string }[] = [
  { value: 'general', label: 'General', icon: 'i-lucide-sliders-horizontal' },
  { value: 'memory', label: 'Memory', icon: 'i-lucide-brain' },
  { value: 'connectors', label: 'Connectors', icon: 'i-lucide-plug' }
]

// Clicking the current tab again goes back to its first page (e.g. from the memory manager)
const page = ref(0)
function select(value: SettingsTab) {
  if (tab.value === value) page.value++
  tab.value = value
}

watch(open, (value) => {
  if (value && !settings.value) load().catch(error => console.error('Could not load settings', error))
})
</script>

<template>
  <UModal
    v-model:open="open"
    title="Settings"
    :ui="{ content: 'sm:max-w-4xl', body: 'p-0 sm:p-0' }"
  >
    <template #body>
      <div class="flex flex-col sm:flex-row h-[min(40rem,80vh)]">
        <nav class="flex sm:flex-col gap-1 p-2 sm:p-3 sm:w-48 shrink-0 border-b sm:border-b-0 sm:border-e border-default overflow-x-auto">
          <UButton
            v-for="item in tabs"
            :key="item.value"
            :label="item.label"
            :icon="item.icon"
            color="neutral"
            :variant="tab === item.value ? 'soft' : 'ghost'"
            class="justify-start"
            @click="select(item.value)"
          />
        </nav>
        <div class="flex-1 min-w-0 min-h-0 p-4 sm:p-6 overflow-y-auto flex flex-col">
          <SettingsGeneral v-if="tab === 'general'" />
          <SettingsMemory
            v-else-if="tab === 'memory'"
            :key="page"
            class="flex-1 min-h-0"
          />
          <SettingsConnectors v-else />
        </div>
      </div>
    </template>
  </UModal>
</template>
