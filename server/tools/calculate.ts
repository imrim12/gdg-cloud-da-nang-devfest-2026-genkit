import { z } from 'genkit'
import { all, create } from 'mathjs'
import { defineTool } from '../genkit'

const math = create(all!)
const evaluate = math.evaluate
// Expressions come from the model: disable functions that change mathjs itself (mathjs security guide)
const blocked = (name: string) => () => {
  throw new Error(`Function ${name} is disabled`)
}
math.import({
  import: blocked('import'),
  createUnit: blocked('createUnit'),
  evaluate: blocked('evaluate'),
  parse: blocked('parse'),
  simplify: blocked('simplify'),
  derivative: blocked('derivative'),
  resolve: blocked('resolve'),
  reviver: blocked('reviver')
}, { override: true })

/** Exact maths with mathjs, so the model never does arithmetic in its head. */
export const calculate = defineTool(
  {
    name: 'calculate',
    description: 'Evaluate math exactly: arithmetic, percentages, powers, roots, trigonometry, matrices, statistics (mean, median, std), and unit conversions like "5 km to mi" or "100 USD * 1.08". Use it for ANY calculation instead of computing in your head. Several expressions can be given; later ones can use variables assigned earlier (e.g. "r = 0.07/12").',
    inputSchema: z.object({
      expressions: z.array(z.string()).min(1).describe('mathjs expressions, evaluated in order, e.g. ["principal = 2e9", "principal * (1 + 0.07)^10"]')
    })
  },
  async ({ expressions }) => {
    const scope = new Map<string, unknown>()
    const results = expressions.map((expression) => {
      try {
        const value = evaluate(expression, scope)
        return { expression, result: math.format(value, { precision: 14, lowerExp: -9, upperExp: 21 }) }
      } catch (error) {
        return { expression, error: (error as Error).message }
      }
    })
    return { results }
  }
)
