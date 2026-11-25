import { z } from 'genkit'
import { ai, defineTool, model, resilient } from '../genkit'

type Source = { url: string, title?: string }
type Annotation = { type?: string, url?: string, title?: string }
type Grounding = { groundingMetadata?: { groundingChunks?: { web?: { uri: string, title?: string } }[] } }

/** Sources from either API shape: Interactions API url_citation annotations, or generateContent grounding chunks. */
function sources(response: Awaited<ReturnType<typeof ai.generate>>): Source[] {
  const found = new Map<string, Source>()
  for (const part of response.message?.content ?? []) {
    for (const annotation of (part.metadata?.annotations ?? []) as Annotation[]) {
      if (annotation.type === 'url_citation' && annotation.url) found.set(annotation.url, { url: annotation.url, title: annotation.title })
    }
  }
  const chunks = (response.custom as { candidates?: Grounding[] } | undefined)?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []
  for (const { web } of chunks) {
    if (web?.uri) found.set(web.uri, { url: web.uri, title: web.title })
  }
  return [...found.values()]
}

/** Web search through Gemini's Google Search grounding. */
export const search = defineTool(
  {
    name: 'search',
    description: 'Search the web for current information (news, prices, schedules, recent events). Returns a grounded answer with sources.',
    inputSchema: z.object({ query: z.string() })
  },
  async ({ query }) => {
    const response = await ai.generate({ model: model(), prompt: query, config: { googleSearch: true }, use: resilient() })
    return { answer: response.text, sources: sources(response) }
  }
)
