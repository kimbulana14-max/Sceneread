// OpenAI Realtime API for transcription with filler word support
// Uses whisper-1 with prompt to preserve fillers
// 
// COST OPTIMIZATION: Audio is only sent when isListening is true
// This prevents billing during TTS playback, beeps, and transitions

import { useState, useRef, useCallback } from 'react'

export interface TranscriptWord {
  word: string
  start: number
  end: number
  confidence: number
  punctuated_word: string
}

interface UseOpenAIRealtimeOptions {
  onPartialTranscript?: (data: { text: string; words: TranscriptWord[] }) => void
  onCommittedTranscript?: (data: { text: string; words: TranscriptWord[] }) => void
  onSessionStarted?: () => void
  onError?: (error: Error) => void
  onDisconnect?: () => void
  onAudioLevel?: (level: number) => void // 0-1 audio level for visualization
}

export function useOpenAIRealtime(options: UseOpenAIRealtimeOptions = {}) {
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
  const currentTranscriptRef = useRef<string>('')
  const isConnectedRef = useRef(false) // Ref-based connection state (no stale closures)

  // CRITICAL: Controls whether audio is actually sent to OpenAI
  // When false, we're connected but not sending audio (no billing)
  const sendingAudioRef = useRef(false)

  // Self-record playback: MediaRecorder captures mic audio alongside STT
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordingChunksRef = useRef<Blob[]>([])

  const cleanup = useCallback(() => {
    console.log('[OpenAI Realtime] Cleanup called')
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
    // OpenAI Realtime expects 24kHz PCM16 audio
    const audioContext = new AudioContext({ sampleRate: 24000 })
    audioContextRef.current = audioContext
    const source = audioContext.createMediaStreamSource(stream)
    
    const processor = audioContext.createScriptProcessor(4096, 1, 1)
    processorRef.current = processor
    
    processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0)
      
      // Calculate audio level (RMS) for visualization - always do this when listening
      if (sendingAudioRef.current && onAudioLevel) {
        let sum = 0
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i]
        }
        const rms = Math.sqrt(sum / inputData.length)
        // Normalize to 0-1 range (typical speech RMS is 0.01-0.1)
        const level = Math.min(1, rms * 10)
        onAudioLevel(level)
      }
      
      // CRITICAL: Only send audio when actively listening
      // This is the key cost optimization - no audio sent during TTS/beeps
      if (!sendingAudioRef.current) return
      if (socket.readyState !== WebSocket.OPEN) return
      
      // Convert float32 to int16
      const pcm16 = new Int16Array(inputData.length)
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]))
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
      }
      
      // Convert to base64
      const base64 = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)))
      
      // Send audio chunk
      socket.send(JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: base64,
      }))
    }
    
    source.connect(processor)
    processor.connect(audioContext.destination)
  }, [onAudioLevel])

  const startSession = useCallback(async () => {
    // If already connected, just return true
    if (isConnected && socketRef.current?.readyState === WebSocket.OPEN) {
      console.log('[OpenAI Realtime] Already connected, reusing session')
      return true
    }
    
    try {
      cleanup()
      
      // Step 1: Get ephemeral token from our API
      console.log('[OpenAI Realtime] Fetching token...')
      const tokenRes = await fetch('/api/openai-realtime-token')
      if (!tokenRes.ok) {
        const errText = await tokenRes.text()
        console.error('[OpenAI Realtime] Token error:', errText)
        throw new Error('Failed to get OpenAI token')
      }
      const { client_secret } = await tokenRes.json()
      console.log('[OpenAI Realtime] Got token:', client_secret?.substring(0, 10) + '...')
      
      // Step 2: Get microphone access
      console.log('[OpenAI Realtime] Requesting microphone...')
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 24000,
        }
      })
      streamRef.current = stream
      
      // Step 3: Connect to OpenAI Realtime WebSocket
      const wsUrl = 'wss://api.openai.com/v1/realtime?intent=transcription'
      console.log('[OpenAI Realtime] Connecting to WebSocket...')
      
      return new Promise<boolean>((resolve) => {
        const socket = new WebSocket(wsUrl, [
          'realtime',
          `openai-insecure-api-key.${client_secret}`,
        ])
        socketRef.current = socket

        socket.onopen = () => {
          console.log('[OpenAI Realtime] Connected! (audio paused until startListening)')
          isConnectedRef.current = true
          setIsConnected(true)
          // NOTE: isListening stays false until startListening() is called
          // Audio capture starts but sendingAudioRef is false, so no billing yet
          onSessionStarted?.()
          startAudioCapture(socket, stream)
          resolve(true)
        }

        socket.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data)
            
            // Only log important messages to reduce noise
            if (!['input_audio_buffer.speech_started', 'input_audio_buffer.speech_stopped'].includes(message.type)) {
              console.log('[OpenAI Realtime] Message:', message.type)
            }
            
            // Handle session created
            if (message.type === 'session.created' || message.type === 'transcription_session.created') {
              console.log('[OpenAI Realtime] Session created:', message.session?.id)
            }
            
            // Handle transcription delta (partial)
            if (message.type === 'conversation.item.input_audio_transcription.delta' || 
                message.type === 'transcription.delta') {
              const text = message.delta || message.text || ''
              currentTranscriptRef.current += text
              onPartialTranscript?.({ text: currentTranscriptRef.current, words: [] })
            }
            
            // Handle transcription completed
            if (message.type === 'conversation.item.input_audio_transcription.completed' ||
                message.type === 'transcription.completed') {
              const text = message.transcript || message.text || ''
              console.log('[OpenAI Realtime] Completed:', text)
              currentTranscriptRef.current = ''
              onCommittedTranscript?.({ text, words: [] })
            }
            
            // Handle errors
            if (message.type === 'error') {
              console.error('[OpenAI Realtime] Error:', message.error)
              onError?.(new Error(message.error?.message || 'Unknown error'))
            }
            
          } catch (e) {
            console.error('[OpenAI Realtime] Failed to parse message:', e)
          }
        }

        socket.onerror = (event) => {
          console.error('[OpenAI Realtime] WebSocket error:', event)
          onError?.(new Error('WebSocket connection error'))
          resolve(false)
        }

        socket.onclose = (event) => {
          console.log('[OpenAI Realtime] Connection closed:', event.code, event.reason)
          sendingAudioRef.current = false
          isConnectedRef.current = false
          setIsConnected(false)
          setIsListening(false)
          onDisconnect?.()
        }
        
        // Timeout after 10 seconds
        setTimeout(() => {
          if (socket.readyState !== WebSocket.OPEN) {
            console.error('[OpenAI Realtime] Connection timeout')
            socket.close()
            resolve(false)
          }
        }, 10000)
      })

    } catch (err) {
      console.error('[OpenAI Realtime] Start error:', err)
      onError?.(err instanceof Error ? err : new Error('Failed to start session'))
      return false
    }
  }, [cleanup, isConnected, onPartialTranscript, onCommittedTranscript, onSessionStarted, onError, onDisconnect, startAudioCapture])

  // START listening - begins sending audio to OpenAI (billing starts)
  const startListening = useCallback(() => {
    if (!isConnected) {
      console.warn('[OpenAI Realtime] Cannot start listening - not connected')
      return false
    }
    console.log('[OpenAI Realtime] START listening - audio sending enabled')
    currentTranscriptRef.current = ''
    sendingAudioRef.current = true
    setIsListening(true)
    return true
  }, [isConnected])

  // PAUSE listening - stops sending audio to OpenAI (billing stops)
  const pauseListening = useCallback(() => {
    console.log('[OpenAI Realtime] PAUSE listening - audio sending disabled')
    sendingAudioRef.current = false
    setIsListening(false)
    currentTranscriptRef.current = ''
  }, [])

  // Update Whisper prompt to bias transcription toward expected line text
  const updatePrompt = useCallback((expectedLine: string) => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return

    // Build prompt: expected line (truncated) + filler suffix
    const truncated = expectedLine.slice(0, 200)
    const prompt = truncated
      ? `${truncated} Umm, let me think, hmm... mhm, uh-huh`
      : 'Umm, let me think like, hmm... mhm, mm-hmm, uh-huh, uh, ah, er, um, hm, yeah, yea, yep, yup, nope, nah, okay, alright, mmm-hmm'

    console.log('[OpenAI Realtime] Updating prompt:', prompt.slice(0, 60) + '...')
    socket.send(JSON.stringify({
      type: 'transcription_session.update',
      session: {
        input_audio_transcription: {
          prompt,
        },
      },
    }))
  }, [])

  // Full disconnect
  const stopSession = useCallback(() => {
    console.log('[OpenAI Realtime] Stopping session completely...')
    cleanup()
  }, [cleanup])

  // Start recording mic audio for playback (parallel to STT)
  const startRecording = useCallback(() => {
    if (!streamRef.current) return false
    recordingChunksRef.current = []

    // Detect supported codec (webm for Chrome/Android, mp4 for iOS Safari)
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', '']
    let mimeType = ''
    for (const c of candidates) {
      if (!c || MediaRecorder.isTypeSupported(c)) { mimeType = c; break }
    }

    try {
      const options: MediaRecorderOptions = { audioBitsPerSecond: 64000 }
      if (mimeType) options.mimeType = mimeType
      const recorder = new MediaRecorder(streamRef.current, options)
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordingChunksRef.current.push(e.data)
      }
      recorder.start(250) // Collect chunks every 250ms
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

  // Check connection using ref (never stale in closures)
  const checkConnected = useCallback(() => {
    return isConnectedRef.current && socketRef.current?.readyState === WebSocket.OPEN
  }, [])

  return {
    isConnected,
    isListening,
    startSession,    // Connect to OpenAI (but don't send audio yet)
    startListening,  // Start sending audio (billing begins)
    pauseListening,  // Stop sending audio (billing stops, connection kept)
    stopSession,     // Full disconnect
    updatePrompt,    // Update Whisper prompt for expected line (instant, no reconnect!)
    checkConnected,  // Ref-based connection check (never stale)
    startRecording,  // Start recording mic for playback
    stopRecording,   // Stop recording and get audio blob
  }
}
