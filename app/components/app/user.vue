<script setup lang="ts">
defineProps<{ collapsed?: boolean }>()

const session = auth.useSession()
const signIn = () => auth.signIn.social({ provider: 'google' })
</script>

<template>
  <UDropdownMenu
    v-if="session.data"
    :items="[{ label: 'Sign out', icon: 'i-lucide-log-out', onSelect: () => auth.signOut() }]"
  >
    <UButton
      :avatar="{ src: session.data.user.image ?? undefined, alt: session.data.user.name }"
      :label="collapsed ? undefined : session.data.user.name"
      color="neutral"
      variant="ghost"
      block
      :square="collapsed"
      class="justify-start"
    />
  </UDropdownMenu>
  <UButton
    v-else
    icon="i-simple-icons-google"
    :label="collapsed ? undefined : 'Sign in with Google'"
    color="neutral"
    variant="outline"
    block
    :loading="session.isPending"
    @click="signIn"
  />
</template>
