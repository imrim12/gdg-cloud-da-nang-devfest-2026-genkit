import { z } from 'zod'

/** Turns a connected connector's tools on or off for the agent. */
export default defineEventHandler(async (event) => {
  const user = await connectorUser(event)
  const { enabled } = await readValidatedBody(event, z.object({ enabled: z.boolean() }).parse)
  const id = connector(getRouterParam(event, 'id')!).id
  if (!await useStore().getConnection(user.id, id)) throw createError({ statusCode: 404, statusMessage: 'Not connected' })
  await useStore().updateConnection(user.id, id, { enabled })
  return { ok: true }
})
