import { z } from 'zod'

const MAX_SIZE = 8 * 1024 * 1024
const TYPES = /^(image\/|application\/pdf$|text\/csv$|text\/plain$)/

/** Uploads one file to Cloud Storage for a chat message; returns its URL as an AI SDK file part. */
export default defineEventHandler(async (event) => {
  const user = await getUser(event)
  if (!features().files) throw createError({ statusCode: 501, statusMessage: 'File uploads need a Cloud Storage bucket (NUXT_GCP_BUCKET).' })

  const chatId = z.string().uuid().parse(getRouterParam(event, 'chatId'))
  const chat = await useStore().getChat(chatId)
  if (chat && chat.userId !== user.id) throw createError({ statusCode: 403, statusMessage: 'Not your chat' })

  const file = (await readMultipartFormData(event))?.find(part => part.name === 'files' && part.filename)
  if (!file) throw createError({ statusCode: 400, statusMessage: 'No file' })
  const type = file.type ?? 'application/octet-stream'
  if (!TYPES.test(type)) throw createError({ statusCode: 415, statusMessage: 'Only images, PDF, CSV and text files' })
  if (file.data.length > MAX_SIZE) throw createError({ statusCode: 413, statusMessage: 'Files are limited to 8 MB' })

  const name = file.filename!.replace(/[^\w.-]+/g, '_').slice(-80)
  const pathname = `users/${user.id}/${chatId}/${crypto.randomUUID().slice(0, 8)}-${name}`
  const url = await bucket.save(pathname, file.data, type)
  return { pathname, url, contentType: type, size: file.data.length }
})
