import { GoogleAuth } from 'google-auth-library'

const client = new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' })

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'

/** Authenticated JSON request to a Google Cloud REST API (uses Application Default Credentials). */
export async function gcp<T>(url: string, body?: unknown, method: Method = body === undefined ? 'GET' : 'POST'): Promise<T> {
  const { data } = await client.request<T>({ url, method, data: body })
  return data
}

/** Base URL of the Agent Platform (Vertex AI) v1beta1 API. */
export const platform = () => `https://${useRuntimeConfig().gcp.location}-aiplatform.googleapis.com/v1beta1`

type Operation<T> = { name: string, done?: boolean, response?: T, error?: { message: string } }

/** Starts a long-running operation and waits for it to finish. */
export async function operation<T>(url: string, body?: unknown, method?: Method): Promise<T> {
  let op = await gcp<Operation<T>>(url, body, method)
  while (!op.done) {
    await new Promise(resolve => setTimeout(resolve, 1000))
    op = await gcp<Operation<T>>(`${platform()}/${op.name}`)
  }
  if (op.error) throw new Error(op.error.message)
  return op.response as T
}
