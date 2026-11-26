export type SettingsTab = 'general' | 'memory' | 'connectors'

/** The settings modal (instructions, memory, connectors) and the user's settings. */
export function useSettings() {
  const open = useState('settings-open', () => false)
  const tab = useState<SettingsTab>('settings-tab', () => 'general')
  const settings = useState<UserSettings | null>('settings', () => null)
  const toast = useToast()

  async function load() {
    settings.value = await $fetch<UserSettings>('/api/settings')
  }

  /** Saves a change right away, and rolls it back if the server refuses it. */
  async function update(patch: Partial<UserSettings>) {
    const previous = settings.value
    if (settings.value) settings.value = { ...settings.value, ...patch }
    try {
      settings.value = await $fetch<UserSettings>('/api/settings', { method: 'PATCH', body: patch })
    } catch (error) {
      settings.value = previous
      toast.add({ description: (error as Error).message || 'Could not save the setting', icon: 'i-lucide-alert-circle', color: 'error' })
    }
  }

  function show(next: SettingsTab = 'general') {
    if (!useSignInGate().requireSignIn('to open settings')) return
    tab.value = next
    open.value = true
  }

  return { open, tab, settings, load, update, show }
}
