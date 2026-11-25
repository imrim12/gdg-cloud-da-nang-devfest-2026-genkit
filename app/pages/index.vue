<script setup lang="ts">
const input = ref('')
const loading = ref(false)
const chatId = crypto.randomUUID()

const { user } = useUserSession()

const greeting = computed(() => {
  const hour = new Date().getHours()
  let timeGreeting = 'Good evening'
  if (hour < 12) timeGreeting = 'Good morning'
  else if (hour < 18) timeGreeting = 'Good afternoon'

  const name = user.value?.name?.split(' ')[0]

  return name ? `${timeGreeting}, ${name}` : `${timeGreeting}`
})

const {
  files,
  promptFiles,
  uploading,
  uploadedFiles,
  clearFiles
} = useFileUploadWithStatus(chatId)

async function createChat(prompt: string) {
  input.value = prompt
  loading.value = true

  const parts: Array<{ type: string, text?: string, mediaType?: string, url?: string }> = prompt.trim() ? [{ type: 'text', text: prompt }] : []

  if (uploadedFiles.value.length > 0) {
    parts.push(...uploadedFiles.value)
  }

  const chat = await $fetch('/api/chats', {
    method: 'POST',
    body: {
      id: chatId,
      message: {
        role: 'user',
        parts
      }
    }
  })

  refreshNuxtData('chats')
  navigateTo(`/chat/${chat?.id}`)
}

async function onSubmit() {
  if (uploading.value || (!input.value.trim() && !uploadedFiles.value.length)) return

  await createChat(input.value)
  clearFiles()
}

const quickChats = [
  {
    label: 'Build a landing page for GDG DevFest Đà Nẵng 2026',
    icon: 'i-lucide-app-window'
  },
  {
    label: 'Make a Pomodoro timer app',
    icon: 'i-lucide-timer'
  },
  {
    label: 'Saving 5M VND a month at 6%: total after 10 years?',
    icon: 'i-lucide-calculator'
  },
  {
    label: 'What is new in Genkit this month?',
    icon: 'i-lucide-globe'
  },
  {
    label: 'Explain Genkit flows vs tools, with a small example',
    icon: 'i-simple-icons-firebase'
  },
  {
    label: 'Plan a 2-day food tour of Đà Nẵng',
    icon: 'i-lucide-utensils'
  }
]
</script>

<template>
  <UDashboardPanel
    id="home"
    class="min-h-0"
    :ui="{ body: 'p-0 sm:p-0' }"
  >
    <template #header>
      <Navbar />
    </template>

    <template #body>
      <div class="flex flex-1">
        <UContainer class="flex-1 flex flex-col justify-center gap-4 sm:gap-6 py-8">
          <h1 class="text-3xl sm:text-4xl text-highlighted font-bold">
            {{ greeting }}
          </h1>

          <ChatPrompt
            v-model="input"
            v-model:files="promptFiles"
            :disabled="loading"
            :uploads="files"
            :uploading="uploading"
            class="[view-transition-name:chat-prompt]"
            @submit="onSubmit"
          />

          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="quickChat in quickChats"
              :key="quickChat.label"
              :icon="quickChat.icon"
              :label="quickChat.label"
              size="sm"
              color="neutral"
              variant="outline"
              class="rounded-full max-w-full"
              :ui="{ label: 'truncate' }"
              @click="createChat(quickChat.label)"
            />
          </div>
        </UContainer>
      </div>
    </template>
  </UDashboardPanel>
</template>
