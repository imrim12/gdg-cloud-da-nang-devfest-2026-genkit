/** The OAuth redirect URI: finishes connecting, then tells the opener window (or redirects back). */
export default defineEventHandler(async (event) => {
  const user = await connectorUser(event)
  const result = await finishAuthorization(event, user).catch((error: Error) => {
    console.error('connecting failed', error)
    return { connectorId: undefined, returnTo: '/', popup: true, error: error.message }
  })

  if (!result.popup) {
    const params = new URLSearchParams({ settings: 'connectors', ...(result.error ? { connectorError: result.error } : { connected: result.connectorId ?? '' }) })
    return sendRedirect(event, `${result.returnTo}${result.returnTo.includes('?') ? '&' : '?'}${params}`)
  }

  const message = JSON.stringify({ type: 'connector', id: result.connectorId, error: result.error }).replace(/</g, '\\u003c')
  setResponseHeader(event, 'content-type', 'text/html; charset=utf-8')
  return `<!doctype html><meta charset="utf-8"><title>Connected</title>
<body style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0">
<p id="text">${result.error ? 'Could not connect. You can close this window.' : 'Connected. You can close this window.'}</p>
<script>
  const message = ${message};
  if (window.opener) { window.opener.postMessage(message, location.origin); window.close() }
  else location.replace('/?settings=connectors')
</script>`
})
