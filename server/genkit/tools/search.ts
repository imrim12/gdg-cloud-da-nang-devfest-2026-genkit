import { z } from 'genkit'
import { ai, model } from '..'

/** Web search through Gemini's Google Search grounding. */
export const search = ai.defineTool(
  {
    name: 'search',
    description: 'Search the web for current information. Returns a grounded answer with sources.',
    inputSchema: z.object({ query: z.string() }),
  },
  async ({ query }) => {
    const response = await ai.generate({ model: model(), prompt: query, config: { googleSearch: true } })
    type Grounding = { groundingMetadata?: { groundingChunks?: { web?: { uri: string, title: string } }[] } }
    const chunks = (response.custom as { candidates?: Grounding[] } | undefined)?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []
    return { answer: response.text, sources: chunks.flatMap(({ web }) => web ? [web] : []) }
  },
)
