<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

const props = defineProps<{
  open: () => void
}>()

const { canUpload } = useUserSession()
const { webSearch, reasoning } = useChatSettings()
const { connectors, setEnabled } = useConnectors()
const settings = useSettings()

defineShortcuts({
  meta_u: {
    usingInput: true,
    handler: () => {
      if (canUpload.value) {
        props.open()
      }
    }
  }
})

const items = computed<DropdownMenuItem[][]>(() => [[{
  label: 'Add files or photos',
  icon: 'i-lucide-paperclip',
  kbds: ['meta', 'U'],
  disabled: !canUpload.value,
  description: canUpload.value ? undefined : 'Needs a Cloud Storage bucket',
  onSelect: () => props.open()
}], [{
  label: 'Web search',
  icon: 'i-lucide-globe',
  type: 'checkbox',
  checked: webSearch.value,
  onUpdateChecked: (checked: boolean) => {
    webSearch.value = checked
  },
  onSelect: (e: Event) => e.preventDefault()
}, {
  label: 'Extended thinking',
  icon: 'i-lucide-brain',
  type: 'checkbox',
  checked: reasoning.value,
  onUpdateChecked: (checked: boolean) => {
    reasoning.value = checked
  },
  onSelect: (e: Event) => e.preventDefault()
}], [{
  label: 'Connectors',
  icon: 'i-lucide-plug',
  children: [
    connectors.value.map(connector => connector.connected && !connector.needsReconnect
      ? {
          label: connector.name,
          icon: connector.icon,
          type: 'checkbox' as const,
          checked: connector.enabled,
          ui: { itemLeadingIcon: CONNECTOR_COLORS[connector.id] },
          onUpdateChecked: (checked: boolean) => setEnabled(connector.id, checked),
          onSelect: (e: Event) => e.preventDefault()
        }
      : {
          label: connector.name,
          icon: connector.icon,
          ui: { itemLeadingIcon: CONNECTOR_COLORS[connector.id] },
          suffix: connector.needsReconnect ? 'Reconnect' : 'Connect',
          onSelect: () => settings.show('connectors')
        }),
    [{
      label: 'Manage connectors',
      icon: 'i-lucide-settings',
      onSelect: () => settings.show('connectors')
    }]
  ]
}]])
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ side: 'top', align: 'start', alignOffset: -4 }"
    :ui="{ content: 'w-56' }"
    size="sm"
  >
    <UButton
      icon="i-lucide-plus"
      color="neutral"
      variant="ghost"
      size="sm"
      aria-label="Open prompt menu"
      class="data-[state=open]:bg-elevated"
    />
  </UDropdownMenu>
</template>
