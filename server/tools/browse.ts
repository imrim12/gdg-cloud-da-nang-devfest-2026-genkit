import { z } from 'genkit'
import { chromium } from 'playwright-core'
import { defineTool, type Context } from '../genkit'

const PORT = '8080'

/** Signs a short-lived token for the sandbox data plane with the configured service account. */
async function token() {
  const email = useRuntimeConfig().gcp.serviceAccount
  const now = Math.floor(Date.now() / 1000)
  const payload = { iat: now, exp: now + 600, iss: email, sub: email, aud: 'https://aiplatform.googleapis.com/' }
  const { signedJwt } = await gcp<{ signedJwt: string }>(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${email}:signJwt`,
    { payload: JSON.stringify(payload) }
  )
  return signedJwt
}

/** Connects Playwright to the Chrome running in the chat's computer use sandbox. */
async function connect(chatId: string) {
  const { connectionInfo } = await sandbox.get('browser', chatId)
  const host = connectionInfo?.loadBalancerHostname
  const routing = connectionInfo?.routingToken
  if (!host || !routing) throw new Error('The computer use sandbox has no endpoint yet.')

  const { endpoint } = await $fetch<{ endpoint: string }>(`https://${host}/cdp_ws_endpoint`, {
    headers: { 'Authorization': `Bearer ${await token()}`, 'X-Sandbox-Routing-Token': routing, 'X-Sandbox-Port': PORT }
  })
  return chromium.connectOverCDP(`wss://${host}/${endpoint}`, {
    headers: { 'Sec-WebSocket-Protocol': `v1.stream, ${await token()}, ${routing}, 9222` }
  })
}

type Page = Awaited<ReturnType<Awaited<ReturnType<typeof connect>>['newPage']>>

/** Runs `fn` with a fresh page in the chat's computer use sandbox browser, then closes the page. */
export async function withSandboxPage<T>(chatId: string, fn: (page: Page) => Promise<T>): Promise<T> {
  const browser = await connect(chatId)
  try {
    const context = browser.contexts()[0] ?? await browser.newContext()
    const page = await context.newPage()
    try {
      return await fn(page)
    } finally {
      await page.close()
    }
  } finally {
    await browser.close() // disconnects; the sandbox browser keeps running
  }
}

const Action = z.object({
  type: z.enum(['click', 'fill', 'press']),
  selector: z.string().describe('Playwright selector, e.g. text=Sign in or input[name=q]'),
  value: z.string().optional().describe('Text for fill, key for press')
})

/** Drives a real browser in the Agent Platform computer use sandbox. */
export const browse = defineTool(
  {
    name: 'browse',
    description: 'Open a web page in a real browser, optionally perform actions on it, and read the result. The browser keeps its state within the chat. For plain web search use the search tool instead.',
    inputSchema: z.object({ url: z.string().optional(), actions: z.array(Action).optional() })
  },
  async ({ url, actions = [] }, { context }) => {
    const { chatId, userId } = context as Context
    const browser = await connect(chatId)
    try {
      const page = browser.contexts()[0]?.pages()[0] ?? await (browser.contexts()[0] ?? await browser.newContext()).newPage()
      if (url) await page.goto(url, { waitUntil: 'domcontentloaded' })
      for (const { type, selector, value = '' } of actions) {
        if (type === 'click') await page.click(selector)
        if (type === 'fill') await page.fill(selector, value)
        if (type === 'press') await page.press(selector, value)
      }
      await page.waitForLoadState('domcontentloaded')
      const screenshot = features().files
        ? await bucket.save(`users/${userId}/${chatId}/screenshot-${Date.now()}.png`, await page.screenshot(), 'image/png')
        : undefined
      return { url: page.url(), title: await page.title(), text: (await page.innerText('body')).slice(0, 20_000), screenshot }
    } finally {
      await browser.close() // disconnects; the sandbox browser keeps running
    }
  }
)
