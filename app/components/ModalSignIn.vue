<script setup lang="ts">
const { open, reason } = useSignInGate()
const { signIn } = useUserSession()
const signingIn = ref(false)

async function start() {
  signingIn.value = true
  try {
    await signIn()
  } finally {
    signingIn.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Sign in to continue"
    :description="`Sign in with your Google account ${reason}.`"
    :ui="{ content: 'sm:max-w-md' }"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <ul class="text-sm text-muted flex flex-col gap-2">
          <li class="flex items-center gap-2">
            <UIcon
              name="i-lucide-messages-square"
              class="size-4 shrink-0"
            />
            Your chats are saved and follow you across devices
          </li>
          <li class="flex items-center gap-2">
            <UIcon
              name="i-lucide-brain"
              class="size-4 shrink-0"
            />
            The assistant remembers what matters to you
          </li>
          <li class="flex items-center gap-2">
            <UIcon
              name="i-lucide-plug"
              class="size-4 shrink-0"
            />
            Connect Gmail, Drive, Docs and Sheets
          </li>
        </ul>
        <UButton
          label="Continue with Google"
          icon="i-simple-icons-google"
          size="lg"
          block
          :loading="signingIn"
          @click="start"
        />
      </div>
    </template>
  </UModal>
</template>
