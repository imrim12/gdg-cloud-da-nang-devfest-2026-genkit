const PENDING_KEY = 'pending-prompt'
/** A message typed before signing in is sent after, if the sign-in finishes within this time. */
const PENDING_TTL = 30 * 60_000

/**
 * With Sign in with Google configured, visitors can look around and type, but sending a message,
 * opening settings, attaching files, voice and connectors ask them to sign in first.
 * The server enforces the same rule (server/middleware/auth.ts).
 */
export function useSignInGate() {
  const { loggedIn, authEnabled } = useUserSession()
  const open = useState('sign-in-open', () => false)
  const reason = useState('sign-in-reason', () => '')

  /** True when the action can go ahead; otherwise opens the sign-in dialog. */
  function requireSignIn(why: string, pending?: string) {
    if (!authEnabled.value || loggedIn.value) return true
    if (pending?.trim()) {
      try {
        localStorage.setItem(PENDING_KEY, JSON.stringify({ text: pending, at: Date.now() }))
      } catch {
        // Private mode: the message is not kept, the user types it again
      }
    }
    reason.value = why
    open.value = true
    return false
  }

  /** The message typed before signing in, once (it is removed when read). */
  function takePending(): string | undefined {
    try {
      const raw = localStorage.getItem(PENDING_KEY)
      localStorage.removeItem(PENDING_KEY)
      const pending = raw ? JSON.parse(raw) as { text: string, at: number } : undefined
      return pending && Date.now() - pending.at < PENDING_TTL ? pending.text : undefined
    } catch {
      return undefined
    }
  }

  return { open, reason, requireSignIn, takePending }
}
