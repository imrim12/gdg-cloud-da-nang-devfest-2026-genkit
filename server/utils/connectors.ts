import type { H3Event } from 'h3'
import type { JSONSchema7 } from 'json-schema'
import { ai } from '../genkit'

/**
 * Connectors: remote MCP servers the user authorizes with OAuth, whose tools the agent can use.
 * The client and the authorization flow are generic MCP (server/utils/mcp.ts); this catalog lists
 * Google's Workspace MCP servers. Each one asks only for the scopes its tools need.
 */
export const CONNECTORS = [
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Search and read email, draft replies, organize with labels',
    icon: 'i-logos-google-gmail',
    url: 'https://gmailmcp.googleapis.com/mcp/v1',
    scopes: ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.compose', 'https://www.googleapis.com/auth/gmail.labels']
  },
  {
    id: 'drive',
    name: 'Google Drive',
    description: 'Find, read and create files in Drive',
    icon: 'i-logos-google-drive',
    url: 'https://drivemcp.googleapis.com/mcp/v1',
    scopes: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/drive.file']
  },
  {
    id: 'docs',
    name: 'Google Docs',
    description: 'Read and edit Google Docs',
    icon: 'i-simple-icons-googledocs',
    url: 'https://docsmcp.googleapis.com/mcp/v1',
    scopes: ['https://www.googleapis.com/auth/documents', 'https://www.googleapis.com/auth/drive.readonly']
  },
  {
    id: 'sheets',
    name: 'Google Sheets',
    description: 'Read, update and format spreadsheets',
    icon: 'i-simple-icons-googlesheets',
    url: 'https://sheetsmcp.googleapis.com/mcp/v1',
    scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.readonly']
  }
] as const

export type ConnectorId = typeof CONNECTORS[number]['id']

/** Tools that Google marks as "prefer another tool": left out so the model is not tempted. */
const HIDDEN_TOOLS = new Set(['apply_sensitive_thread_label', 'apply_sensitive_message_label'])

export function connector(id: string) {
  const found = CONNECTORS.find(c => c.id === id)
  if (!found) throw createError({ statusCode: 404, statusMessage: 'Unknown connector' })
  return found
}

/** Connectors need a signed-in user (the app's Google OAuth client) and a secret to encrypt tokens. */
export function connectorsAvailable() {
  const { auth, public: { auth: enabled } } = useRuntimeConfig()
  return !!(enabled && auth.googleClientId && auth.googleClientSecret && auth.secret)
}

/** The OAuth redirect URI to register on the OAuth client, next to Better Auth's. */
export function redirectUri(event: H3Event) {
  const base = process.env.BETTER_AUTH_URL || getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin
  return `${base.replace(/\/$/, '')}/api/connectors/callback`
}

export async function listConnectors(userId: string): Promise<ConnectorInfo[]> {
  const connections = new Map((await useStore().listConnections(userId)).map(c => [c.connectorId, c]))
  return CONNECTORS.map(({ scopes: _scopes, ...c }) => {
    const connection = connections.get(c.id)
    return {
      ...c,
      connected: !!connection,
      enabled: !!connection?.enabled && !connection.needsReconnect,
      account: connection?.account,
      needsReconnect: connection?.needsReconnect
    }
  })
}

/* ---------- Authorization ---------- */

interface PendingAuthorization {
  state: string
  verifier: string
  connectorId: string
  userId: string
  returnTo: string
  popup: boolean
  expires: number
}

const STATE_COOKIE = 'connector-auth'

/** Starts the MCP authorization flow: discovery, client, PKCE, then the authorization URL. */
export async function startAuthorization(event: H3Event, user: User, connectorId: string, options: { returnTo: string, popup: boolean }) {
  const c = connector(connectorId)
  const { resource, server } = await discover(c.url)
  const uri = redirectUri(event)
  const client = await clientFor(server, uri)
  const { verifier, challenge } = await pkce()
  const state = crypto.randomUUID()
  const pending: PendingAuthorization = { state, verifier, connectorId, userId: user.id, ...options, expires: Date.now() + 10 * 60_000 }
  setCookie(event, STATE_COOKIE, seal(pending), { httpOnly: true, sameSite: 'lax', secure: !import.meta.dev, maxAge: 600, path: '/api/connectors' })
  // Google: also ask for the email, to show which account is connected
  const scopes = isGoogle(server) ? [...c.scopes, 'openid', 'email'] : [...c.scopes]
  return authorizationUrl({ server, resource, client, redirectUri: uri, scopes, state, challenge, loginHint: user.email })
}

