<script setup lang="ts">
const id = useRoute().params.id as string
const { messages, status, error, send, reload, stop } = useChat(id)
const title = computed(() => useChats().get(id)?.title)

// A chat started from the home page arrives with an unanswered message.
onMounted(() => {
  if (messages.value.at(-1)?.role === 'user') reload()
})
</script>

<template>
  <UDashboardPanel
    id="chat"
    :ui="{ body: 'p-0 sm:p-0' }"
  >
    <template #header>
      <UDashboardNavbar :title="title" />
    </template>

    <template #body>
      <UContainer class="flex-1 flex flex-col gap-4 sm:gap-6 max-w-3xl py-6">
        <UChatMessages
          :messages="messages"
          :status="status"
          should-auto-scroll
          class="flex-1"
        >
          <template #content="{ message }">
            <ChatContent :message="message" />
          </template>
          <template #footer>
            <UAlert
              v-if="error"
              :description="error.message"
              color="error"
              variant="subtle"
              icon="i-lucide-circle-alert"
            />
            <ChatPrompt
              :status="status"
              :error="error"
              class="sticky bottom-0"
              @send="send"
              @stop="stop"
              @reload="reload"
            />
          </template>
        </UChatMessages>
      </UContainer>
    </template>
  </UDashboardPanel>
</template>
