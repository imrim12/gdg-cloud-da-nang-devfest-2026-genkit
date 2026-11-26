/** The connector catalog, with what the user connected and turned on. */
export default defineEventHandler(async (event) => {
  const user = await getUser(event)
  return {
    available: connectorsAvailable(),
    signedIn: user.signedIn,
    connectors: await listConnectors(user.signedIn ? user.id : undefined)
  }
})
