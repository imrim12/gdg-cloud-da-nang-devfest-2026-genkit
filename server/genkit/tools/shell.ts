import { z } from 'genkit'
import { ai, type Context } from '..'

/** Runs bash in the chat's Agent Platform shell sandbox. */
export const shell = ai.defineTool(
  {
    name: 'shell',
    description: 'Run a bash command in a persistent Linux sandbox for this chat (files, git, package installs, builds).',
    inputSchema: z.object({ command: z.string(), cwd: z.string().optional() }),
  },
  async ({ command, cwd }, { context }) => {
    const { name } = await sandbox.get('shell', (context as Context).chatId)
    const [output] = await sandbox.execute(name, [
      { mimeType: 'application/x.sandbox-request-uri', data: encode('/exec') },
      { mimeType: 'application/x.sandbox-request-port', data: encode('8080') },
      { mimeType: 'application/json', data: encode(JSON.stringify({ command, cwd, timeout: 120 })) },
    ])
    if (!output?.data) throw new Error('The shell sandbox returned no output.')
    return JSON.parse(decode(output.data).toString('utf8')) as { stdout: string, stderr: string, returncode: number }
  },
)
