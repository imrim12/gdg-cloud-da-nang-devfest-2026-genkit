<script setup lang="ts">
const { data, connectors, status, connecting, connect, setEnabled, disconnect } = useConnectors()
const { signIn } = useUserSession()
const toast = useToast()

const disconnecting = ref<string | null>(null)
async function remove(connector: ConnectorInfo) {
  disconnecting.value = connector.id
  try {
    await disconnect(connector.id)
    toast.add({ description: `${connector.name} disconnected`, icon: 'i-lucide-unplug' })
  } catch (error) {
    toast.add({ description: (error as Error).message, icon: 'i-lucide-alert-circle', color: 'error' })
  } finally {
    disconnecting.value = null
  }
}
</script>

<template>
  <div>
    <h3 class="font-semibold text-highlighted">
      Connectors
    </h3>
    <p class="text-sm text-muted">
      Let the assistant use your Google apps. Each one is a remote MCP server from Google, authorized with OAuth.
    </p>

    <UAlert
      v-if="data && !data.available"
      class="mt-3"
      color="neutral"
      variant="subtle"
      icon="i-lucide-info"
      title="Connectors are off on this server"
      description="They need Sign in with Google (README, part 6) and the Google Workspace MCP APIs (part 6b)."
    />
    <UAlert
      v-else-if="data && !data.signedIn"
      class="mt-3"
      color="neutral"
      variant="subtle"
      icon="i-simple-icons-google"
      title="Sign in to connect your apps"
      description="Connectors belong to your Google account."
      :actions="[{ label: 'Sign in with Google', color: 'neutral', variant: 'outline', onClick: () => signIn() }]"
    />

    <div class="mt-2">
      <div
        v-if="status === 'pending' && !data"
        class="flex flex-col gap-3 pt-2"
      >
        <USkeleton
          v-for="i in 4"
          :key="i"
          class="h-12 w-full"
        />
      </div>
      <div
        v-for="connector in connectors"
        :key="connector.id"
        class="flex items-center gap-3 py-3 border-b border-default last:border-b-0"
      >
        <div class="size-9 rounded-lg ring ring-default flex items-center justify-center shrink-0">
          <UIcon
            :name="connector.icon"
            :class="['size-5', CONNECTOR_COLORS[connector.id]]"
          />
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium text-highlighted flex items-center gap-2">
            {{ connector.name }}
            <UBadge
              v-if="connector.needsReconnect"
              label="Reconnect needed"
              color="warning"
              variant="subtle"
              size="sm"
            />
          </p>
          <p class="text-sm text-muted truncate">
            {{ connector.connected && connector.account ? connector.account : connector.description }}
          </p>
        </div>

        <template v-if="connector.connected && !connector.needsReconnect">
          <USwitch
            :model-value="connector.enabled"
            :aria-label="`Use ${connector.name} in chats`"
            @update:model-value="setEnabled(connector.id, $event)"
          />
          <UDropdownMenu
            :items="[[{ label: 'Disconnect', icon: 'i-lucide-unplug', color: 'error', onSelect: () => remove(connector) }]]"
            :content="{ align: 'end' }"
          >
            <UButton
              icon="i-lucide-ellipsis"
              color="neutral"
              variant="ghost"
              size="sm"
              :loading="disconnecting === connector.id"
              :aria-label="`${connector.name} options`"
            />
          </UDropdownMenu>
        </template>
        <UButton
          v-else
          :label="connector.needsReconnect ? 'Reconnect' : 'Connect'"
          color="neutral"
          variant="outline"
          size="sm"
          :loading="connecting === connector.id"
          :disabled="!data?.available || !data?.signedIn"
          @click="connect(connector.id)"
        />
      </div>
    </div>

    <p class="text-xs text-dimmed mt-3">
      The assistant drafts emails rather than sending them, and asks before deleting anything. Tokens are encrypted, and disconnecting revokes them.
    </p>
  </div>
</template>
