import type { H3Event } from 'h3'

const YEAR = 60 * 60 * 24 * 365

/** The signed-in user, or an anonymous visitor identified by a cookie. */
export async function getUser(event: H3Event): Promise<{ id: string }> {
  if (useRuntimeConfig().public.auth) {
    const session = await useAuth().api.getSession({ headers: event.headers })
    if (session) return { id: session.user.id }
  }

  let id = getCookie(event, 'uid')
  if (!id) {
    id = crypto.randomUUID()
    setCookie(event, 'uid', id, { httpOnly: true, sameSite: 'lax', secure: !import.meta.dev, maxAge: YEAR })
  }
  return { id }
}
