/**
 * A small Model Context Protocol client: Streamable HTTP transport and the MCP authorization flow
 * (https://modelcontextprotocol.io/specification/2025-06-18). Kept dependency-free so it is easy
 * to read; the official SDK (@modelcontextprotocol/sdk) does the same with more options.
 */

const PROTOCOL_VERSION = '2025-06-18'

export interface McpTool {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
  annotations?: { title?: string, readOnlyHint?: boolean, destructiveHint?: boolean }
}

export interface McpToolResult {
  content?: { type: string, text?: string, data?: string, mimeType?: string, resource?: { uri: string, text?: string } }[]
  structuredContent?: unknown
  isError?: boolean
}

/** The server rejected the access token (HTTP 401): refresh it, or connect again. */
export class McpUnauthorizedError extends Error {
  constructor(public resourceMetadata?: string) {
    super('The connector needs to be authorized again')
  }
}

/** Reads a JSON-RPC response from a JSON body or a Server-Sent Events stream. */
async function readResponse(response: Response, id: number) {
  const type = response.headers.get('content-type') ?? ''
  if (!type.includes('text/event-stream')) return response.json()
  const text = await response.text()
  for (const block of text.split(/\r?\n\r?\n/)) {
    const data = block.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n')
    if (!data) continue
    const message = JSON.parse(data)
    if (message.id === id) return message
  }
  throw new Error('No response in the event stream')
}

/** One MCP session over Streamable HTTP, authorized with a bearer token. */
export class McpSession {
  private nextId = 1
  private sessionId?: string
  private initialized?: Promise<void>

  constructor(private url: string, private token?: string) {}

  private async rpc<T>(method: string, params?: unknown, notification = false): Promise<T> {
    const id = this.nextId++
    const response = await fetch(this.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json, text/event-stream',
        'mcp-protocol-version': PROTOCOL_VERSION,
        ...(this.token && { authorization: `Bearer ${this.token}` }),
        ...(this.sessionId && { 'mcp-session-id': this.sessionId })
      },
      body: JSON.stringify({ jsonrpc: '2.0', method, ...(params !== undefined && { params }), ...(!notification && { id }) }),
      signal: AbortSignal.timeout(120_000)
    })
    if (response.status === 401) {
      const header = response.headers.get('www-authenticate') ?? ''
      throw new McpUnauthorizedError(/resource_metadata="([^"]+)"/.exec(header)?.[1])
    }
    if (!response.ok) throw new Error(`MCP ${method} failed: HTTP ${response.status} ${await response.text().catch(() => '')}`.trim())
    this.sessionId = response.headers.get('mcp-session-id') ?? this.sessionId
    if (notification) return undefined as T
    const message = await readResponse(response, id)
    if (message.error) throw new Error(`MCP ${method} failed: ${message.error.message}`)
    return message.result as T
  }

  /** The initialize handshake, once per session. */
  private initialize() {
    this.initialized ??= (async () => {
      await this.rpc('initialize', { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'genkit-chat', version: '1.0.0' } })
      await this.rpc('notifications/initialized', undefined, true)
    })().catch((error) => {
      this.initialized = undefined
      throw error
    })
    return this.initialized
  }

  async listTools(): Promise<McpTool[]> {
    await this.initialize()
    const tools: McpTool[] = []
    let cursor: string | undefined
    do {
      const page = await this.rpc<{ tools: McpTool[], nextCursor?: string }>('tools/list', cursor ? { cursor } : {})
      tools.push(...page.tools)
      cursor = page.nextCursor
    } while (cursor)
    return tools
  }

  async callTool(name: string, args: unknown): Promise<McpToolResult> {
    await this.initialize()
    return this.rpc<McpToolResult>('tools/call', { name, arguments: args ?? {} })
  }
}

/* ---------- Authorization (OAuth 2.1, as the MCP spec describes it) ---------- */

/** RFC 9728 Protected Resource Metadata: which authorization server protects the MCP server. */
export interface ResourceMetadata {
  resource: string
  authorization_servers: string[]
  scopes_supported?: string[]
}

/** RFC 8414 / OpenID Connect authorization server metadata. */
export interface AuthServerMetadata {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  revocation_endpoint?: string
  userinfo_endpoint?: string
  registration_endpoint?: string
  code_challenge_methods_supported?: string[]
}

export interface OAuthClient {
  client_id: string
  client_secret?: string
}

export interface Tokens {
  access_token: string
  refresh_token?: string
  /** Epoch milliseconds. */
  expires_at?: number
  scope?: string
}

const discovered = new Map<string, Promise<{ resource: ResourceMetadata, server: AuthServerMetadata }>>()

async function getJson<T>(url: string): Promise<T | undefined> {
  const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15_000) }).catch(() => undefined)
  return response?.ok ? response.json() as Promise<T> : undefined
}

/**
 * Discovery: the MCP server's Protected Resource Metadata (path-specific first, then the root),
 * then its authorization server's metadata (RFC 8414, then OpenID Connect discovery).
 */
