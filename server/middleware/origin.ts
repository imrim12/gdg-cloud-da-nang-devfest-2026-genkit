/**
 * CSRF protection: state-changing API requests must come from this site. Browsers always send
 * Origin on cross-site POST/PUT/PATCH/DELETE, so a foreign origin is rejected.
 */
export default defineEventHandler((event) => {
  if (!event.path.startsWith('/api/') || ['GET', 'HEAD', 'OPTIONS'].includes(event.method)) return

  const origin = getHeader(event, 'origin')
  if (origin && new URL(origin).host !== getRequestHost(event, { xForwardedHost: true })) {
    throw createError({ statusCode: 403, statusMessage: 'Cross-site request blocked' })
  }
})
