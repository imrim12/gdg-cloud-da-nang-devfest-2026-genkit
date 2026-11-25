import { z } from 'genkit'
import { defineTool, type Context } from '../genkit'

/** Saves a file to Cloud Storage and returns a download link. */
export const save = defineTool(
  {
    name: 'save',
    description: 'Save text content (code, CSV, Markdown, JSON...) as a downloadable file for the user. Returns a link to include in the reply.',
    inputSchema: z.object({ name: z.string().describe('File name with extension'), content: z.string(), mimeType: z.string().default('text/plain') })
  },
  async ({ name, content, mimeType }, { context }) => {
    const { chatId, userId } = context as Context
    return { url: await bucket.save(`users/${userId}/${chatId}/${name.replaceAll('/', '_')}`, content, mimeType) }
  }
)
