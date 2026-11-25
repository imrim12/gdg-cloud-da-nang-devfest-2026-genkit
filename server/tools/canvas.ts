import { z } from 'genkit'
import { defineTool, type Context } from '../genkit'
import { canvasFlow } from '../flows/canvas'

/** The latest version of a canvas built earlier in this chat. */
async function latest(chatId: string, canvasId: string): Promise<Canvas | undefined> {
  let found: Canvas | undefined
  for (const message of await useStore().listMessages(chatId)) {
    for (const part of message.parts) {
      const output = (part as { type: string, output?: Canvas }).type === 'tool-canvas' ? (part as { output?: Canvas }).output : undefined
      if (output?.id === canvasId) found = output
    }
  }
  return found
}

/** Builds or edits a web page shown in the canvas panel. */
export const canvas = defineTool(
  {
    name: 'canvas',
    description: 'Build or update an interactive web page/app (HTML, CSS, JS) shown in a live preview panel next to the chat. Describe what to build or what to change in `request`; a specialised model writes the code. Pass canvasId to edit an existing canvas.',
    inputSchema: z.object({
      request: z.string().describe('What to build, or what to change, in detail'),
      canvasId: z.string().optional().describe('Id of an existing canvas to edit')
    })
  },
  async ({ request, canvasId }, { context }) => {
    const { chatId, userId, progress } = context as Context
    const previous = canvasId ? await latest(chatId, canvasId) : undefined
    if (canvasId && !previous) throw new Error(`No canvas ${canvasId} in this chat.`)

    const { stream, output } = canvasFlow.stream({ chatId, userId, request, previous })
    for await (const partial of stream) progress?.('canvas', { ...partial, preliminary: true })
    return output
  }
)
