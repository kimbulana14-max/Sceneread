// Web Speech API hook - simple, free, built-in end-of-speech detection
import { useState, useRef, useCallback, useEffect } from 'react'

interface UseWebSpeechOptions {
  onResult?: (transcript: string, isFinal: boolean) => void
  onEnd?: (finalTranscript: string) => void
  onError?: (error: string) => void
  language?: string
  continuous?: boolean
}

interface UseWebSpeechReturn {
  isListening: boolean
  transcript: string
  startListening: () => void
  stopListening: () => void
  isSupported: boolean
}

export function useWebSpeech(options: UseWebSpeechOptions = {}): UseWebSpeechReturn {
  const {
    onResult,
    onEnd,
    onError,
    language = 'en-US',
    continuous = false,
  } = options

  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const recognitionRef = useRef<any>(null)
  const finalTranscriptRef = useRef('')

  // Check browser support
  const isSupported = typeof window !== 'undefined' && 
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  useEffect(() => {
    if (!isSupported) return

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRecognition()
    
    recognition.continuous = continuous
    recognition.interimResults = true
    recognition.lang = language

    recognition.onstart = () => {
      console.log('[WebSpeech] Started listening')
      setIsListening(true)
      finalTranscriptRef.current = ''
      setTranscript('')
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let interim = ''
      let final = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          final += result[0].transcript
        } else {
          interim += result[0].transcript
        }
      }

      if (final) {
        finalTranscriptRef.current += final
      }

      const currentTranscript = finalTranscriptRef.current + interim
      setTranscript(currentTranscript)
      console.log('[WebSpeech] Result:', currentTranscript, 'isFinal:', !!final)
      
      onResult?.(currentTranscript, !!final)
    }

    recognition.onend = () => {
      console.log('[WebSpeech] Ended, final transcript:', finalTranscriptRef.current || transcript)
      setIsListening(false)
      onEnd?.(finalTranscriptRef.current || transcript)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      console.error('[WebSpeech] Error:', event.error)
      setIsListening(false)
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        onError?.(event.error)
      }
    }

    recognitionRef.current = recognition

    return () => {
      recognition.abort()
    }
  }, [isSupported, language, continuous, onResult, onEnd, onError, transcript])

  const startListening = useCallback(() => {
    if (!recognitionRef.current || isListening) return
    
    try {
      finalTranscriptRef.current = ''
      setTranscript('')
      recognitionRef.current.start()
    } catch (e) {
      console.error('[WebSpeech] Start error:', e)
    }
  }, [isListening])

  const stopListening = useCallback(() => {
    if (!recognitionRef.current || !isListening) return
    
    try {
      recognitionRef.current.stop()
    } catch (e) {
      console.error('[WebSpeech] Stop error:', e)
    }
  }, [isListening])

  return {
    isListening,
    transcript,
    startListening,
    stopListening,
    isSupported,
  }
}

// Type declarations for Web Speech API
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SpeechRecognition: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    webkitSpeechRecognition: any
  }
}
