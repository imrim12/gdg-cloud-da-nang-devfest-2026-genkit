/**
 * One-time Google Cloud setup: creates the Agent Platform engine (Memory Bank + sandboxes)
 * and the shell / computer use sandbox templates, then prints the env vars to set.
 *
 *   gcloud auth application-default login
 *   node scripts/setup.ts <project> [location] [model]
 */
import { GoogleAuth } from 'google-auth-library'

const [project, location = 'us-central1', model = 'gemini-3.5-flash-lite'] = process.argv.slice(2)
if (!project) throw new Error('Usage: node scripts/setup.ts <project> [location] [model]')

const api = `https://${location}-aiplatform.googleapis.com/v1beta1`
const client = new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' })
const publisher = (name: string) => `projects/${project}/locations/${location}/publishers/google/models/${name}`

type Operation = { name: string, done?: boolean, response?: { name: string }, error?: { message: string } }

async function create(url: string, data: unknown) {
  let { data: op } = await client.request<Operation>({ url, method: 'POST', data })
  while (!op.done) {
    await new Promise(resolve => setTimeout(resolve, 2000))
    op = (await client.request<Operation>({ url: `${api}/${op.name}` })).data
  }
  if (op.error || !op.response) throw new Error(op.error?.message ?? 'Operation failed')
  return op.response.name
}

const engine = await create(`${api}/projects/${project}/locations/${location}/reasoningEngines`, {
  displayName: 'agent',
  contextSpec: {
    memoryBankConfig: {
      generationConfig: { model: publisher(model) },
      similaritySearchConfig: { embeddingModel: publisher('gemini-embedding-001') },
    },
  },
})

const template = (displayName: string, category: string) => create(`${api}/${engine}/sandboxEnvironmentTemplates`, {
  displayName,
  defaultContainerEnvironment: { defaultContainerCategory: category },
  egressControlConfig: { internetAccess: true },
})

const shell = await template('shell', 'DEFAULT_CONTAINER_CATEGORY_SHELL_SANDBOX')
const browser = await template('browser', 'DEFAULT_CONTAINER_CATEGORY_COMPUTER_USE')

console.log(`
NUXT_GCP_PROJECT=${project}
NUXT_GCP_LOCATION=${location}
NUXT_GCP_ENGINE=${engine}
NUXT_GCP_SHELL_TEMPLATE=${shell}
NUXT_GCP_BROWSER_TEMPLATE=${browser}`)
