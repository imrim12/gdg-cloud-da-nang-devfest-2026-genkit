/**
 * Starts connecting a connector: redirects to the authorization server (Google's consent screen).
 * Opened in a popup by the settings page; ?popup=0 for a full-page redirect.
 */
export default defineEventHandler(async (event) => {
  const user = await connectorUser(event)
  const query = getQuery(event)
  const returnTo = typeof query.returnTo === 'string' && query.returnTo.startsWith('/') && !query.returnTo.startsWith('//') ? query.returnTo : '/'
  const url = await startAuthorization(event, user, getRouterParam(event, 'id')!, { returnTo, popup: query.popup !== '0' })
  return sendRedirect(event, url)
})