export function discover(serverUrl: string) {
  if (!discovered.has(serverUrl)) {
    const promise = (async () => {
      const url = new URL(serverUrl)
      const path = url.pathname === '/' ? '' : url.pathname
      const resource = await getJson<ResourceMetadata>(`${url.origin}/.well-known/oauth-protected-resource${path}`)
        ?? await getJson<ResourceMetadata>(`${url.origin}/.well-known/oauth-protected-resource`)
      const issuer = resource?.authorization_servers?.[0]
      if (!resource || !issuer) throw new Error(`${serverUrl} does not publish OAuth protected resource metadata`)

      const base = new URL(issuer)
      const issuerPath = base.pathname.replace(/\/$/, '')
      const server = await getJson<AuthServerMetadata>(`${base.origin}/.well-known/oauth-authorization-server${issuerPath}`)
        ?? await getJson<AuthServerMetadata>(`${base.origin}${issuerPath}/.well-known/openid-configuration`)
      if (!server) throw new Error(`No authorization server metadata for ${issuer}`)
      if (server.code_challenge_methods_supported && !server.code_challenge_methods_supported.includes('S256')) {
        throw new Error(`${issuer} does not support PKCE (S256)`)
      }
      return { resource, server }
    })()
    promise.catch(() => discovered.delete(serverUrl))
    discovered.set(serverUrl, promise)
  }
  return discovered.get(serverUrl)!
}

/** Google's authorization server: no dynamic client registration, and tokens are bound to scopes. */
export const isGoogle = (server: AuthServerMetadata) => new URL(server.issuer).host === 'accounts.google.com'

const registered = new Map<string, Promise<OAuthClient>>()

/**
 * The OAuth client to use with an authorization server. Dynamic Client Registration (RFC 7591) when
 * the server supports it; otherwise a pre-registered client, which the MCP spec allows. Google has
 * no registration endpoint, so its connectors use the app's own Google OAuth client.
 */
export function clientFor(server: AuthServerMetadata, redirectUri: string): Promise<OAuthClient> {
  if (isGoogle(server)) {
    const { auth } = useRuntimeConfig()
    return Promise.resolve({ client_id: auth.googleClientId, client_secret: auth.googleClientSecret })
  }
  if (!server.registration_endpoint) return Promise.reject(new Error(`No OAuth client for ${server.issuer}`))
  const key = `${server.issuer} ${redirectUri}`
  if (!registered.has(key)) {
    const promise = $fetch<OAuthClient>(server.registration_endpoint, {
      method: 'POST',
      body: {
        client_name: 'Genkit Chat',
        redirect_uris: [redirectUri],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'client_secret_post'
      }
    })
    promise.catch(() => registered.delete(key))
    registered.set(key, promise)
  }
  return registered.get(key)!
}

export async function pkce() {
  const verifier = crypto.getRandomValues(new Uint8Array(32))
  const encode = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url')
  const challenge = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(encode(verifier))))
  return { verifier: encode(verifier), challenge: encode(challenge) }
}

export function authorizationUrl(options: {
  server: AuthServerMetadata
  resource: ResourceMetadata
  client: OAuthClient
  redirectUri: string
  scopes: string[]
  state: string
  challenge: string
  loginHint?: string
}) {
  const { server, resource, client, redirectUri, scopes, state, challenge, loginHint } = options
  const url = new URL(server.authorization_endpoint)
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: client.client_id,
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    // RFC 8707 resource indicator, which binds the token to this MCP server. Google's tokens are
    // bound to scopes instead, and its authorization endpoint does not take this parameter.
    ...(!isGoogle(server) && { resource: resource.resource }),
    // Google: a refresh token every time, so the connector keeps working after an hour
    ...(isGoogle(server) && { access_type: 'offline', prompt: 'consent', ...(loginHint && { login_hint: loginHint }) })
  }).toString()
  return url.toString()
}

async function tokenRequest(server: AuthServerMetadata, resource: ResourceMetadata, client: OAuthClient, params: Record<string, string>): Promise<Tokens> {
  const response = await fetch(server.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'accept': 'application/json' },
    body: new URLSearchParams({
      ...params,
      client_id: client.client_id,
      ...(client.client_secret && { client_secret: client.client_secret }),
      ...(!isGoogle(server) && { resource: resource.resource })
    })
  })
  const data = await response.json() as { access_token?: string, refresh_token?: string, expires_in?: number, scope?: string, error?: string, error_description?: string }
  if (!response.ok || !data.access_token) throw new Error(data.error_description || data.error || `Token request failed (HTTP ${response.status})`)
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
    scope: data.scope
  }
}

export const exchangeCode = (server: AuthServerMetadata, resource: ResourceMetadata, client: OAuthClient, code: string, verifier: string, redirectUri: string) =>
  tokenRequest(server, resource, client, { grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirectUri })

export async function refreshTokens(server: AuthServerMetadata, resource: ResourceMetadata, client: OAuthClient, tokens: Tokens): Promise<Tokens> {
  if (!tokens.refresh_token) throw new McpUnauthorizedError()
  const fresh = await tokenRequest(server, resource, client, { grant_type: 'refresh_token', refresh_token: tokens.refresh_token })
  // Refresh responses often leave out the refresh token: keep the one we have
  return { ...fresh, refresh_token: fresh.refresh_token ?? tokens.refresh_token }
}

export async function revokeToken(server: AuthServerMetadata, token: string) {
  if (!server.revocation_endpoint) return
  await fetch(server.revocation_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token })
  }).catch(() => undefined)
}
