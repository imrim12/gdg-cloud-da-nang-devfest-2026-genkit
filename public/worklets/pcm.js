// Converts microphone audio to 16-bit PCM in ~100ms chunks for the Gemini Live API.
class Pcm extends AudioWorkletProcessor {
  buffer = new Int16Array(1600)
  length = 0

  process([input]) {
    const channel = input[0]
    if (!channel) return true
    for (const sample of channel) {
      this.buffer[this.length++] = Math.max(-1, Math.min(1, sample)) * 0x7FFF
      if (this.length === this.buffer.length) {
        this.port.postMessage(this.buffer.buffer.slice(0))
        this.length = 0
      }
    }
    return true
  }
}

registerProcessor('pcm', Pcm)
