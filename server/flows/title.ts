import { z } from 'genkit'
import { ai, model, resilient, thinking } from '../genkit'

/** Generates a short conversation title from the first message. */
export const title = ai.defineFlow(
  {
    name: 'title',
    inputSchema: z.object({ message: z.string() }),
    outputSchema: z.string()
  },
  async ({ message }) => {
    const { output } = await ai.generate({
      model: model(useRuntimeConfig().titleModel),
      system: [
        'You write the title of a chat, based on its first message.',
        '- At most 5 words and 40 characters, in the language of the message',
        '- A summary of what the user wants, not a reply',
        '- Plain text: no quotes, colons, emoji or markdown'
      ].join('\n'),
      prompt: message.slice(0, 4000),
      config: thinking(useRuntimeConfig().titleModel, { level: 'MINIMAL' }),
      use: resilient(useRuntimeConfig().titleModel),
      output: { schema: z.object({ title: z.string() }) }
    })
    return (output?.title ?? '').replace(/["'`*_:#]/g, '').trim().slice(0, 60) || 'New chat'
  }
)
