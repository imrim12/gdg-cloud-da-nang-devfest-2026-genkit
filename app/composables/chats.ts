import type { UIMessage } from 'ai'
import { createSharedComposable, useLocalStorage } from '@vueuse/core'

export type Chat = { id: string, title: string, messages: UIMessage[], updatedAt: number }

/** Chat history, kept in the browser for the MVP. */
export const useChats = createSharedComposable(() => {
  const store = useLocalStorage<Record<string, Chat>>('chats', {})

  const list = computed(() => Object.values(store.value).sort((a, b) => b.updatedAt - a.updatedAt))

  function save(id: string, messages: UIMessage[]) {
    const first = messages[0]?.parts.find(part => part.type === 'text')
    const title = store.value[id]?.title ?? first?.text.slice(0, 60) ?? 'New chat'
    store.value[id] = { id, title, messages, updatedAt: Date.now() }
  }

  function remove(id: string) {
    const { [id]: _, ...rest } = store.value
    store.value = rest
  }

  return { list, get: (id: string) => store.value[id], save, remove }
})
