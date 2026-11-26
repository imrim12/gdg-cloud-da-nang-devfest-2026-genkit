<script setup lang="ts">
const { settings, update } = useSettings()
const { session } = useUserSession()

const memoryAvailable = computed(() => !!session.value?.features.memory)
const view = ref<'settings' | 'manager' | 'import'>('settings')
</script>

<template>
  <SettingsMemoryManager
    v-if="view === 'manager'"
    @back="view = 'settings'"
  />
  <SettingsMemoryImport
    v-else-if="view === 'import'"
    @back="view = 'settings'"
    @done="view = 'manager'"
  />
  <div v-else>
    <h3 class="font-semibold text-highlighted">
      Memory
    </h3>
    <UAlert
      v-if="!memoryAvailable"
      class="mt-3"
      color="neutral"
      variant="subtle"
      icon="i-lucide-info"
      title="Memory is off on this server"
      description="It needs Agent Platform Memory Bank (README, part 5). Searching earlier chats works without it."
    />

    <SettingsRow
      label="Search and reference chats"
      description="Let the assistant search your earlier chats when they are relevant."
    >
      <USwitch
        :model-value="settings?.searchChats"
        :disabled="!settings"
        aria-label="Search and reference chats"
        @update:model-value="update({ searchChats: $event })"
      />
    </SettingsRow>

    <SettingsRow
      label="Generate memory from chats"
      description="Let the assistant learn about you from your chats, and use what it learned in new chats."
    >
      <USwitch
        :model-value="memoryAvailable && settings?.generateMemory"
        :disabled="!settings || !memoryAvailable"
        aria-label="Generate memory from chats"
        @update:model-value="update({ generateMemory: $event })"
      />
    </SettingsRow>

    <SettingsRow
      label="Assistant's memory"
      description="View, add, edit or delete what's in memory."
    >
      <UButton
        label="Open"
        color="neutral"
        variant="soft"
        :disabled="!memoryAvailable"
        @click="view = 'manager'"
      />
    </SettingsRow>

    <SettingsRow
      label="Import memory from other AI providers"
      description="Bring what ChatGPT, Gemini or Claude know about you. We give you a prompt to get it from your other account."
    >
      <UButton
        label="Start import"
        color="neutral"
        variant="soft"
        :disabled="!memoryAvailable"
        @click="view = 'import'"
      />
    </SettingsRow>

    <p class="text-xs text-dimmed mt-2">
      Memories are kept in Agent Platform Memory Bank, separately for each person. It extracts facts from chats, merges them with what it already knows, and sorts them into topics.
    </p>
  </div>
</template>
