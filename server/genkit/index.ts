import { genkit, type z } from 'genkit'
import type { ModelMiddleware } from 'genkit/model'
import { fallback, retry } from 'genkit/model/middleware'
import { googleAI } from '@genkit-ai/google-genai'

export const ai = genkit({
  plugins: [googleAI({ apiKey: useRuntimeConfig().geminiApiKey || undefined })]
})

/** A Gemini model by name, e.g. gemini-3.5-flash. Defaults to the configured chat model. */
export const model = (name?: string) => googleAI.model(name || useRuntimeConfig().model)

/**
 * Gemini 3 streams empty text parts that only carry a thought signature. Replayed in the next
 * turn of a tool loop, the Interactions API rejects them ("Missing text in content of type text").
 */
const dropEmptyText: ModelMiddleware = (request, next) => next({
  ...request,
  messages: request.messages
    .map(message => ({ ...message, content: message.content.filter(part => !(part.text === '' && Object.keys(part).every(key => key === 'text' || key === 'metadata'))) }))
    .filter(message => message.content.length)
})

/** `model:level` pairs Gemini rejected, so later requests skip the level instead of failing first. */
const unsupportedThinking = new Set<string>()

/**
 * Thinking levels differ per model (some reject MINIMAL, 2.x takes none): if Gemini rejects the
 * level, ask again with the model's default, and remember it for this model.
 */
function adaptThinking(name: string): ModelMiddleware {
  return async (request, next) => {
    const config = request.config as { thinkingConfig?: { thinkingLevel?: string } } | undefined
    const level = config?.thinkingConfig?.thinkingLevel
    const withoutLevel = () => {
      const { thinkingLevel: _, ...thinkingConfig } = config!.thinkingConfig!
      return { ...request, config: { ...config, thinkingConfig } }
    }
    if (!level) return next(request)
    if (unsupportedThinking.has(`${name}:${level}`)) return next(withoutLevel())
    try {
      return await next(request)
    } catch (error) {
      if (!/thinking.?level/i.test(String(error))) throw error
      unsupportedThinking.add(`${name}:${level}`)
      return next(withoutLevel())
    }
  }
}

/**
 * Model middleware: drops empty text parts, adapts the thinking level, retries "high demand" (503)
 * errors, then falls back to the other configured models, also when a model's quota is used up
 * (429: free-tier quotas are per model). Use as `use: resilient(name)` in ai.generate.
 */
export function resilient(name?: string) {
  const { model: chat, titleModel } = useRuntimeConfig()
  const others = [...new Set([chat, titleModel])].filter(other => other !== (name || chat))
  return [
    adaptThinking(name || chat),
    dropEmptyText,
    retry({ maxRetries: 2, statuses: ['UNAVAILABLE'], initialDelayMs: 1500 }),
    ...(others.length ? [fallback(ai, { models: others.map(other => model(other)), statuses: ['UNAVAILABLE', 'RESOURCE_EXHAUSTED'] })] : [])
  ]
}

/**
 * Gemini thinking settings. Gemini 3+ takes a thinking level (lower is faster); 2.x models do not.
 * `show` streams the thoughts so the UI can display them.
 */
export function thinking(name: string | undefined, { show = false, level = 'LOW' as 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH' } = {}) {
  const legacy = /gemini-2\./.test(name || useRuntimeConfig().model)
  return { thinkingConfig: { includeThoughts: show, ...(!legacy && { thinkingLevel: level }) } }
}

/** Per-request values passed to tools through Genkit's context. */
export type Context = {
  chatId: string
  userId: string
  /** Partial output of a long-running tool (canvas), streamed to the UI while it works. */
  progress?: (tool: string, output: unknown) => void
}

type ToolConfig<I extends z.ZodTypeAny, O extends z.ZodTypeAny> = Parameters<typeof ai.defineTool<I, O>>[0]
type ToolFn<I extends z.ZodTypeAny, O extends z.ZodTypeAny> = Parameters<typeof ai.defineTool<I, O>>[1]

/**
 * ai.defineTool, except a failure is returned to the model as `{ error }` instead of aborting the
 * whole reply, so the model can explain it or try something else.
 */
export function defineTool<I extends z.ZodTypeAny, O extends z.ZodTypeAny>(config: ToolConfig<I, O>, fn: ToolFn<I, O>) {
  return ai.defineTool(config, async (input, options) => {
    try {
      return await fn(input, options)
    } catch (error) {
      console.error(`tool ${config.name} failed`, error)
      return { error: error instanceof Error ? error.message : String(error) } as z.infer<O>
    }
  })
}
