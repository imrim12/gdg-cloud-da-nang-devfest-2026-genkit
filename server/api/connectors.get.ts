/** The connector catalog, with what the user connected and turned on. */
export default defineEventHandler(async (event) => {
  const user = await getUser(event)
  return {
    available: connectorsAvailable(),
    signedIn: user.signedIn,
    connectors: user.signedIn ? await listConnectors(user.id) : await listConnectors('')
  }
})
