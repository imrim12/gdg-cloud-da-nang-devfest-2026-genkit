import type { UIMessage } from 'ai'

export type Visibility = 'public' | 'private'

export interface Chat {
  id: string
  userId: string
  title: string
  visibility: Visibility
  createdAt: string
}

export interface StoredMessage {
  id: string
  chatId: string
  role: 'user' | 'assistant'
  parts: UIMessage['parts']
  createdAt: string
}

export interface Vote {
  chatId: string
  messageId: string
  isUpvoted: boolean
}

export interface Model {
  label: string
  value: string
  icon: string
  thinking: boolean
}

/** A web page the model builds, previewed in the canvas panel. */
export interface Canvas {
  id: string
  title: string
  version: number
  files: { path: string, content: string }[]
  /** Screenshot taken in the computer use sandbox, when available. */
  screenshot?: string
  /** Problems the self-check found in the sandbox browser. */
  issues?: string[]
  /** Still being written: a progress update, not the final canvas. */
  preliminary?: boolean
}
