/** The canvas open in the side panel, if any. */
export function useCanvas() {
  const canvas = useState<Canvas | null>('canvas', () => null)
  const tab = useState<'preview' | 'code'>('canvas-tab', () => 'preview')

  return {
    canvas,
    tab,
    open(value: Canvas, show: 'preview' | 'code' = 'preview') {
      canvas.value = value
      tab.value = show
    },
    close() {
      canvas.value = null
    }
  }
}
