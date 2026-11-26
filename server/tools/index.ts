import { browse } from './browse'
import { calculate } from './calculate'
import { canvas } from './canvas'
import { recentChatsTool, searchChatsTool } from './chats'
import { memoryTool } from './memory'
import { python } from './python'
import { save } from './save'
import { search } from './search'
import { shell } from './shell'

/** Tools available to the agent, depending on what is configured and toggled. */
export async function tools({ webSearch = true, userId, settings }: { webSearch?: boolean, userId: string, settings: UserSettings }) {
  const enabled = features()
  return [
    webSearch && search,
    calculate,
    canvas,
    enabled.code && python,
    enabled.shell && shell,
    enabled.browser && browse,
    enabled.files && save,
    settings.searchChats && searchChatsTool,
    settings.searchChats && recentChatsTool,
    enabled.memory && settings.generateMemory && memoryTool,
    // Gmail, Drive, Docs, Sheets: the MCP tools of the connectors the user turned on
    ...await connectorTools(userId)
  ].filter(tool => !!tool)
}
