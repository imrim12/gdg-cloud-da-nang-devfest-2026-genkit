import { Storage } from '@google-cloud/storage'

const storage = new Storage()

const file = (path: string) => storage.bucket(useRuntimeConfig().gcp.bucket).file(path)

/** Cloud Storage for uploads and files the agent saves. Paths are scoped per user: users/{userId}/... */
export const bucket = {
  /** Saves a file and returns its download URL. */
  async save(path: string, data: string | Buffer, contentType?: string) {
    await file(path).save(data, { contentType, resumable: false })
    return `/api/files/${path}`
  },

  async read(path: string) {
    const target = file(path)
    const [metadata] = await target.getMetadata()
    return { stream: target.createReadStream(), contentType: metadata.contentType }
  },

  async download(path: string) {
    const [data] = await file(path).download()
    return data
  },

  async remove(path: string) {
    await file(path).delete({ ignoreNotFound: true })
  }
}
