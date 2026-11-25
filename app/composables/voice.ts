import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from '@google/genai'

const base64 = (buffer: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buffer)))

function pcm(data: string, context: AudioContext) {
  const bytes = Uint8Array.from(atob(data), char => char.charCodeAt(0))
  const samples = new Int16Array(bytes.buffer)
  const audio = context.createBuffer(1, samples.length, 24_000)
  audio.getChannelData(0).set(Float32Array.from(samples, sample => sample / 0x8000))
  return audio
}

/**
 * Voice mode: the browser talks to the Gemini Live API directly over WebSocket,
 * authorized by a short-lived token from /api/voice.
 */
export function useVoice() {
  const status = ref<'idle' | 'connecting' | 'live'>('idle')
  let session: Session | undefined
  let microphone: MediaStream | undefined
  let input: AudioContext | undefined
  let output: AudioContext | undefined
  let playhead = 0
  const playing = new Set<AudioBufferSourceNode>()

  function play(message: LiveServerMessage) {
    if (!output) return
    if (message.serverContent?.interrupted) {
      playing.forEach(source => source.stop())
      playing.clear()
      playhead = 0
    }
    for (const part of message.serverContent?.modelTurn?.parts ?? []) {
      if (!part.inlineData?.data) continue
      const source = output.createBufferSource()
      source.buffer = pcm(part.inlineData.data, output)
      source.connect(output.destination)
      playhead = Math.max(playhead, output.currentTime)
      source.start(playhead)
      playhead += source.buffer.duration
      playing.add(source)
      source.onended = () => playing.delete(source)
    }
  }

  async function start() {
    status.value = 'connecting'
    try {
      const { token, model } = await $fetch('/api/voice', { method: 'POST' })
      output = new AudioContext({ sampleRate: 24_000 })
      const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: 'v1alpha' } })
      session = await ai.live.connect({
        model,
        config: { responseModalities: [Modality.AUDIO] },
        callbacks: { onmessage: play, onclose: stop, onerror: stop }
      })

      microphone = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })
      input = new AudioContext({ sampleRate: 16_000 })
      await input.audioWorklet.addModule('/worklets/pcm.js')
      const worklet = new AudioWorkletNode(input, 'pcm')
      worklet.port.onmessage = ({ data }: MessageEvent<ArrayBuffer>) =>
        session?.sendRealtimeInput({ audio: { data: base64(data), mimeType: 'audio/pcm;rate=16000' } })
      input.createMediaStreamSource(microphone).connect(worklet)
      status.value = 'live'
    } catch (error) {
      stop()
      throw error
    }
  }

  function stop() {
    const current = { session, microphone, input, output }
    session = microphone = input = output = undefined
    current.session?.close()
    current.microphone?.getTracks().forEach(track => track.stop())
    void current.input?.close()
    void current.output?.close()
    playing.clear()
    playhead = 0
    status.value = 'idle'
  }

  onScopeDispose(stop)

  return { status, start, stop, toggle: () => status.value === 'idle' ? start() : stop() }
}
