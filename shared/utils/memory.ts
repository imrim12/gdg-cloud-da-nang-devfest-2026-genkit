/**
 * Memory Bank topics. Memory Bank sorts each memory it extracts into topics: four managed ones,
 * plus the custom ones configured on the engine (scripts/setup.ts). The memory manager groups
 * memories by topic, the way Claude groups them into "You", "Topics" and "Areas".
 */
export type MemoryTopicId = { managedMemoryTopic: string } | { customMemoryTopicLabel: string }

export interface MemorySection {
  key: string
  label: string
  description: string
  group: 'You' | 'Topics' | 'Areas' | 'Other'
  topic?: MemoryTopicId
}

export const MEMORY_SECTIONS: MemorySection[] = [
  { key: 'profile', label: 'Profile', group: 'You', description: 'Who the user is: name, role, company, location', topic: { managedMemoryTopic: 'USER_PERSONAL_INFO' } },
  { key: 'preferences', label: 'Preferences', group: 'You', description: 'How the user wants the assistant to communicate', topic: { managedMemoryTopic: 'USER_PREFERENCES' } },
  { key: 'instructions', label: 'Instructions', group: 'You', description: 'Things the user explicitly asked to remember or forget', topic: { managedMemoryTopic: 'EXPLICIT_INSTRUCTIONS' } },
  { key: 'skills', label: 'Skills & interests', group: 'Topics', description: 'Tech stack, tools, skills, hobbies and subjects the user cares about', topic: { customMemoryTopicLabel: 'skills_and_interests' } },
  { key: 'projects', label: 'Projects', group: 'Areas', description: 'Projects, companies, clients and products the user works on, and their status', topic: { customMemoryTopicLabel: 'projects' } },
  { key: 'context', label: 'Conversations', group: 'Other', description: 'Key details and outcomes of past conversations', topic: { managedMemoryTopic: 'KEY_CONVERSATION_DETAILS' } },
  { key: 'other', label: 'Other', group: 'Other', description: 'Everything else' }
]

/** The custom topics to configure on the engine (customizationConfigs.memoryTopics). */
export const CUSTOM_MEMORY_TOPICS = MEMORY_SECTIONS.flatMap(section =>
  section.topic && 'customMemoryTopicLabel' in section.topic
    ? [{ customMemoryTopic: { label: section.topic.customMemoryTopicLabel, description: section.description } }]
    : [])

export const MANAGED_MEMORY_TOPICS = MEMORY_SECTIONS.flatMap(section =>
  section.topic && 'managedMemoryTopic' in section.topic
    ? [{ managedMemoryTopic: { managedTopicEnum: section.topic.managedMemoryTopic } }]
    : [])

/** The section of a memory, from its topics. */
export function sectionOf(topics: MemoryTopicId[] = []): string {
  for (const section of MEMORY_SECTIONS) {
    const topic = section.topic
    if (!topic) continue
    const match = topics.some(t => 'managedMemoryTopic' in topic
      ? 'managedMemoryTopic' in t && t.managedMemoryTopic === topic.managedMemoryTopic
      : 'customMemoryTopicLabel' in t && t.customMemoryTopicLabel === topic.customMemoryTopicLabel)
    if (match) return section.key
  }
  return 'other'
}

/** The prompt to paste into another AI assistant, to export what it knows about the user. */
export const MEMORY_EXPORT_PROMPT = `I'm moving to another AI assistant and want to bring my context with me.
List everything you know about me from our conversations and your memory, as plain bullet points, one fact per line, grouped under these headings:
- Profile: who I am (name, role, company, location, languages)
- Preferences: how I like answers (tone, format, length, language)
- Instructions: things I asked you to always or never do
- Skills & interests: my tech stack, tools, skills and interests
- Projects: projects, companies, clients and products I work on, with their status
Write each fact as a short, complete sentence about me ("The user ..."). Only include facts, no commentary. Put everything in a single code block so I can copy it.`
