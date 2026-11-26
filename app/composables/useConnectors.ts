import { useEventListener } from '@vueuse/core'

interface ConnectorsResponse {
  available: boolean
  signedIn: boolean
  connectors: ConnectorInfo[]
}

/** Connectors (MCP servers): connect with OAuth in a popup, turn their tools on or off. */
export function useConnectors() {
  const toast = useToast()
  const { data, refresh, status } = useFetch<ConnectorsResponse>('/api/connectors', { key: 'connectors', lazy: true, server: false })
  const connecting = useState<string | null>('connector-connecting', () => null)

  const connectors = computed(() => data.value?.connectors ?? [])
  const connected = computed(() => connectors.value.filter(c => c.connected))

  /** Opens the authorization server in a popup; falls back to a full-page redirect if popups are blocked. */
  function connect(id: string) {
    const url = `/api/connectors/${id}/authorize?returnTo=${encodeURIComponent(location.pathname)}`
    const popup = window.open(url, `connect-${id}`, 'popup,width=520,height=720')
    if (!popup) {
      location.href = `${url}&popup=0`
      return
    }
    connecting.value = id
    const timer = setInterval(() => {
      if (!popup.closed) return
      clearInterval(timer)
      if (connecting.value === id) connecting.value = null
      refresh()
    }, 500)
  }

  /** The result of a connection, from the popup (postMessage) or a full-page redirect (query). */
  function connected$(id: string | undefined, error?: string) {
    connecting.value = null
    const name = connectors.value.find(c => c.id === id)?.name ?? 'Connector'
    if (error) toast.add({ title: 'Could not connect', description: error, icon: 'i-lucide-alert-circle', color: 'error', duration: 0 })
    else toast.add({ title: `${name} connected`, description: 'Its tools are now available in chats.', icon: 'i-lucide-plug' })
    refresh()
  }

  /** Call once (layout): listens for the popup's message. */
  function listen() {
    useEventListener(window, 'message', (event: MessageEvent) => {
      if (event.origin === location.origin && event.data?.type === 'connector') connected$(event.data.id, event.data.error)
    })
  }

  async function setEnabled(id: string, enabled: boolean) {
    const target = data.value?.connectors.find(c => c.id === id)
    if (target) target.enabled = enabled
    try {
      await $fetch(`/api/connectors/${id}`, { method: 'PATCH', body: { enabled } })
    } catch (error) {
      if (target) target.enabled = !enabled
      toast.add({ description: (error as Error).message, icon: 'i-lucide-alert-circle', color: 'error' })
    }
  }

  async function disconnect(id: string) {
    await $fetch(`/api/connectors/${id}`, { method: 'DELETE' })
    await refresh()
  }

  return { data, connectors, connected, status, connecting, refresh, connect, setEnabled, disconnect, listen, onConnected: connected$ }
}
