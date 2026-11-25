/** Downloads a saved file. Users can only read their own files. */
export default defineEventHandler(async (event) => {
  const path = getRouterParam(event, 'path') ?? ''
  const { id } = await getUser(event)
  if (!features().files || !path.startsWith(`users/${id}/`) || path.includes('..')) {
    throw createError({ statusCode: 404 })
  }

  const { stream, contentType } = await bucket.read(path).catch(() => {
    throw createError({ statusCode: 404 })
  })
  setHeader(event, 'Content-Type', contentType ?? 'application/octet-stream')
  return sendStream(event, stream)
})
