/** Per-user settings, edited in Settings (app/components/settings). */
export interface UserSettings {
  /** Custom instructions added to every chat's system prompt. */
  instructions: string
  /** The agent can search and cite the user's earlier chats. */
  searchChats: boolean
  /** Memory Bank learns from chats, and memories are used in new chats. */
  generateMemory: boolean
}

export const DEFAULT_SETTINGS: UserSettings = {
  instructions: '',
  searchChats: true,
  generateMemory: true
}

/** A Memory Bank memory, as shown in the memory manager. */
export interface MemoryItem {
  /** The last segment of the Memory resource name. */
  id: string
  fact: string
  /** Section key, see MEMORY_SECTIONS (shared/utils/memory.ts). */
  section: string
  createTime?: string
  updateTime?: string
}

/** A connector (MCP server) and its state for the current user. */
export interface ConnectorInfo {
  id: string
  name: string
  description: string
  icon: string
  url: string
  /** The user authorized it. */
  connected: boolean
  /** Its tools are given to the agent (toggled in the prompt menu). */
  enabled: boolean
  /** The account it was connected with. */
  account?: string
  /** The token was revoked or expired: connect again. */
  needsReconnect?: boolean
}
