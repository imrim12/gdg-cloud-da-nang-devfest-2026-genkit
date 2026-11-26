import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

/** AES-256-GCM with a key derived from NUXT_AUTH_SECRET: OAuth tokens and state are encrypted at rest. */
const key = () => createHash('sha256').update(`connectors:${useRuntimeConfig().auth.secret}`).digest()

export function seal(value: unknown): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url')
}

export function unseal<T>(sealed: string): T {
  const raw = Buffer.from(sealed, 'base64url')
  const decipher = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12))
  decipher.setAuthTag(raw.subarray(12, 28))
  return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')) as T
}

/** unseal, or undefined when the value was tampered with or the secret changed. */
export function tryUnseal<T>(sealed: string): T | undefined {
  try {
    return unseal<T>(sealed)
  } catch {
    return undefined
  }
}
