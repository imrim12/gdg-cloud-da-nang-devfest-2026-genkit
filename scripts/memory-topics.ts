/**
 * Adds the memory topics (shared/utils/memory.ts) to an existing Agent Platform engine, so Memory
 * Bank sorts new memories into the sections the memory manager shows. Engines created by
 * scripts/setup.ts already have them. Safe to run again.
 *
 *   npx -y tsx scripts/memory-topics.ts projects/<p>/locations/<l>/reasoningEngines/<id>
 */
import { GoogleAuth } from 'google-auth-library'
import { CUSTOM_MEMORY_TOPICS, MANAGED_MEMORY_TOPICS } from '../shared/utils/memory'

const [engine] = process.argv.slice(2)
const location = /locations\/([^/]+)/.exec(engine ?? '')?.[1]
if (!engine || !location) throw new Error('Usage: npx -y tsx scripts/memory-topics.ts projects/<p>/locations/<l>/reasoningEngines/<id>')

const api = `https://${location}-aiplatform.googleapis.com/v1beta1`
const client = new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' })

type Operation = { name: string, done?: boolean, error?: { message: string } }

const { data: current } = await client.request<{ contextSpec?: { memoryBankConfig?: Record<string, unknown> } }>({ url: `${api}/${engine}` })
const memoryBankConfig = {
  ...current.contextSpec?.memoryBankConfig,
  customizationConfigs: [{ memoryTopics: [...MANAGED_MEMORY_TOPICS, ...CUSTOM_MEMORY_TOPICS] }]
}

let { data: op } = await client.request<Operation>({
  url: `${api}/${engine}?updateMask=contextSpec.memoryBankConfig.customizationConfigs`,
  method: 'PATCH',
  data: { contextSpec: { memoryBankConfig } }
})
while (!op.done) {
  await new Promise(resolve => setTimeout(resolve, 2000))
  op = (await client.request<Operation>({ url: `${api}/${op.name}` })).data
}
if (op.error) throw new Error(op.error.message)
console.log(`Memory topics set on ${engine}:`)
for (const topic of [...MANAGED_MEMORY_TOPICS, ...CUSTOM_MEMORY_TOPICS]) {
  console.log(`- ${'managedMemoryTopic' in topic ? topic.managedMemoryTopic.managedTopicEnum : topic.customMemoryTopic.label}`)
}
