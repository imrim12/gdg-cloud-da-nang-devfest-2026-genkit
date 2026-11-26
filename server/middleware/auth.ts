/**
 * With Sign in with Google configured (NUXT_PUBLIC_AUTH), the API is for signed-in users only.
 * Visitors can still load the home page (session, models, connector catalog, an empty chat list)
 * and read chats that were shared publicly. The browser asks them to sign in as soon as they send
 * a message or open settings (app/composables/useSignInGate.ts); this enforces it on the server.
 */
const OPEN_GETS = [/^\/api\/session$/, /^\/api\/models$/, /^\/api\/connectors$/, /^\/api\/chats$/, /^\/api\/chats\/[^/]+$/]

export default defineEventHandler(async (event) => {
  if (!useRuntimeConfig().public.auth || !event.path.startsWith('/api/')) return
  const path = event.path.split('?')[0]!
  // Better Auth's own routes: signing in and out
  if (path.startsWith('/api/auth/')) return
  if (event.method === 'GET' && OPEN_GETS.some(pattern => pattern.test(path))) return
  if (!(await getUser(event)).signedIn) {
    throw createError({ statusCode: 401, statusMessage: 'Sign in with Google to continue' })
  }
})
