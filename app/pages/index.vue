<script setup lang="ts">
const chats = useChats()

function start(text: string) {
  const id = crypto.randomUUID()
  chats.save(id, [{ id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text }] }])
  navigateTo(`/chat/${id}`)
}
</script>

<template>
  <UDashboardPanel id="home">
    <template #header>
      <UDashboardNavbar />
    </template>

    <template #body>
      <UContainer class="flex-1 flex flex-col justify-center gap-6 max-w-3xl">
        <h1 class="text-3xl font-semibold text-center">
          What can I help with?
        </h1>
        <ChatPrompt @send="start" />
      </UContainer>
    </template>
  </UDashboardPanel>
</template>
