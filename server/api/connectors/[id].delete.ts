/** Disconnects: revokes the token at the authorization server and forgets it. */
export default defineEventHandler(async (event) => {
  const user = await connectorUser(event)
  await disconnect(user.id, getRouterParam(event, 'id')!)
  return { ok: true }
})