/** The OAuth callback: checks the state, exchanges the code (with the PKCE verifier) and stores the tokens. */
export async function finishAuthorization(event: H3Event, user: User) {
  const sealed = getCookie(event, STATE_COOKIE)
  deleteCookie(event, STATE_COOKIE, { path: '/api/connectors' })
  const pending = sealed ? tryUnseal<PendingAuthorization>(sealed) : undefined
  const query = getQuery(event) as { code?: string, state?: string, error?: string, error_description?: string }
  const done = { connectorId: pending?.connectorId, returnTo: pending?.returnTo ?? '/', popup: pending?.popup ?? false }

  if (query.error) return { ...done, error: query.error_description || query.error }
  if (!pending || pending.state !== query.state || pending.expires < Date.now() || pending.userId !== user.id || !query.code) {
    return { ...done, error: 'The sign-in expired or did not match. Please try again.' }
  }

  const c = connector(pending.connectorId)
  const { resource, server } = await discover(c.url)
  const client = await clientFor(server, redirectUri(event))
  const tokens = await exchangeCode(server, resource, client, query.code, pending.verifier, redirectUri(event))
  const granted = tokens.scope?.split(' ') ?? [...c.scopes]
  const missing = c.scopes.filter(scope => !granted.includes(scope))
  if (missing.length) return { ...done, error: `Some permissions were not granted, so ${c.name} may not work fully. Connect again and allow all of them.` }

  const account = server.userinfo_endpoint
    ? await $fetch<{ email?: string }>(server.userinfo_endpoint, { headers: { authorization: `Bearer ${tokens.access_token}` } }).then(info => info.email).catch(() => undefined)
    : undefined

  await useStore().saveConnection({
    userId: user.id,
    connectorId: c.id,
    enabled: true,
    tokens: seal(tokens),
    scopes: granted,
    account,
    redirectUri: redirectUri(event),
    connectedAt: new Date().toISOString()
  })
  toolCache.delete(`${user.id}:${c.id}`)
  return { ...done, error: undefined }
}

export async function disconnect(userId: string, connectorId: string) {
  const c = connector(connectorId)
  const connection = await useStore().getConnection(userId, c.id)
  if (!connection) return
  const tokens = tryUnseal<Tokens>(connection.tokens)
  const token = tokens?.refresh_token ?? tokens?.access_token
  if (token) await discover(c.url).then(({ server }) => revokeToken(server, token)).catch(() => undefined)
  await useStore().deleteConnection(userId, c.id)
  toolCache.delete(`${userId}:${c.id}`)
}

/** A valid access token, refreshed when it is about to expire. Marks the connector when that fails. */
async function accessToken(userId: string, connectorId: string, force = false): Promise<string> {
  const store = useStore()
  const connection = await store.getConnection(userId, connectorId)
  if (!connection || connection.needsReconnect) throw new McpUnauthorizedError()
  const tokens = unseal<Tokens>(connection.tokens)
  if (!force && (!tokens.expires_at || tokens.expires_at > Date.now() + 60_000)) return tokens.access_token

  const c = connector(connectorId)
  const { resource, server } = await discover(c.url)
  try {
    const fresh = await refreshTokens(server, resource, await clientFor(server, connection.redirectUri), tokens)
    await store.updateConnection(userId, connectorId, { tokens: seal(fresh) })
    return fresh.access_token
  } catch (error) {
    console.error(`refreshing the ${connectorId} token failed`, error)
    await store.updateConnection(userId, connectorId, { needsReconnect: true })
    throw new McpUnauthorizedError()
  }
}

/** Runs an MCP request with the user's token; on 401, refreshes the token once and retries. */
async function withSession<T>(userId: string, connectorId: string, run: (session: McpSession) => Promise<T>): Promise<T> {
  const { url } = connector(connectorId)
  try {
    return await run(new McpSession(url, await accessToken(userId, connectorId)))
  } catch (error) {
    if (!(error instanceof McpUnauthorizedError)) throw error
    return run(new McpSession(url, await accessToken(userId, connectorId, true)))
  }
}

/* ---------- Tools for the agent ---------- */

const toolCache = new Map<string, { tools: McpTool[], expires: number }>()

