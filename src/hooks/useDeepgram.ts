// Deepgram Nova-3 streaming STT with keyterm prompting
// Simpler architecture than OpenAI Realtime: open socket → send audio → receive transcripts
//
// COST OPTIMIZATION: Audio is only sent when isListening is true
// Connection stays open but audio is gated by sendingAudioRef

import { useState, useRef, useCallback } from 'react'

export interface TranscriptWord {
  word: string
  start: number
  end: number
  confidence: number
  punctuated_word: string
}

interface UseDeepgramOptions {
  onPartialTranscript?: (data: { text: string; words: TranscriptWord[] }) => void
  onCommittedTranscript?: (data: { text: string; words: TranscriptWord[] }) => void
  onSessionStarted?: () => void
  onError?: (error: Error) => void
  onDisconnect?: () => void
  onAudioLevel?: (level: number) => void
}

const DEEPGRAM_API_KEY = process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY || ''

export function useDeepgram(options: UseDeepgramOptions = {}) {
  const {
    onPartialTranscript,
    onCommittedTranscript,
    onSessionStarted,
    onError,
    onDisconnect,
    onAudioLevel,
  } = options

  const [isConnected, setIsConnected] = useState(false)
  const [isListening, setIsListening] = useState(false)

  const socketRef = useRef<WebSocket | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const sendingAudioRef = useRef(false)
  const isConnectedRef = useRef(false) // Ref-based connection state (no stale closures)
  const keytermsRef = useRef<string[]>([]) // Current keyterms for reconnect

  // Self-record playback: MediaRecorder captures mic audio alongside STT
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordingChunksRef = useRef<Blob[]>([])

  // Accumulated partial text between finals
  const partialAccumRef = useRef('')

  const cleanup = useCallback(() => {
    console.log('[Deepgram] Cleanup called')
    sendingAudioRef.current = false
    isConnectedRef.current = false
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current = null
    }
    recordingChunksRef.current = []
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (socketRef.current) {
      socketRef.current.close()
      socketRef.current = null
    }
    setIsConnected(false)
    setIsListening(false)
  }, [])

  const startAudioCapture = useCallback((socket: WebSocket, stream: MediaStream) => {
    // Deepgram expects 16kHz linear16 PCM audio
    const audioContext = new AudioContext({ sampleRate: 16000 })
    audioContextRef.current = audioContext
    const source = audioContext.createMediaStreamSource(stream)

    const processor = audioContext.createScriptProcessor(4096, 1, 1)
    processorRef.current = processor

    processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0)

      // Audio level visualization (always when sending)
      if (sendingAudioRef.current && onAudioLevel) {
        let sum = 0
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i]
        }
        const rms = Math.sqrt(sum / inputData.length)
        const level = Math.min(1, rms * 10)
        onAudioLevel(level)
      }

      // Only send audio when actively listening
      if (!sendingAudioRef.current) return
      if (socket.readyState !== WebSocket.OPEN) return

      // Convert float32 to int16 PCM
      const pcm16 = new Int16Array(inputData.length)
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]))
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
      }

      // Send raw binary audio (Deepgram expects raw bytes, not base64)
      socket.send(pcm16.buffer)
    }

    source.connect(processor)
    processor.connect(audioContext.destination)
  }, [onAudioLevel])

  // Build the WebSocket URL with query params
  const buildWsUrl = useCallback((keyterms: string[]) => {
    const params = new URLSearchParams({
      model: 'nova-3',
      language: 'en',
      encoding: 'linear16',
      sample_rate: '16000',
      channels: '1',
      interim_results: 'true',
      punctuate: 'true',
      endpointing: '300', // 300ms silence = end of utterance
      utterance_end_ms: '1500', // Utterance end after 1.5s silence
      vad_events: 'true',
      smart_format: 'true',
    })

    // Add keyterms (each as separate param)
    keyterms.forEach(term => {
      if (term.trim()) params.append('keyterm', term.trim())
    })

    return `wss://api.deepgram.com/v1/listen?${params.toString()}`
  }, [])

  const startSession = useCallback(async (keyterms: string[] = []) => {
    // If already connected with open socket, just return
    if (isConnectedRef.current && socketRef.current?.readyState === WebSocket.OPEN) {
      console.log('[Deepgram] Already connected, reusing session')
      return true
    }

    try {
      cleanup()

      // Step 1: Get microphone access
      console.log('[Deepgram] Requesting microphone...')
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
        }
      })
      streamRef.current = stream

      // Step 2: Connect to Deepgram WebSocket (no token endpoint needed!)
      keytermsRef.current = keyterms
      const wsUrl = buildWsUrl(keyterms)
      console.log('[Deepgram] Connecting to WebSocket...')

      return new Promise<boolean>((resolve) => {
        const socket = new WebSocket(wsUrl, ['token', DEEPGRAM_API_KEY])
        socketRef.current = socket

        socket.onopen = () => {
          console.log('[Deepgram] Connected! (audio paused until startListening)')
          isConnectedRef.current = true
          setIsConnected(true)
          onSessionStarted?.()
          startAudioCapture(socket, stream)
          resolve(true)
        }

        socket.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data)

            if (message.type === 'Results') {
              const alt = message.channel?.alternatives?.[0]
              if (!alt) return

              const transcript = alt.transcript || ''
              const words: TranscriptWord[] = (alt.words || []).map((w: any) => ({
                word: w.word,
                start: w.start,
                end: w.end,
                confidence: w.confidence,
                punctuated_word: w.punctuated_word || w.word,
              }))

              if (!transcript.trim()) return

              if (message.is_final) {
                // Final result — commit this chunk
                console.log('[Deepgram] Final:', transcript)
                partialAccumRef.current = ''
                onCommittedTranscript?.({ text: transcript, words })
              } else {
                // Interim result — show as partial
                console.log('[Deepgram] Interim:', transcript)
                onPartialTranscript?.({ text: transcript, words })
              }
            }

            if (message.type === 'SpeechStarted') {
              console.log('[Deepgram] Speech detected')
            }

            if (message.type === 'Metadata') {
              console.log('[Deepgram] Session metadata received')
            }

          } catch (e) {
            console.error('[Deepgram] Failed to parse message:', e)
          }
        }

        socket.onerror = (event) => {
          console.error('[Deepgram] WebSocket error:', event)
          onError?.(new Error('WebSocket connection error'))
          isConnectedRef.current = false
          resolve(false)
        }

        socket.onclose = (event) => {
          console.log('[Deepgram] Connection closed:', event.code, event.reason)
          sendingAudioRef.current = false
          isConnectedRef.current = false
          setIsConnected(false)
          setIsListening(false)
          onDisconnect?.()
        }

        // Timeout after 10 seconds
        setTimeout(() => {
          if (socket.readyState !== WebSocket.OPEN) {
            console.error('[Deepgram] Connection timeout')
            socket.close()
            isConnectedRef.current = false
            resolve(false)
          }
        }, 10000)
      })

    } catch (err) {
      console.error('[Deepgram] Start error:', err)
      onError?.(err instanceof Error ? err : new Error('Failed to start session'))
      return false
    }
  }, [cleanup, buildWsUrl, onPartialTranscript, onCommittedTranscript, onSessionStarted, onError, onDisconnect, startAudioCapture])

  // START listening - begins sending audio to Deepgram (billing starts)
  const startListening = useCallback(() => {
    if (!isConnectedRef.current) {
      console.warn('[Deepgram] Cannot start listening - not connected')
      return false
    }
    console.log('[Deepgram] START listening - audio sending enabled')
    partialAccumRef.current = ''
    sendingAudioRef.current = true
    setIsListening(true)
    return true
  }, [])

  // PAUSE listening - stops sending audio (billing stops, connection kept)
  const pauseListening = useCallback(() => {
    console.log('[Deepgram] PAUSE listening - audio sending disabled')
    sendingAudioRef.current = false
    setIsListening(false)
    partialAccumRef.current = ''
  }, [])

  // Update keyterms by reconnecting with new params
  // Deepgram doesn't support dynamic param changes, so we reconnect
  // This is fast (~200ms) unlike OpenAI's 1-3 second session setup
  const updateKeyterms = useCallback(async (keyterms: string[]) => {
    keytermsRef.current = keyterms
    // Only reconnect if already connected — otherwise keyterms will be used on next startSession
    if (!isConnectedRef.current || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      return
    }
    // Close current socket and reopen with new keyterms
    // Preserve the mic stream to avoid re-requesting permissions
    const stream = streamRef.current
    if (!stream) return

    console.log('[Deepgram] Reconnecting with new keyterms:', keyterms.slice(0, 5).join(', '), '...')

    // Close old socket
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    if (socketRef.current) {
      socketRef.current.close()
      socketRef.current = null
    }
    isConnectedRef.current = false
    setIsConnected(false)

    // Open new socket with updated keyterms
    const wsUrl = buildWsUrl(keyterms)
    return new Promise<boolean>((resolve) => {
      const socket = new WebSocket(wsUrl, ['token', DEEPGRAM_API_KEY])
      socketRef.current = socket

      socket.onopen = () => {
        console.log('[Deepgram] Reconnected with new keyterms')
        isConnectedRef.current = true
        setIsConnected(true)
        startAudioCapture(socket, stream)
        resolve(true)
      }

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          if (message.type === 'Results') {
            const alt = message.channel?.alternatives?.[0]
            if (!alt) return
            const transcript = alt.transcript || ''
            const words: TranscriptWord[] = (alt.words || []).map((w: any) => ({
              word: w.word,
              start: w.start,
              end: w.end,
              confidence: w.confidence,
              punctuated_word: w.punctuated_word || w.word,
            }))
            if (!transcript.trim()) return
            if (message.is_final) {
              partialAccumRef.current = ''
              onCommittedTranscript?.({ text: transcript, words })
            } else {
              onPartialTranscript?.({ text: transcript, words })
            }
          }
        } catch (e) {
          console.error('[Deepgram] Failed to parse message:', e)
        }
      }

      socket.onerror = (event) => {
        console.error('[Deepgram] WebSocket error on reconnect:', event)
        isConnectedRef.current = false
        resolve(false)
      }

      socket.onclose = (event) => {
        sendingAudioRef.current = false
        isConnectedRef.current = false
        setIsConnected(false)
        setIsListening(false)
        onDisconnect?.()
      }

      setTimeout(() => {
        if (socket.readyState !== WebSocket.OPEN) {
          socket.close()
          isConnectedRef.current = false
          resolve(false)
        }
      }, 5000)
    })
  }, [buildWsUrl, startAudioCapture, onPartialTranscript, onCommittedTranscript, onDisconnect])

  // Full disconnect
  const stopSession = useCallback(() => {
    console.log('[Deepgram] Stopping session completely...')
    cleanup()
  }, [cleanup])

  // Check connection using ref (never stale)
  const checkConnected = useCallback(() => {
    return isConnectedRef.current && socketRef.current?.readyState === WebSocket.OPEN
  }, [])

  // Start recording mic audio for playback (parallel to STT)
  const startRecording = useCallback(() => {
    if (!streamRef.current) return false
    recordingChunksRef.current = []

    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', '']
    let mimeType = ''
    for (const c of candidates) {
      if (!c || MediaRecorder.isTypeSupported(c)) { mimeType = c; break }
    }

    try {
      const recOptions: MediaRecorderOptions = { audioBitsPerSecond: 64000 }
      if (mimeType) recOptions.mimeType = mimeType
      const recorder = new MediaRecorder(streamRef.current, recOptions)
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordingChunksRef.current.push(e.data)
      }
      recorder.start(250)
      mediaRecorderRef.current = recorder
      return true
    } catch (err) {
      console.warn('[Recording] MediaRecorder error:', err)
      return false
    }
  }, [])

  // Stop recording and return audio blob
  const stopRecording = useCallback((): Promise<Blob | null> => {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      return Promise.resolve(null)
    }
    return new Promise<Blob | null>((resolve) => {
      recorder.onstop = () => {
        const mt = recorder.mimeType || 'audio/webm'
        const blob = new Blob(recordingChunksRef.current, { type: mt })
        recordingChunksRef.current = []
        mediaRecorderRef.current = null
        resolve(blob)
      }
      recorder.stop()
    })
  }, [])

  return {
    isConnected,
    isListening,
    startSession,      // Connect to Deepgram (audio paused until startListening)
    startListening,     // Start sending audio (billing begins)
    pauseListening,     // Stop sending audio (billing stops, connection kept)
    stopSession,        // Full disconnect
    updateKeyterms,     // Reconnect with new keyterms for expected line
    checkConnected,     // Ref-based connection check (never stale)
    startRecording,     // Start recording mic for playback
    stopRecording,      // Stop recording and get audio blob
  }
}
