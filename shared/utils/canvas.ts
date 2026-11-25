/**
 * Turns a canvas (index.html plus local CSS/JS files) into one HTML document, for an iframe srcdoc
 * or the sandbox browser: local <link> and <script src> references are inlined.
 */
export function bundleCanvas(files: { path: string, content: string }[]): string {
  const byPath = new Map(files.map(file => [file.path.replace(/^\.?\//, ''), file.content]))
  const local = (ref: string) => byPath.get(ref.replace(/^\.?\//, ''))
  const html = byPath.get('index.html') ?? files.find(file => file.path.endsWith('.html'))?.content ?? ''

  return html
    .replace(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/gi, (tag, href: string) => {
      const css = /stylesheet/i.test(tag) ? local(href) : undefined
      return css === undefined ? tag : `<style>\n${css}\n</style>`
    })
    .replace(/<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (tag, before: string, src: string, after: string) => {
      const js = local(src)
      // `</script` inside the code would end the inline script early
      return js === undefined ? tag : `<script${before}${after}>\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>`
    })
}
