// On-device speech-to-text manager (main thread side).
//
// Owns the Web Worker that runs Moonshine-Tiny via transformers.js, and turns a
// recorded audio Blob into a transcript entirely in the browser. Used as a
// BACKUP for the live Deepgram stream: if the cloud transcript comes back empty
// (dropped socket, flaky mobile network), the practice screen calls
// transcribeBlobOnDevice() so a connection blip doesn't auto-fail a line.
//
// Everything here fails soft — any error (no worker support, decode failure,
// model load failure, timeout) resolves to an empty string, and the caller
// simply falls back to its existing "no transcript" handling.

let worker: Worker | null = null
let workerBroken = false
let reqId = 0
const pending = new Map<number, (text: string) => void>()

function getWorker(): Worker | null {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') return null
  if (workerBroken) return null
  if (worker) return worker
  try {
    worker = new Worker(new URL('../workers/sttWorker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent) => {
      const { id, type, text, error } = e.data || {}
      const resolve = pending.get(id)
      if (!resolve) return
      pending.delete(id)
      if (type === 'result') resolve(text || '')
      else if (type === 'ready') resolve('')
      else {
        if (error) console.warn('[onDeviceSTT] worker error:', error)
        resolve('')
      }
    }
    worker.onerror = (e) => {
      console.warn('[onDeviceSTT] worker crashed:', e.message)
      workerBroken = true
      // Resolve everything in flight so no caller hangs.
      pending.forEach((resolve) => resolve(''))
      pending.clear()
      worker = null
    }
  } catch (e) {
    console.warn('[onDeviceSTT] cannot create worker:', e)
    worker = null
    workerBroken = true
  }
  return worker
}

// Decode an audio Blob (webm/opus, mp4/aac, …) to mono PCM Float32 at 16 kHz —
// the format Moonshine expects. Uses OfflineAudioContext so decode + resample
// happen in one pass and work cross-browser (incl. iOS Safari).
async function blobToMono16k(blob: Blob): Promise<Float32Array | null> {
  try {
    const buf = await blob.arrayBuffer()
    const AC: typeof AudioContext =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ac = new AC()
    let decoded: AudioBuffer
    try {
      decoded = await ac.decodeAudioData(buf.slice(0))
    } finally {
      // Some Safari versions lack close(); guard it.
      try { await ac.close?.() } catch { /* ignore */ }
    }

    const targetRate = 16000
    const length = Math.ceil(decoded.duration * targetRate)
    if (length <= 0) return null

    const OAC: typeof OfflineAudioContext =
      window.OfflineAudioContext ||
      (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext
    const offline = new OAC(1, length, targetRate)
    const src = offline.createBufferSource()
    src.buffer = decoded
    src.connect(offline.destination)
    src.start()
    const rendered = await offline.startRendering()
    return rendered.getChannelData(0)
  } catch (e) {
    console.warn('[onDeviceSTT] audio decode failed:', e)
    return null
  }
}

/**
 * Transcribe a recorded audio Blob fully on-device. Resolves to the recognised
 * text, or '' on any failure / timeout (never rejects).
 */
export async function transcribeBlobOnDevice(blob: Blob, timeoutMs = 20000): Promise<string> {
  const w = getWorker()
  if (!w) return ''

  const audio = await blobToMono16k(blob)
  if (!audio || audio.length === 0) return ''

  const id = ++reqId
  return new Promise<string>((resolve) => {
    let settled = false
    const finish = (text: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      pending.delete(id)
      resolve(text)
    }
    const timer = setTimeout(() => finish(''), timeoutMs)
    pending.set(id, finish)
    try {
      // Transfer the audio buffer to avoid a copy.
      w.postMessage({ id, type: 'transcribe', audio }, [audio.buffer])
    } catch (e) {
      console.warn('[onDeviceSTT] postMessage failed:', e)
      finish('')
    }
  })
}

/**
 * Warm the model in the background so the first real fallback is fast. Safe to
 * call repeatedly; only the first call triggers a download. No-op when the
 * worker is unavailable.
 */
export function preloadOnDeviceSTT(): void {
  const w = getWorker()
  if (!w) return
  const id = ++reqId
  pending.set(id, () => { /* ready ack — nothing to do */ })
  try {
    w.postMessage({ id, type: 'preload' })
  } catch {
    pending.delete(id)
  }
}
