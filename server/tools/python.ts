import { z } from 'genkit'
import { defineTool, type Context } from '../genkit'

/** Runs Python in the chat's Agent Platform code execution sandbox. State persists across calls. */
export const python = defineTool(
  {
    name: 'python',
    description: 'Run Python code for calculations, data analysis or charts. Variables and files persist within the chat. Files written to the working directory are returned as downloads. No internet access.',
    inputSchema: z.object({ code: z.string() })
  },
  async ({ code }, { context }) => {
    const { chatId, userId } = context as Context
    const { name } = await sandbox.get('code', chatId)
    const outputs = await sandbox.execute(name, [
      { mimeType: 'application/json', data: encode(JSON.stringify({ code })) }
    ])

    const result: { output?: unknown, files: { name: string, url?: string }[] } = { files: [] }
    for (const chunk of outputs) {
      const file = chunk.metadata?.attributes?.file_name
      if (!file) {
        result.output = JSON.parse(decode(chunk.data).toString('utf8'))
        continue
      }
      const name = decode(file).toString('utf8')
      result.files.push({
        name,
        url: features().files
          ? await bucket.save(`users/${userId}/${chatId}/${name}`, decode(chunk.data), chunk.mimeType)
          : undefined
      })
    }
    return result
  }
)
