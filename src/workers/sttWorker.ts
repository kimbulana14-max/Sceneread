/// <reference lib="webworker" />
//
// On-device speech-to-text worker (transformers.js / ONNX Runtime Web).
//
// Runs the Moonshine-Tiny ASR model fully in the browser so the app can
// recognise a spoken line WITHOUT the cloud when Deepgram drops out. It is a
// *backup* path: the main thread only calls it when the live cloud transcript
// is empty, so model download + inference latency never touches the happy path.
//
// Design notes:
// - Single-threaded WASM is forced so we do NOT require cross-origin isolation
//   (COOP/COEP) headers. WebGPU is used opportunistically when present.
// - The model is lazy-loaded once and reused for the lifetime of the worker.
// - Any failure resolves to an empty transcript on the caller side; this worker
//   simply reports an 'error' message and the manager treats it as "no result".

import { pipeline, env } from '@huggingface/transformers'

// Pull weights from the HF hub (no local model files bundled).
env.allowLocalModels = false
// Avoid SharedArrayBuffer / cross-origin-isolation requirement.
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.numThreads = 1
}

const MODEL_ID = 'onnx-community/moonshine-tiny-ONNX'

// A minimal callable type for the ASR pipeline. transformers.js's own
// `pipeline()` overloads resolve to a union too large for TS to represent, so
// we load through this narrowed signature instead.
type AsrOutput = { text?: string } | Array<{ text?: string }>
type Transcriber = (audio: Float32Array) => Promise<AsrOutput>
const loadAsr = pipeline as unknown as (
  task: 'automatic-speech-recognition',
  model: string,
  options?: { device?: 'webgpu' | 'wasm' },
) => Promise<Transcriber>

let transcriber: Transcriber | null = null
let loading: Promise<Transcriber> | null = null

async function getTranscriber(): Promise<Transcriber> {
  if (transcriber) return transcriber
  if (!loading) {
    loading = (async () => {
      // Prefer WebGPU when the worker has access to it; fall back to WASM.
      let device: 'webgpu' | 'wasm' = 'wasm'
      try {
        if (typeof navigator !== 'undefined' && (navigator as unknown as { gpu?: unknown }).gpu) {
          device = 'webgpu'
        }
      } catch {
        device = 'wasm'
      }
      try {
        transcriber = await loadAsr('automatic-speech-recognition', MODEL_ID, { device })
      } catch {
        // WebGPU can fail to initialise on some devices — retry on WASM.
        transcriber = await loadAsr('automatic-speech-recognition', MODEL_ID, { device: 'wasm' })
      }
      return transcriber
    })()
  }
  return loading
}

interface InboundMessage {
  id: number
  type: 'preload' | 'transcribe'
  audio?: Float32Array
}

self.onmessage = async (e: MessageEvent<InboundMessage>) => {
  const { id, type, audio } = e.data || ({} as InboundMessage)

  if (type === 'preload') {
    try {
      await getTranscriber()
      ;(self as unknown as Worker).postMessage({ id, type: 'ready' })
    } catch (err) {
      ;(self as unknown as Worker).postMessage({ id, type: 'error', error: String((err as Error)?.message || err) })
    }
    return
  }

  if (type === 'transcribe') {
    try {
      if (!audio || audio.length === 0) {
        ;(self as unknown as Worker).postMessage({ id, type: 'result', text: '' })
        return
      }
      const t = await getTranscriber()
      // Moonshine expects mono PCM at 16 kHz, which the manager guarantees.
      const out = (await t(audio)) as { text?: string } | { text?: string }[]
      const text = (Array.isArray(out) ? out[0]?.text : out?.text) || ''
      ;(self as unknown as Worker).postMessage({ id, type: 'result', text: text.trim() })
    } catch (err) {
      ;(self as unknown as Worker).postMessage({ id, type: 'error', error: String((err as Error)?.message || err) })
    }
  }
}
