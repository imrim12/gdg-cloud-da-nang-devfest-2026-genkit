import { browse } from './browse'
import { python } from './python'
import { save } from './save'
import { search } from './search'
import { shell } from './shell'

/** Tools available to the agent, depending on what is configured. */
export function tools() {
  const enabled = features()
  return [
    search,
    enabled.code && python,
    enabled.shell && shell,
    enabled.browser && browse,
    enabled.files && save,
  ].filter(tool => !!tool)
}
