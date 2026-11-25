/**
 * Agent Platform sandboxes: code execution, shell and computer use.
 * One sandbox per chat and kind, created on first use and expired by its TTL.
 */
type Kind = 'code' | 'shell' | 'browser'

export type Chunk = {
  mimeType?: string
  data?: string // base64
  metadata?: { attributes?: Record<string, string> } // values are base64
}

type Sandbox = {
  name: string
  connectionInfo?: { loadBalancerHostname?: string, routingToken?: string }
}

function spec(kind: Kind) {
  const { gcp } = useRuntimeConfig()
  switch (kind) {
    case 'code': return { spec: { codeExecutionEnvironment: { codeLanguage: 'LANGUAGE_PYTHON' } } }
    case 'shell': return { spec: { shellEnvironment: {} }, sandboxEnvironmentTemplate: gcp.shellTemplate }
    case 'browser': return { spec: { computerUseEnvironment: {} }, sandboxEnvironmentTemplate: gcp.browserTemplate }
  }
}

export const encode = (value: string | Uint8Array) => Buffer.from(value).toString('base64')
export const decode = (value = '') => Buffer.from(value, 'base64')

export const sandbox = {
  /** The chat's sandbox of this kind, created if it does not exist yet. */
  async get(kind: Kind, chatId: string): Promise<Sandbox> {
    const storage = useStorage('sandboxes')
    const key = `${kind}:${chatId}`
    const cached = await storage.getItem<string>(key)
    if (cached) {
      try {
        return await gcp<Sandbox>(`${platform()}/${cached}`)
      }
      catch {
        await storage.removeItem(key) // expired
      }
    }
    const created = await operation<Sandbox>(`${platform()}/${useRuntimeConfig().gcp.engine}/sandboxEnvironments`, {
      displayName: key,
      ttl: '3600s',
      ...spec(kind),
    })
    await storage.setItem(key, created.name)
    return await gcp<Sandbox>(`${platform()}/${created.name}`)
  },

  async execute(name: string, inputs: Chunk[]): Promise<Chunk[]> {
    const { outputs } = await gcp<{ outputs?: Chunk[] }>(`${platform()}/${name}:execute`, { inputs })
    return outputs ?? []
  },
}
