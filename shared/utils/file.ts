export interface FileWithStatus {
  file: File
  id: string
  status: 'uploading' | 'uploaded' | 'error'
  uploadedUrl?: string
  uploadedPathname?: string
  error?: string
}

export const FILE_UPLOAD_CONFIG = {
  maxSize: '8MB',
  types: ['image', 'application/pdf', 'text/csv', 'text/plain'],
  acceptPattern: 'image/*,application/pdf,.csv,text/csv,.txt,text/plain'
} as const

export function getFileIcon(mimeType: string, fileName?: string): string {
  if (mimeType.startsWith('image/')) return 'i-lucide-image'
  if (mimeType === 'application/pdf') return 'i-lucide-file-text'
  if (mimeType === 'text/csv' || fileName?.endsWith('.csv')) return 'i-lucide-file-spreadsheet'
  return 'i-lucide-file'
}

/** Uploads are stored as `<8 hex chars>-<name>` (server/api/upload); shows `<name>`. */
export function removeRandomSuffix(filename: string): string {
  return filename.replace(/^[0-9a-f]{8}-/, '')
}
