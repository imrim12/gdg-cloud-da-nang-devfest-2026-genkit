import type { getToolName } from 'ai'

export interface Source {
  url: string
  title?: string
}

export type ToolPart = Parameters<typeof getToolName>[0]

export function getSearchQuery(part: ToolPart): string | undefined {
  return (part.input as { query?: string } | undefined)?.query
}

/** Sources returned by the search tool (server/tools/search.ts). */
export function getSources(part: ToolPart): Source[] {
  const output = part.output as { sources?: Source[] } | undefined
  return (output?.sources ?? []).filter(source => source.url)
}

export function sourceToInlineMdc(url: string, title?: string): string {
  // Google grounding links go through a redirect, the title holds the site's domain
  const domain = title && getDomain(url) === 'vertexaisearch.cloud.google.com' ? title : getDomain(url)
  const favicon = getFaviconUrl(`https://${domain}`)
  const safeUrl = url.replace(/"/g, '&quot;')
  const safeFavicon = favicon.replace(/"/g, '&quot;')

  return ` :source-link{url="${safeUrl}" favicon="${safeFavicon}" label="${domain}"}`
}

/** Whether a tool part is still waiting for its final result (preliminary outputs are progress). */
export const isToolRunning = (part: ToolPart) =>
  part.state === 'input-streaming' || part.state === 'input-available' || (part.state === 'output-available' && !!part.preliminary)

/** Labels for each tool, while running and when done. */
export const TOOL_LABELS: Record<string, { icon: string, running: string, done: string }> = {
  calculate: { icon: 'i-lucide-calculator', running: 'Calculating...', done: 'Calculated' },
  python: { icon: 'i-simple-icons-python', running: 'Running Python...', done: 'Ran Python' },
  shell: { icon: 'i-lucide-square-terminal', running: 'Running command...', done: 'Ran command' },
  browse: { icon: 'i-lucide-globe', running: 'Browsing...', done: 'Browsed' },
  save: { icon: 'i-lucide-file-down', running: 'Saving file...', done: 'Saved file' },
  canvas: { icon: 'i-lucide-app-window', running: 'Building canvas...', done: 'Built canvas' }
}
