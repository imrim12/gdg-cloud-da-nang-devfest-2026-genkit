/** Agent Platform Memory Bank: long-term facts about a user, shared across chats. */
type Turn = { role: 'user' | 'model', text: string }

const scope = (userId: string) => ({ user_id: userId })

export const memory = {
  async recall(userId: string, query: string): Promise<string[]> {
    const { retrievedMemories = [] } = await gcp<{ retrievedMemories?: { memory: { fact: string } }[] }>(
      `${platform()}/${useRuntimeConfig().gcp.engine}/memories:retrieve`,
      { scope: scope(userId), similaritySearchParams: { searchQuery: query, topK: 5 } },
    )
    return retrievedMemories.map(({ memory }) => memory.fact)
  },

  /** Extracts and consolidates facts in the background (returns a long-running operation). */
  async remember(userId: string, turns: Turn[]) {
    await gcp(`${platform()}/${useRuntimeConfig().gcp.engine}/memories:generate`, {
      scope: scope(userId),
      directContentsSource: {
        events: turns.map(({ role, text }) => ({ content: { role, parts: [{ text }] } })),
      },
    })
  },
}
