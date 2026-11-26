interface Session {
  auth: boolean
  features: { files: boolean, memory: boolean, connectors: boolean }
  user: { name?: string, email?: string, image?: string | null } | null
  /** Bring your own key: each user adds their own Gemini API key. */
  byot: boolean
  hasGeminiKey: boolean
}

/** The visitor: anonymous by cookie, or signed in with Google (Better Auth). Loaded by plugins/session.ts. */
export function useUserSession() {
  const session = useState<Session | null>('session', () => null)

  async function fetchSession() {
    session.value = await $fetch<Session>('/api/session')
  }

  async function signIn() {
    const { createAuthClient } = await import('better-auth/vue')
    await createAuthClient().signIn.social({ provider: 'google', callbackURL: window.location.pathname })
  }

  async function signOut() {
    const { createAuthClient } = await import('better-auth/vue')
    await createAuthClient().signOut()
    await fetchSession()
    await refreshNuxtData('chats')
    navigateTo('/')
  }

  return {
    session,
    user: computed(() => session.value?.user ?? null),
    loggedIn: computed(() => !!session.value?.user),
    authEnabled: computed(() => !!session.value?.auth),
    canUpload: computed(() => !!session.value?.features.files),
    needsGeminiKey: computed(() => !!session.value?.byot && !session.value.hasGeminiKey),
    fetchSession,
    signIn,
    signOut
  }
}
