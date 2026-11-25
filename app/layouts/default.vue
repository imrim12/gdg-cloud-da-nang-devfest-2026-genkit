<script setup lang="ts">
const chats = useChats()
const route = useRoute()
const { public: { auth } } = useRuntimeConfig()

const items = computed(() => chats.list.value.map(chat => ({
  label: chat.title,
  to: `/chat/${chat.id}`,
  slot: 'chat' as const,
  id: chat.id,
})))

function remove(id: string) {
  chats.remove(id)
  if (route.params.id === id) navigateTo('/')
}
</script>

<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar
      collapsible
      resizable
      :ui="{ footer: 'border-t border-default' }"
    >
      <template #header="{ collapsed }">
        <UButton
          icon="i-lucide-square-pen"
          :label="collapsed ? undefined : 'New chat'"
          to="/"
          color="neutral"
          variant="soft"
          block
        />
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu
          v-if="!collapsed"
          :items="items"
          orientation="vertical"
        >
          <template #chat-trailing="{ item }">
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="link"
              size="xs"
              class="opacity-0 group-hover:opacity-100"
              aria-label="Delete chat"
              @click.prevent.stop="remove(item.id)"
            />
          </template>
        </UNavigationMenu>
      </template>

      <template
        v-if="auth"
        #footer="{ collapsed }"
      >
        <AppUser :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <slot />
  </UDashboardGroup>
</template>
