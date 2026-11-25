import type { H3Event } from 'h3'

const YEAR = 60 * 60 * 24 * 365

export interface User {
  /** Who owns chats: the Google account id when signed in, else an anonymous cookie id. */
  id: string
  name?: string
  email?: string
  image?: string | null
  signedIn: boolean
}

/** The signed-in user, or an anonymous visitor identified by a cookie. */
export async function getUser(event: H3Event): Promise<User> {
  const cached = event.context.user as User | undefined
  if (cached) return cached

  let anonymous = getCookie(event, 'uid')
  let user: User | undefined

  if (useRuntimeConfig().public.auth) {
    const session = await useAuth().api.getSession({ headers: event.headers }).catch(() => null)
    if (session) {
      user = { id: session.user.id, name: session.user.name, email: session.user.email, image: session.user.image, signedIn: true }
      // First request after signing in: the chats made anonymously move to the account
      if (anonymous) {
        await adoptChats(anonymous, user.id)
        deleteCookie(event, 'uid')
      }
    }
  }

  if (!user) {
    if (!anonymous) {
      anonymous = crypto.randomUUID()
      setCookie(event, 'uid', anonymous, { httpOnly: true, sameSite: 'lax', secure: !import.meta.dev, maxAge: YEAR })
    }
    user = { id: anonymous, signedIn: false }
  }

  event.context.user = user
  return user
}

async function adoptChats(from: string, to: string) {
  const store = useStore()
  const chats = await store.listChats(from)
  await Promise.all(chats.map(chat => store.updateChat(chat.id, { userId: to })))
}
