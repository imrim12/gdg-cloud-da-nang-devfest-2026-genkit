/** Removes an upload that was taken out of the prompt before sending. */
export default defineEventHandler(async (event) => {
  const user = await getUser(event)
  const pathname = getRouterParam(event, 'pathname') ?? ''
  if (!features().files || !pathname.startsWith(`users/${user.id}/`) || pathname.includes('..')) {
    throw createError({ statusCode: 404 })
  }
  await bucket.remove(pathname)
  return { success: true }
})
