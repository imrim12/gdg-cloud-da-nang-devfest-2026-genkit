import { browse } from './browse'
import { calculate } from './calculate'
import { canvas } from './canvas'
import { python } from './python'
import { save } from './save'
import { search } from './search'
import { shell } from './shell'

/** Tools available to the agent, depending on what is configured and toggled. */
export function tools({ webSearch = true } = {}) {
  const enabled = features()
  return [
    webSearch && search,
    calculate,
    canvas,
    enabled.code && python,
    enabled.shell && shell,
    enabled.browser && browse,
    enabled.files && save
  ].filter(tool => !!tool)
}