async function listTools(userId: string, connectorId: string) {
  const key = `${userId}:${connectorId}`
  const cached = toolCache.get(key)
  if (cached && cached.expires > Date.now()) return cached.tools
  const tools = (await withSession(userId, connectorId, session => session.listTools())).filter(tool => !HIDDEN_TOOLS.has(tool.name))
  toolCache.set(key, { tools, expires: Date.now() + 30 * 60_000 })
  return tools
}

/**
 * MCP input schemas use JSON Schema features Gemini's function declarations do not take ($ref,
 * $defs, formats, readOnly...). Inline the references and keep the supported keywords.
 */
export function toGeminiSchema(schema: Record<string, unknown> | undefined, root = schema, depth = 0): JSONSchema7 {
  if (!schema || depth > 8) return { type: 'object', properties: {} }
  const ref = schema.$ref as string | undefined
  if (ref?.startsWith('#/')) {
    const target = ref.slice(2).split('/').reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], root)
    return toGeminiSchema(target as Record<string, unknown>, root, depth + 1)
  }
  const types = ([] as unknown[]).concat(schema.type ?? (schema.properties ? 'object' : 'string'))
  const type = (types.find(t => t !== 'null') ?? 'string') as JSONSchema7['type']
  const out: JSONSchema7 = { type }
  if (typeof schema.description === 'string') out.description = schema.description.slice(0, 1000)
  if (Array.isArray(schema.enum)) out.enum = schema.enum as JSONSchema7['enum']
  if (type === 'object') {
    const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>
    out.properties = Object.fromEntries(Object.entries(properties)
      .filter(([, value]) => !value.readOnly)
      .map(([key, value]) => [key, toGeminiSchema(value, root, depth + 1)]))
    const required = (schema.required as string[] | undefined)?.filter(key => key in out.properties!)
    if (required?.length) out.required = required
  }
  if (type === 'array') out.items = toGeminiSchema(schema.items as Record<string, unknown> | undefined, root, depth + 1)
  return out
}

/** Text the model can read from an MCP tool result. */
function toOutput(result: McpToolResult) {
  const text = (result.content ?? []).map((item) => {
    if (item.type === 'text') return item.text ?? ''
    if (item.type === 'resource') return item.resource?.text ?? item.resource?.uri ?? ''
    return `[${item.type}${item.mimeType ? ` ${item.mimeType}` : ''}]`
  }).join('\n')
  if (result.isError) return { error: text || 'The tool failed' }
  const output = result.structuredContent ?? text
  // Keep very large results (long emails, whole spreadsheets) from filling the context window
  const serialized = typeof output === 'string' ? output : JSON.stringify(output)
  return serialized.length > 60_000 ? { result: `${serialized.slice(0, 60_000)}… [truncated]` } : { result: output }
}

/**
 * The tools of the user's enabled connectors, as Genkit dynamic tools named `<connector>_<tool>`.
 * A connector that fails to list its tools is skipped, so chat keeps working.
 */
export async function connectorTools(userId: string) {
  if (!connectorsAvailable()) return []
  const enabled = (await useStore().listConnections(userId)).filter(c => c.enabled && !c.needsReconnect)
  const lists = await Promise.all(enabled.map(async ({ connectorId }) => {
    try {
      const tools = await listTools(userId, connectorId)
      return tools.map(tool => ai.dynamicTool({
        name: `${connectorId}_${tool.name}`.slice(0, 64),
        description: `[${connector(connectorId).name}] ${tool.description ?? tool.annotations?.title ?? tool.name}`.slice(0, 4000),
        inputJsonSchema: toGeminiSchema(tool.inputSchema),
        metadata: { connector: connectorId }
      }, async (input) => {
        try {
          return toOutput(await withSession(userId, connectorId, session => session.callTool(tool.name, input)))
        } catch (error) {
          console.error(`connector tool ${connectorId}_${tool.name} failed`, error)
          return { error: error instanceof McpUnauthorizedError ? `${connector(connectorId).name} needs to be connected again (Settings → Connectors).` : (error as Error).message }
        }
      }))
    } catch (error) {
      console.error(`listing ${connectorId} tools failed`, error)
      return []
    }
  }))
  return lists.flat()
}

/** Connector routes: the feature must be configured and the user signed in with Google. */
export async function connectorUser(event: H3Event) {
  if (!connectorsAvailable()) throw createError({ statusCode: 503, statusMessage: 'Connectors need Sign in with Google (NUXT_AUTH_*)' })
  const user = await getUser(event)
  if (!user.signedIn) throw createError({ statusCode: 401, statusMessage: 'Sign in with Google to use connectors' })
  return user
}
