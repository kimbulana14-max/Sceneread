'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence, PanInfo } from 'framer-motion'
import { useStore, useSettings, useScriptPractice } from '@/store'
import { checkAccuracy, getLockedWordMatch, createFreshLockedState, LockedWordState, getWordByWordResults } from '@/lib/accuracy'
import { Card, Button, ProgressBar } from './ui'
import { IconPlay, IconPause, IconSkipBack, IconSkipForward, IconMic, IconCheck, IconLoop, IconSettings } from './icons'
import { EditModal, updateLine, updateCharacter, updateScript, deleteLine, addLine } from './EditModal'
import { supabase, getAuthHeaders } from '@/lib/supabase'
import { useOpenAIRealtime } from '@/hooks/useOpenAIRealtime'
import { triggerAchievementCheck } from '@/hooks/useAchievements'

import { audioManager, playTone as audioPlayTone } from '@/lib/audioManager'

// Record a completed line to daily stats and update streak
const recordLineCompletion = async (userId: string) => {
  if (!userId) return
  
  try {
    const today = new Date().toISOString().split('T')[0]
    const headers = await getAuthHeaders()
    
    // Upsert daily stats
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/daily_stats?user_id=eq.${userId}&date=eq.${today}`, {
      method: 'GET',
      headers,
    }).then(async res => {
      if (res.ok) {
        const existing = await res.json()
        if (existing.length > 0) {
          // Update existing
          await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/daily_stats?id=eq.${existing[0].id}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ lines_practiced: (existing[0].lines_practiced || 0) + 1 })
          })
        } else {
          // Insert new
          await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/daily_stats`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ user_id: userId, date: today, lines_practiced: 1, practice_minutes: 0, sessions_count: 1 })
          })
        }
      }
    })
    
    // Update profile streak and total lines
    const profileRes = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, { headers })
    if (profileRes.ok) {
      const profiles = await profileRes.json()
      if (profiles.length > 0) {
        const profile = profiles[0]
        const lastDate = profile.streak_last_date
        const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
        const yesterdayStr = yesterday.toISOString().split('T')[0]
        
        let newStreak = profile.streak_days || 0
        if (lastDate === yesterdayStr) {
          newStreak += 1 // Continue streak
        } else if (lastDate !== today) {
          newStreak = 1 // Reset streak
        }
        // If lastDate === today, don't change streak
        
        await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            streak_days: newStreak,
            streak_last_date: today,
            total_lines_practiced: (profile.total_lines_practiced || 0) + 1
          })
        })
      }
    }
    
    // Trigger achievement check after stats are updated
    setTimeout(() => triggerAchievementCheck(), 500)
  } catch (err) {
    console.error('Error recording line completion:', err)
  }
}

const playTone = (freq: number, dur: number, type: OscillatorType = 'sine') => {
  audioPlayTone(freq, dur, type, 0.15)
}
const playCorrect = () => { playTone(659, 0.1); setTimeout(() => playTone(880, 0.15), 100) } // E5 → A5
const playIncorrect = () => { 
  // Descending "wrong" sound - more noticeable
  playTone(400, 0.15, 'sawtooth')
  setTimeout(() => playTone(300, 0.2, 'sawtooth'), 120)
}
const playCheckpoint = () => { playTone(523, 0.1); setTimeout(() => playTone(659, 0.1), 100); setTimeout(() => playTone(784, 0.15), 200) } // C5 → E5 → G5
const playLineComplete = () => { 
  // Triumphant ascending arpeggio for full line completion
  playTone(523, 0.08); // C5
  setTimeout(() => playTone(659, 0.08), 80); // E5
  setTimeout(() => playTone(784, 0.08), 160); // G5
  setTimeout(() => playTone(1047, 0.2), 240); // C6 (held longer)
}
const playYourTurn = () => {
  // Soft double-beep to signal it's your turn
  playTone(880, 0.06); // A5
  setTimeout(() => playTone(880, 0.08), 100); // A5 again
}

// Text visibility transformation helper
const transformText = (text: string, mode: 'full' | 'first-letter' | 'blurred' | 'hidden'): string => {
  if (mode === 'full' || mode === 'blurred') return text
  if (mode === 'hidden') return ''
  if (mode === 'first-letter') {
    // Show first letter of each word, rest as underscores
    return text.split(' ').map(word => {
      if (!word) return ''
      // Keep punctuation at the end
      const match = word.match(/^(\W*)(\w)(\w*)(\W*)$/)
      if (match) {
        const [, leadPunc, first, rest, trailPunc] = match
        return leadPunc + first + rest.replace(/\w/g, '_') + trailPunc
      }
      return word.charAt(0) + word.slice(1).replace(/\w/g, '_')
    }).join(' ')
  }
  return text
}

type Status = 'idle' | 'ai' | 'narrator' | 'connecting' | 'listening' | 'correct' | 'wrong' | 'segment' | 'user-listen'
type LearningMode = 'listen' | 'repeat' | 'practice'

export function PracticeScreen() {
  const { user, currentScript, lines, characters, scenes, currentLineIndex, setCurrentLineIndex, isPlaying, setIsPlaying, practiceMode, setPracticeMode, setActiveTab } = useStore()
  const { settings, updateSettings } = useSettings()
  const { getScriptState, updateScriptState, savePosition, saveLearningMode, saveScriptSettings, markLineCompleted, recordAttempt, saveRepeatProgress, startSession, endSession } = useScriptPractice()
  
  // Get saved state for current script
  const scriptId = currentScript?.id || ''
  const savedState = scriptId ? getScriptState(scriptId) : null
  
  // Scene-based navigation state
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0)
  const [showSceneTransition, setShowSceneTransition] = useState(false)
  const [autoAdvanceCountdown, setAutoAdvanceCountdown] = useState<number | null>(null)
  const [sceneSwipeDirection, setSceneSwipeDirection] = useState<'left' | 'right' | null>(null)
  
  const [status, setStatus] = useState<Status>('idle')
  const [transcript, setTranscript] = useState('')
  const [missingWords, setMissingWords] = useState<string[]>([])
  const [wrongWords, setWrongWords] = useState<string[]>([])
  const [loop, setLoop] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [showNotes, setShowNotes] = useState(true) // Toggle for showing/hiding line notes
  const [stats, setStats] = useState({ correct: 0, wrong: 0, completed: new Set<string>() })
  const [editModal, setEditModal] = useState<{ type: 'line' | 'character' | 'script'; data: any; mode?: 'edit' | 'add' } | null>(null)
  const [micReady, setMicReady] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  const [learningMode, setLearningMode] = useState<LearningMode>('listen') // Default to Listen mode (first in progression)
  const [includeDirections, setIncludeDirections] = useState(true)
  const [directionsMode, setDirectionsMode] = useState<'spoken' | 'shown' | 'muted'>('spoken')
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0)
  const [segments, setSegments] = useState<string[]>([])
  const [segmentPhase, setSegmentPhase] = useState<'listen' | 'repeat' | 'complete'>('listen')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState('')
  const [matchedWordCount, setMatchedWordCount] = useState(0)
  const [hasError, setHasError] = useState(false)
  const [errorPopup, setErrorPopup] = useState<string | null>(null) // Shows what user got wrong
  const [animatedWordIndex, setAnimatedWordIndex] = useState(0) // Words lit up while speaking (gray→white)
  const [wordResults, setWordResults] = useState<Array<'correct' | 'wrong' | 'missing'>>([]) // Per-word results after evaluation
  // Build mode progress tracking
  const [buildProgress, setBuildProgress] = useState(0) // How many segments mastered (for underline)
  const [lastCheckpoint, setLastCheckpoint] = useState(0) // Last saved checkpoint segment index
  const [checkpointCount, setCheckpointCount] = useState(0) // Number of checkpoints hit
  const [showResumeModal, setShowResumeModal] = useState(false) // "Option B with twist" modal
  const [savedCheckpoints, setSavedCheckpoints] = useState<number[]>([]) // Checkpoint segment indices
  const [totalSegmentsForLine, setTotalSegmentsForLine] = useState(0) // Total segments in current line
  const [consecutiveTimeouts, setConsecutiveTimeouts] = useState(0) // Track timeouts for "still there?" prompt
  const [consecutiveWrongs, setConsecutiveWrongs] = useState(0) // Track wrong attempts for go-back logic
  const [consecutiveLineFails, setConsecutiveLineFails] = useState(0) // Track full line failures for restart-on-fail
  const [fullLineCompletions, setFullLineCompletions] = useState(0) // Track full line repetitions at end
  const [showStillThere, setShowStillThere] = useState(false) // Show "still there?" message
  const [showWaitingNudge, setShowWaitingNudge] = useState(false) // Gentle "waiting for you..." nudge
  const [lastLineAccuracy, setLastLineAccuracy] = useState<number | null>(null) // Per-line accuracy %
  const [coldReadExpired, setColdReadExpired] = useState(false) // Cold read timer expired
  const [lastPickupTime, setLastPickupTime] = useState<number | null>(null) // Cue pickup ms
  const [lastPacingDelta, setLastPacingDelta] = useState<{ userDuration: number; targetDuration: number; delta: number } | null>(null)
  const [hasRecording, setHasRecording] = useState(false) // User recording available
  const [isPlayingRecording, setIsPlayingRecording] = useState(false) // Playing back user recording
  const [lineAttempts, setLineAttempts] = useState<Map<string, { correct: number; wrong: number; accuracies: number[] }>>(new Map())
  const [weakLineFilter, setWeakLineFilter] = useState<string[] | null>(null) // Line IDs for drill mode
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null) // For mobile: single tap selects, double tap plays
  const lastTapRef = useRef<{ lineId: string; time: number } | null>(null) // For double tap detection
  
  // New mode states
  const audioRef = useRef<HTMLAudioElement>(null)
  const busyRef = useRef(false)
  const transcriptRef = useRef('')
  const expectedLineRef = useRef<string>('')
  const isPlayingRef = useRef(false)
  const listeningRef = useRef(false)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const frameRef = useRef<number>(0)
  const finishListeningRef = useRef<() => void>(() => {})
  const countdownRef = useRef<NodeJS.Timeout | null>(null)
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const commitTimerRef = useRef<NodeJS.Timeout | null>(null) // Timer for commit accumulation
  const lastSpeechRef = useRef<number>(Date.now())
  const committedTextRef = useRef<string>('') // Accumulate committed transcripts locally
  const linesContainerRef = useRef<HTMLDivElement>(null) // For auto-scrolling to current line
  const lineRefs = useRef<Map<number, HTMLDivElement>>(new Map()) // Track line elements by index
  const lockedStateRef = useRef<LockedWordState>(createFreshLockedState()) // Word locking state
  const accumulatedAudioRef = useRef<number>(0) // Accumulated audio energy for word animation
  const wordAnimationRef = useRef<NodeJS.Timeout | null>(null) // Timer for word animation
  const reconnectRef = useRef<(() => Promise<void>) | null>(null) // For auto-reconnect on disconnect
  const listenSessionRef = useRef<number>(0) // Session nonce to ignore stale transcripts
  const segmentNonceRef = useRef<number>(0) // Nonce to prevent race conditions in repeat mode
  const segmentsRef = useRef<string[]>([]) // Current segments (ref for async callbacks)
  const currentSegmentIndexRef = useRef<number>(0) // Current segment index (ref for async callbacks)
  const pendingListenRef = useRef<(() => void) | null>(null) // Pending listen action when autoStartRecording is off
  const aiFinishTimeRef = useRef<number>(0) // When AI audio finished playing
  const speechStartTimeRef = useRef<number>(0) // When user first started speaking
  const linePickupTimesRef = useRef<Map<string, number[]>>(new Map()) // Per-line pickup times
  const targetDurationRef = useRef<number>(0) // Duration of AI audio for current line (ms)
  const lastRecordingRef = useRef<Blob | null>(null) // Last recorded user audio
  const playbackAudioRef = useRef<HTMLAudioElement | null>(null) // Audio element for recording playback
  const randomQueueRef = useRef<number[]>([]) // Shuffled user-line indices for random order
  const randomQueuePosRef = useRef<number>(0) // Current position in random queue
  const pendingRandomUserLineRef = useRef<number | null>(null) // Prevents double-random-jump after cue
  
  // Compute character names set for fuzzy matching (always-on for known names)
  const characterNameSet = useMemo(() => {
    const names = new Set<string>()
    characters.forEach(c => {
      const parts = c.name.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/)
      parts.forEach(p => { if (p.length >= 2) names.add(p) })
    })
    return names
  }, [characters])

  // OpenAI Realtime uses updatePrompt() per-line — no keyterms needed

  // OpenAI Realtime - STT with prompt-based word biasing
  const deepgram = useOpenAIRealtime({
    onPartialTranscript: (data) => {
      if (!listeningRef.current) return
      // Ignore non-speech events
      if (/^\s*\([^)]+\)\s*$/.test(data.text) || !data.text.trim()) return
      // Reject stale results from previous listening session
      if (Date.now() - listenSessionRef.current < 500) return
      console.log('[STT] Partial:', JSON.stringify(data.text), 'committed so far:', JSON.stringify(committedTextRef.current))

      // Track cue pickup speed: first speech after AI finished
      const isFirstSpeech = !transcriptRef.current.trim() && !committedTextRef.current.trim()
      if (isFirstSpeech && aiFinishTimeRef.current > 0) {
        speechStartTimeRef.current = Date.now()
        const pickupMs = Date.now() - aiFinishTimeRef.current
        setLastPickupTime(pickupMs)
        // Store per-line
        const lineId = expectedLineRef.current // use expected text as key proxy
        const existing = linePickupTimesRef.current.get(lineId) || []
        existing.push(pickupMs)
        linePickupTimesRef.current.set(lineId, existing)
      }

      const fullText = committedTextRef.current
        ? committedTextRef.current + ' ' + data.text
        : data.text
      setTranscript(fullText)
      transcriptRef.current = fullText
      lastSpeechRef.current = Date.now()
      
      // Use word-locking to prevent STT from "changing" already-matched words
      const newState = getLockedWordMatch(expectedLineRef.current, fullText, lockedStateRef.current, characterNameSet)
      lockedStateRef.current = newState
      console.log('[STT] Word match - locked:', newState.lockedCount, 'hasError:', newState.hasError, 'expected:', expectedLineRef.current)
      setMatchedWordCount(newState.lockedCount)
      setHasError(newState.hasError)
    },
    onCommittedTranscript: (data) => {
      if (!listeningRef.current) return
      // Ignore non-speech commits
      if (/^\s*\([^)]+\)\s*$/.test(data.text) || !data.text.trim()) return
      // Reject stale results from previous listening session — STT may send
      // delayed finals after we pause+restart. Real speech takes 500ms+ to commit.
      if (Date.now() - listenSessionRef.current < 500) {
        console.log('[STT] Discarding stale committed result:', data.text)
        return
      }
      console.log('[STT] Committed:', JSON.stringify(data.text), 'prev committed:', JSON.stringify(committedTextRef.current))
      // Accumulate committed transcripts
      committedTextRef.current = committedTextRef.current
        ? committedTextRef.current + ' ' + data.text
        : data.text
      console.log('[STT] Full transcript now:', JSON.stringify(committedTextRef.current), 'expected:', JSON.stringify(expectedLineRef.current))
      setTranscript(committedTextRef.current)
      transcriptRef.current = committedTextRef.current
      lastSpeechRef.current = Date.now()

      // Update word-locking state with committed text
      const newState = getLockedWordMatch(expectedLineRef.current, committedTextRef.current, lockedStateRef.current, characterNameSet)
      lockedStateRef.current = newState
      console.log('[STT] Word lock: locked', newState.lockedCount, '/', expectedLineRef.current.split(/\s+/).filter(w => w.length > 0).length, 'hasError:', newState.hasError)
      setMatchedWordCount(newState.lockedCount)
      setHasError(newState.hasError)

      // Check if user has said ALL words - auto-finish if 100% complete
      const expectedWordCount = expectedLineRef.current.split(/\s+/).filter(w => w.length > 0).length
      if (newState.lockedCount >= expectedWordCount && listeningRef.current) {
        console.log('[STT] All words matched, auto-finishing')
        finishListeningRef.current()
      }
    },
    onSessionStarted: () => {
      console.log('[STT] Session started')
      setMicReady(true)
      // Only reset to idle if not actively listening (startSession can be called
      // as a reconnect fallback inside startListening — don't clobber 'listening' status)
      if (!listeningRef.current) setStatus('idle')
    },
    onError: (error) => {
      console.error('[STT] Error:', error)
    },
    onDisconnect: () => {
      console.log('[STT] Disconnected')
      setMicReady(false)
      // Auto-reconnect if we were in the middle of practice
      if (isPlayingRef.current && reconnectRef.current) {
        console.log('[STT] Reconnecting due to unexpected disconnect...')
        setTimeout(() => {
          if (isPlayingRef.current && reconnectRef.current) {
            reconnectRef.current()
          }
        }, 500)
      }
    },
    onAudioLevel: (level) => {
      setAudioLevel(level)
      // Accumulate audio energy when speaking (level > threshold)
      if (level > 0.08 && listeningRef.current) {
        accumulatedAudioRef.current += level
        // Advance word every ~0.6 accumulated energy (~3-4 words/sec at normal speaking)
        const expectedWords = expectedLineRef.current.split(/\s+/).filter(w => w.length > 0).length
        const newWordIndex = Math.min(
          Math.floor(accumulatedAudioRef.current / 0.6),
          expectedWords
        )
        if (newWordIndex > animatedWordIndex) {
          setAnimatedWordIndex(newWordIndex)
        }
      }
    },
  })
  
  useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])
  useEffect(() => { segmentsRef.current = segments }, [segments])
  useEffect(() => { currentSegmentIndexRef.current = currentSegmentIndex }, [currentSegmentIndex])
  
  // Set up reconnect function for auto-reconnect on disconnect
  useEffect(() => {
    reconnectRef.current = async () => {
      console.log('[STT] Attempting reconnect...')
      const success = await deepgram.startSession()
      if (success) {
        console.log('[STT] Reconnected successfully')
        setMicReady(true)
      } else {
        console.error('[STT] Failed to reconnect')
      }
    }
  }, [deepgram])
  
  // Load saved practice state when script changes
  useEffect(() => {
    if (!scriptId || !savedState) return
    
    // Restore position
    setCurrentSceneIndex(savedState.sceneIndex)
    setCurrentLineIndex(savedState.lineIndex)
    
    // Restore mode and settings (fallback to 'listen' if saved mode is deprecated)
    const validModes: LearningMode[] = ['listen', 'repeat', 'practice']
    const savedMode = validModes.includes(savedState.learningMode as LearningMode) 
      ? savedState.learningMode as LearningMode 
      : 'listen'
    setLearningMode(savedMode)
    setLoop(savedState.loop)
    setIncludeDirections(savedState.includeDirections)
    setDirectionsMode(savedState.directionsMode)
    
    // Restore progress
    setStats({
      correct: savedState.correctCount,
      wrong: savedState.wrongCount,
      completed: new Set(savedState.completedLineIds)
    })
    
    // Restore repeat mode progress
    setCurrentSegmentIndex(savedState.currentSegmentIndex)
    setBuildProgress(savedState.buildProgress)
    
    // Start session timer
    startSession()
    
    // Cleanup: save state when leaving
    return () => {
      if (scriptId) {
        endSession(scriptId)
      }
    }
  }, [scriptId])
  
  // Auto-save position when it changes
  useEffect(() => {
    if (!scriptId) return
    const timeoutId = setTimeout(() => {
      savePosition(scriptId, currentSceneIndex, currentLineIndex)
    }, 500) // Debounce saves
    return () => clearTimeout(timeoutId)
  }, [scriptId, currentSceneIndex, currentLineIndex])
  
  // Auto-save learning mode when it changes
  useEffect(() => {
    if (!scriptId) return
    saveLearningMode(scriptId, learningMode)
  }, [scriptId, learningMode])
  
  // Auto-save settings when they change
  useEffect(() => {
    if (!scriptId) return
    saveScriptSettings(scriptId, {
      loop,
      includeDirections,
      directionsMode,
      playbackSpeed: settings.playbackSpeed,
      textVisibility: settings.textVisibility
    })
  }, [scriptId, loop, includeDirections, directionsMode, settings.playbackSpeed, settings.textVisibility])
  
  // Auto-scroll to current line when it changes
  useEffect(() => {
    const lineElement = lineRefs.current.get(currentLineIndex)
    if (lineElement) {
      lineElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [currentLineIndex])

  // Cold read timer: show text briefly then hide
  useEffect(() => {
    if (settings.coldReadTime <= 0) return
    setColdReadExpired(false)
    const timer = setTimeout(() => setColdReadExpired(true), settings.coldReadTime * 1000)
    return () => clearTimeout(timer)
  }, [currentLineIndex, settings.coldReadTime])

  // Get scenes for current script
  const scriptScenes = scenes.filter(s => s.script_id === currentScript?.id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
  const currentSceneData = scriptScenes[currentSceneIndex]
  const nextSceneData = scriptScenes[currentSceneIndex + 1]
  
  // Get lines for current scene only
  const sceneLines = currentSceneData 
    ? lines.filter(l => l.scene_id === currentSceneData.id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    : []
  
  const playableLines = includeDirections ? sceneLines : sceneLines.filter(l => l.line_type === 'dialogue')
  const currentLine = playableLines[currentLineIndex]
  const userLines = playableLines.filter(l => l.is_user_line)
  const completedUserLines = userLines.filter(l => stats.completed.has(l.id))
  const canInteract = status === 'idle' || status === 'wrong' || status === 'correct'

  // Build scene header text
  const getSceneSlug = (scene: typeof currentSceneData) => {
    if (!scene) return ''
    const parts = []
    if (scene.int_ext) parts.push(scene.int_ext)
    if (scene.location) parts.push(scene.location)
    if (scene.time_of_day) parts.push(`- ${scene.time_of_day}`)
    return parts.join(' ') || scene.name || `Scene ${currentSceneIndex + 1}`
  }

  // Reset line index when scene changes
  useEffect(() => {
    setCurrentLineIndex(0)
    setStatus('idle')
    busyRef.current = false
    setShowSceneTransition(false)
    setAutoAdvanceCountdown(null)
    setWeakLineFilter(null)
    if (countdownRef.current) clearInterval(countdownRef.current)
  }, [currentSceneIndex])

  // Connect STT session when practice/repeat mode starts (but don't send audio yet)
  // Audio only starts being sent when startListening is called
  useEffect(() => { 
    if (isPlaying && !micReady && learningMode !== 'listen') {
      connectMic() 
    }
  }, [isPlaying, micReady, learningMode])
  
  // CRITICAL: Pause audio sending when not actively listening
  // This keeps the connection warm but stops billing
  useEffect(() => { 
    if (!isPlaying) {
      console.log('[STT] Paused - stopping audio send')
      deepgram.pauseListening()
      // Don't disconnect - keep connection warm for quick resume
      // Full cleanup happens after 30s of inactivity or on unmount
    }
  }, [isPlaying])
  
  useEffect(() => { return () => cleanup() }, [])
  useEffect(() => { resetStats() }, [currentScript?.id])
  useEffect(() => {
    if (isPlaying && status === 'idle' && currentLine && !busyRef.current) {
      // Build random queue on first play if random order is enabled
      if (settings.randomOrder && learningMode !== 'listen' && randomQueueRef.current.length === 0) {
        buildRandomQueue()
      }
      if (learningMode === 'listen') playCurrentLine();
      else if (micReady) playCurrentLine()
    }
  }, [isPlaying, micReady, status, currentLineIndex, learningMode])

  const cleanup = () => {
    cancelAnimationFrame(frameRef.current)
    deepgram.pauseListening() // Stop audio first
    deepgram.stopSession()    // Then disconnect
    if (countdownRef.current) clearInterval(countdownRef.current)
    if (silenceTimerRef.current) clearInterval(silenceTimerRef.current)
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current)
    setMicReady(false)
  }

  const connectMic = async () => {
    setStatus('connecting')
    try {
      console.log('[STT] Starting session (audio paused until listening)...')

      // OpenAI Realtime - connect (no params needed, prompt set per-line via updatePrompt)
      const success = await deepgram.startSession()
      if (!success) {
        throw new Error('Failed to connect')
      }
      
      console.log('[STT] Session connected (audio paused)')
      
    } catch (e) { 
      console.error('[STT] Failed to connect:', e)
      setStatus('idle')
      setIsPlaying(false) 
    }
  }

  const resetStats = () => { setShowSummary(false); setStats({ correct: 0, wrong: 0, completed: new Set() }) }
  const fullReset = () => { 
    cleanup()
    listeningRef.current = false
    busyRef.current = false
    setStatus('idle')
    setTranscript('')
    setMissingWords([])
    setWrongWords([])
    setMatchedWordCount(0)
    setHasError(false)
    setSegments([])
    setCurrentSegmentIndex(0)
    setSegmentPhase('listen')
    setBuildProgress(0)
    setLastCheckpoint(0)
    setCheckpointCount(0)
    setConsecutiveTimeouts(0)
    setConsecutiveWrongs(0)
    setFullLineCompletions(0)
    setShowStillThere(false)
    pendingRandomUserLineRef.current = null
    // Clean up recording playback
    if (playbackAudioRef.current) {
      playbackAudioRef.current.pause()
      playbackAudioRef.current = null
    }
    lastRecordingRef.current = null
    setHasRecording(false)
    setIsPlayingRecording(false)
    // Clear weak line drill
    setWeakLineFilter(null)
    if (silenceTimerRef.current) clearInterval(silenceTimerRef.current)
    resetStats()
  }
  
  const goTo = (index: number, play = false) => { 
    listeningRef.current = false
    busyRef.current = false
    
    // CRITICAL: Stop sending audio to STT immediately (billing stops)
    deepgram.pauseListening()
    
    if (silenceTimerRef.current) clearInterval(silenceTimerRef.current)
    setStatus('idle')
    setTranscript('')
    setMissingWords([])
    setWrongWords([])
    setMatchedWordCount(0)
    setHasError(false)
    setSegments([])
    setCurrentSegmentIndex(0)
    setSegmentPhase('listen')
    setBuildProgress(0)
    setLastCheckpoint(0)
    setCheckpointCount(0)
    setConsecutiveTimeouts(0)
    setConsecutiveWrongs(0)
    setFullLineCompletions(0)
    setShowStillThere(false)
    setCurrentLineIndex(index)
    if (play) setTimeout(() => setIsPlaying(true), 10)
  }
  
  // ============ NEW MODE HELPERS ============
  
  // Navigate to next scene
  const goToNextScene = () => {
    if (currentSceneIndex < scriptScenes.length - 1) {
      setSceneSwipeDirection('left')
      setTimeout(() => {
        setCurrentSceneIndex(currentSceneIndex + 1)
        setSceneSwipeDirection(null)
      }, 150)
    }
  }
  
  // Navigate to previous scene
  const goToPrevScene = () => {
    if (currentSceneIndex > 0) {
      setSceneSwipeDirection('right')
      setTimeout(() => {
        setCurrentSceneIndex(currentSceneIndex - 1)
        setSceneSwipeDirection(null)
      }, 150)
    }
  }
  
  // Handle scene header swipe
  const handleSceneSwipe = (event: any, info: PanInfo) => {
    if (Math.abs(info.offset.x) > 50) {
      if (info.offset.x < 0 && currentSceneIndex < scriptScenes.length - 1) {
        goToNextScene()
      } else if (info.offset.x > 0 && currentSceneIndex > 0) {
        goToPrevScene()
      }
    }
  }
  
  // Handle scene completion - show transition modal
  const handleSceneComplete = () => {
    if (currentSceneIndex < scriptScenes.length - 1) {
      setShowSceneTransition(true)
      setAutoAdvanceCountdown(3)
      
      // Start countdown
      countdownRef.current = setInterval(() => {
        setAutoAdvanceCountdown(prev => {
          if (prev === null || prev <= 1) {
            if (countdownRef.current) clearInterval(countdownRef.current)
            goToNextScene()
            return null
          }
          return prev - 1
        })
      }, 1000)
    } else {
      // Last scene complete - show summary
      setIsPlaying(false)
      if (stats.correct + stats.wrong > 0) setShowSummary(true)
    }
  }
  
  // Fisher-Yates shuffle for random line order
  const buildRandomQueue = () => {
    const userIndices = playableLines
      .map((line, i) => ({ line, i }))
      .filter(({ line }) => line.is_user_line)
      .map(({ i }) => i)
    for (let i = userIndices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [userIndices[i], userIndices[j]] = [userIndices[j], userIndices[i]]
    }
    randomQueueRef.current = userIndices
    randomQueuePosRef.current = 0
    pendingRandomUserLineRef.current = null
  }

  const next = () => {
    // If we just played a cue line for a pending random user line, go to that user line
    if (pendingRandomUserLineRef.current !== null) {
      const userIdx = pendingRandomUserLineRef.current
      pendingRandomUserLineRef.current = null
      goTo(userIdx, isPlayingRef.current)
      return
    }

    // Weak line drill mode: only visit weak lines
    if (weakLineFilter && weakLineFilter.length > 0) {
      // Find next weak line after current index
      const weakIndices = weakLineFilter
        .map(id => playableLines.findIndex(l => l.id === id))
        .filter(i => i >= 0)
        .sort((a, b) => a - b)
      const nextWeak = weakIndices.find(i => i > currentLineIndex)
      if (nextWeak !== undefined) {
        // Find cue line before weak line
        const cueIdx = nextWeak > 0 && !playableLines[nextWeak - 1]?.is_user_line
          ? nextWeak - 1 : nextWeak
        goTo(cueIdx, isPlayingRef.current)
      } else {
        // All weak lines drilled — show summary
        setWeakLineFilter(null)
        setShowSummary(true)
        setIsPlaying(false)
      }
      return
    }

    // Random line order: jump to next shuffled user line
    if (settings.randomOrder && learningMode !== 'listen') {
      const pos = randomQueuePosRef.current
      if (pos < randomQueueRef.current.length) {
        const nextUserIdx = randomQueueRef.current[pos]
        randomQueuePosRef.current = pos + 1
        // Find cue line (AI line right before this user line)
        const cueIdx = nextUserIdx > 0 && !playableLines[nextUserIdx - 1]?.is_user_line
          ? nextUserIdx - 1 : nextUserIdx
        if (cueIdx !== nextUserIdx) {
          // Play cue first, then advance to user line
          pendingRandomUserLineRef.current = nextUserIdx
          goTo(cueIdx, isPlayingRef.current)
        } else {
          goTo(nextUserIdx, isPlayingRef.current)
        }
      } else {
        // All user lines visited
        if (loop) {
          buildRandomQueue()
          next()
        } else {
          handleSceneComplete()
        }
      }
      return
    }

    if (currentLineIndex < playableLines.length - 1) {
      goTo(currentLineIndex + 1, isPlayingRef.current)
    } else {
      // End of scene
      if (loop) {
        goTo(0, isPlayingRef.current)
      } else {
        handleSceneComplete()
      }
    }
  }
  
  // Split line into segments - prefer AI-generated practice_segments, fallback to word-based
  const stripParentheticals = (text: string): string => {
    return text.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()
  }
  
  const getLineSegments = (line: typeof currentLine): string[] => {
    if (!line) return []
    let segments: string[]
    // Use AI-generated segments if available (preferred)
    if (line.practice_segments && Array.isArray(line.practice_segments) && line.practice_segments.length > 0) {
      segments = line.practice_segments.map(seg => stripParentheticals(seg))
    } else {
      // Fallback: split into ~4 word chunks if no AI segments (after stripping parentheticals)
      const cleanContent = stripParentheticals(line.content)
      const words = cleanContent.split(/\s+/)
      segments = []
      const chunkSize = 4
      for (let i = 0; i < words.length; i += chunkSize) {
        segments.push(words.slice(i, i + chunkSize).join(' '))
      }
    }
    // Post-process: merge segments with fewer than 2 words into adjacent segments
    // This prevents useless 1-word segments like "Goodbye." or "Thanks."
    if (segments.length > 1) {
      const merged: string[] = []
      for (let i = 0; i < segments.length; i++) {
        const wordCount = segments[i].trim().split(/\s+/).filter(w => w).length
        if (wordCount < 2 && merged.length > 0) {
          // Merge short segment with previous
          merged[merged.length - 1] += ' ' + segments[i]
        } else if (wordCount < 2 && i < segments.length - 1) {
          // First segment is too short — prepend to next
          segments[i + 1] = segments[i] + ' ' + segments[i + 1]
        } else {
          merged.push(segments[i])
        }
      }
      return merged.filter(s => s.trim().length > 0)
    }
    return segments.filter(s => s.trim().length > 0)
  }

  // Play segment audio via live TTS (Google Chirp 3 HD - direct API call)
  const playSegmentLiveTTS = async (segmentText: string, voiceName?: string): Promise<void> => {
    // Validate input first
    if (!segmentText || segmentText.trim().length === 0) {
      console.error('[TTS] ERROR: Empty or null text passed to TTS!')
      return
    }
    
    console.log('[TTS] playSegmentLiveTTS called')
    console.log('[TTS] Text to speak:', JSON.stringify(segmentText))
    console.log('[TTS] Text length:', segmentText.length)
    
    try {
      // Get the character's voice for this line
      const charVoice = characters.find(c => c.name === currentLine?.character_name)
      const voice = voiceName || charVoice?.voice_id || 'en-AU-Chirp3-HD-Aoede'
      
      // Extract language code from voice name (e.g., "en-AU-Chirp3-HD-Aoede" -> "en-AU")
      const languageCode = voice.split('-').slice(0, 2).join('-')
      
      console.log('[TTS] Using voice:', voice, 'languageCode:', languageCode)
      console.log('[TTS] API Key present:', !!process.env.NEXT_PUBLIC_GOOGLE_API_KEY)
      
      // Call Google TTS API directly
      const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${process.env.NEXT_PUBLIC_GOOGLE_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text: segmentText },
          voice: { languageCode, name: voice },
          audioConfig: { audioEncoding: 'MP3', speakingRate: 1.0, pitch: 0 }
        })
      })
      
      console.log('[TTS] Response status:', response.status)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.warn('Google TTS failed, status:', response.status, 'error:', errorText)
        return
      }
      
      const data = await response.json()
      if (!data.audioContent) {
        console.warn('No audio content in Google TTS response')
        return
      }
      
      console.log('[TTS] Got audio content, length:', data.audioContent.length)
      
      // Convert base64 to blob
      const audioBytes = atob(data.audioContent)
      const audioArray = new Uint8Array(audioBytes.length)
      for (let i = 0; i < audioBytes.length; i++) {
        audioArray[i] = audioBytes.charCodeAt(i)
      }
      const audioBlob = new Blob([audioArray], { type: 'audio/mpeg' })
      const audioUrl = URL.createObjectURL(audioBlob)
      
      console.log('[TTS] Playing audio...')
      
      if (audioRef.current) {
        audioRef.current.src = audioUrl
        audioRef.current.volume = 1.0 // Ensure full volume
        audioRef.current.currentTime = 0 // Ensure we start from beginning
        await new Promise<void>(resolve => {
          const audio = audioRef.current!
          const timeout = setTimeout(() => resolve(), 3000) // fallback timeout
          audio.oncanplaythrough = () => {
            clearTimeout(timeout)
            resolve()
          }
          audio.load()
        })
        let ttsRate = settings.playbackSpeed
        if (settings.partnerSpeedVariation && !currentLine?.is_user_line) {
          ttsRate *= 0.85 + Math.random() * 0.30
        }
        audioRef.current.playbackRate = ttsRate // Set after load
        // Capture target duration for pacing comparison (actual playback time in ms)
        if (audioRef.current.duration && isFinite(audioRef.current.duration)) {
          targetDurationRef.current = (audioRef.current.duration / ttsRate) * 1000
        }
        audioRef.current.currentTime = 0 // Reset again after load just in case
        console.log('[TTS] Audio element ready, volume:', audioRef.current.volume, 'muted:', audioRef.current.muted, 'currentTime:', audioRef.current.currentTime)
        await audioRef.current.play()
        console.log('[TTS] Audio playing, currentTime:', audioRef.current.currentTime)
        await new Promise<void>(resolve => {
          if (audioRef.current) audioRef.current.onended = () => resolve()
        })
        console.log('[TTS] Audio finished')
        URL.revokeObjectURL(audioUrl)
      } else {
        console.warn('[TTS] No audioRef.current!')
      }
    } catch (e) {
      console.warn('Live TTS error:', e)
    }
  }
  
  // Play a segment of audio using precise word timepoints (or estimate if not available)
  const playAudioSegment = async (
    audioUrl: string | null | undefined, 
    fullText: string, 
    segmentIndex: number, 
    segmentText: string,
    wordTimepoints?: { word: string; start_time: number | null }[] | null
  ): Promise<void> => {
    if (!audioUrl || !audioRef.current) {
      await new Promise(r => setTimeout(r, 200));
      return;
    }
    
    try {
      // Ensure audio context is resumed (mobile autoplay fix)
      const ctx = audioManager.getContext()
      if (ctx?.state === 'suspended') {
        await ctx.resume()
      }
      
      const audio = audioRef.current;
      audio.src = audioUrl;
      
      // Wait for audio to load and get duration
      await new Promise<void>((resolve) => {
        const timeoutId = setTimeout(() => resolve(), 5000);
        const onLoaded = () => { clearTimeout(timeoutId); audio.removeEventListener('loadedmetadata', onLoaded); resolve(); };
        audio.addEventListener('loadedmetadata', onLoaded);
        audio.load();
      });
      
      audio.playbackRate = settings.playbackSpeed; // Set after load
      
      const duration = audio.duration;
      const fullWords = fullText.split(/\s+/);
      const totalWords = fullWords.length;
      const chunkSize = 4; // Default fallback chunk size
      const startWordIndex = segmentIndex * chunkSize;
      const endWordIndex = Math.min(startWordIndex + chunkSize, totalWords);
      
      let startTime: number;
      let endTime: number;
      
      // Use precise timepoints if available, otherwise estimate
      if (wordTimepoints && wordTimepoints.length > 0) {
        // Get start time from the first word of this segment
        startTime = wordTimepoints[startWordIndex]?.start_time ?? 0;
        
        // Get end time from the first word of the NEXT segment (or audio duration if last segment)
        if (endWordIndex < totalWords && wordTimepoints[endWordIndex]?.start_time != null) {
          endTime = wordTimepoints[endWordIndex].start_time!;
        } else {
          endTime = duration;
        }
        
        console.log(`[AudioSegment] Using precise timepoints: ${startTime}s - ${endTime}s`);
      } else {
        // Fallback to estimation
        const wordsPerSecond = totalWords / duration;
        startTime = startWordIndex / wordsPerSecond;
        endTime = endWordIndex / wordsPerSecond;
        console.log(`[AudioSegment] Estimating: ${startTime.toFixed(2)}s - ${endTime.toFixed(2)}s`);
      }
      
      audio.currentTime = startTime;
      await audio.play();
      
      // Stop at end of segment
      await new Promise<void>(resolve => {
        const checkEnd = () => {
          if (audio.currentTime >= endTime || audio.paused || audio.ended) {
            audio.pause();
            resolve();
          } else {
            requestAnimationFrame(checkEnd);
          }
        };
        checkEnd();
      });
    } catch (e) {
      console.warn('Segment audio playback error:', e);
    }
  }

  // Speak character name before line (if setting enabled)
  // Uses pre-generated audio_url_name if available, otherwise falls back to live TTS
  const speakCharacterName = async (characterName: string, voiceId?: string | null, preGeneratedUrl?: string | null): Promise<void> => {
    console.log('[Names] speakCharacterName called, setting:', settings.speakCharacterNames, 'name:', characterName, 'preGenUrl:', preGeneratedUrl)
    if (!settings.speakCharacterNames || !characterName) return
    
    // Use pre-generated audio if available and setting enabled
    if (preGeneratedUrl && settings.usePreGeneratedAudio) {
      console.log('[Names] Using pre-generated audio for character name')
      await playAudio(preGeneratedUrl)
      return
    }
    
    // Fall back to live TTS
    try {
      // Use the character's assigned voice, or fall back to a default
      const voice = voiceId || 'en-AU-Chirp3-HD-Aoede'
      const languageCode = voice.split('-').slice(0, 2).join('-')
      
      const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${process.env.NEXT_PUBLIC_GOOGLE_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text: characterName },
          voice: { languageCode, name: voice },
          audioConfig: { audioEncoding: 'MP3', speakingRate: 1.1, pitch: 0 }
        })
      })
      
      if (!response.ok) return
      
      const data = await response.json()
      if (!data.audioContent) return
      
      const audioBytes = atob(data.audioContent)
      const audioArray = new Uint8Array(audioBytes.length)
      for (let i = 0; i < audioBytes.length; i++) {
        audioArray[i] = audioBytes.charCodeAt(i)
      }
      const audioBlob = new Blob([audioArray], { type: 'audio/mpeg' })
      const audioUrl = URL.createObjectURL(audioBlob)
      
      if (audioRef.current) {
        audioRef.current.src = audioUrl
        await new Promise<void>(resolve => {
          const audio = audioRef.current!
          audio.onloadeddata = () => resolve()
          audio.load()
        })
        audioRef.current.playbackRate = 1.2 // Slightly faster for names
        await audioRef.current.play()
        await new Promise<void>(resolve => {
          if (audioRef.current) audioRef.current.onended = () => resolve()
        })
        URL.revokeObjectURL(audioUrl)
      }
    } catch (e) {
      // Silently fail - don't block playback if name speaking fails
    }
  }

  // Speak parenthetical direction before line (if setting enabled)
  // Uses pre-generated audio_url_parenthetical if available, otherwise falls back to live TTS
  const speakParenthetical = async (parenthetical: string | null | undefined, preGeneratedUrl?: string | null): Promise<void> => {
    if (!settings.speakParentheticals || !parenthetical) return
    
    console.log('[Parenthetical] Speaking:', parenthetical, 'preGenUrl:', preGeneratedUrl)
    
    // Use pre-generated audio if available and setting enabled
    if (preGeneratedUrl && settings.usePreGeneratedAudio) {
      console.log('[Parenthetical] Using pre-generated audio')
      await playAudio(preGeneratedUrl)
      return
    }
    
    // Fall back to live TTS with narrator voice
    try {
      const voice = 'en-AU-Chirp3-HD-Rasalgethi' // Male narrator voice
      const languageCode = 'en-AU'
      
      const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${process.env.NEXT_PUBLIC_GOOGLE_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text: parenthetical },
          voice: { languageCode, name: voice },
          audioConfig: { audioEncoding: 'MP3', speakingRate: 1.0, pitch: -2 } // Slightly lower pitch for narrator
        })
      })
      
      if (!response.ok) return
      
      const data = await response.json()
      if (!data.audioContent) return
      
      const audioBytes = atob(data.audioContent)
      const audioArray = new Uint8Array(audioBytes.length)
      for (let i = 0; i < audioBytes.length; i++) {
        audioArray[i] = audioBytes.charCodeAt(i)
      }
      const audioBlob = new Blob([audioArray], { type: 'audio/mpeg' })
      const audioUrl = URL.createObjectURL(audioBlob)
      
      if (audioRef.current) {
        audioRef.current.src = audioUrl
        await new Promise<void>(resolve => {
          const audio = audioRef.current!
          audio.onloadeddata = () => resolve()
          audio.load()
        })
        audioRef.current.playbackRate = 1.0
        await audioRef.current.play()
        await new Promise<void>(resolve => {
          if (audioRef.current) audioRef.current.onended = () => resolve()
        })
        URL.revokeObjectURL(audioUrl)
      }
    } catch (e) {
      // Silently fail - don't block playback
    }
  }
  
  const playAudio = async (audioUrl: string | null | undefined): Promise<void> => { 
    if (audioUrl && audioRef.current) { 
      try {
        // Ensure audio context is resumed (mobile autoplay fix)
        const ctx = audioManager.getContext()
        if (ctx?.state === 'suspended') {
          await ctx.resume()
        }
        
        audioRef.current.src = audioUrl;
        await new Promise<void>((resolve, reject) => {
          if (!audioRef.current) return resolve()
          const audio = audioRef.current;
          const timeoutId = setTimeout(() => { 
            audio.removeEventListener('canplaythrough', onCanPlay); 
            audio.removeEventListener('error', onError); 
            resolve();
          }, 5000);
          const onCanPlay = () => { clearTimeout(timeoutId); audio.removeEventListener('canplaythrough', onCanPlay); audio.removeEventListener('error', onError); resolve(); };
          const onError = () => { clearTimeout(timeoutId); audio.removeEventListener('canplaythrough', onCanPlay); audio.removeEventListener('error', onError); resolve(); };
          audio.addEventListener('canplaythrough', onCanPlay);
          audio.addEventListener('error', onError);
          audio.load();
        });
        let audioRate = settings.playbackSpeed
        if (settings.partnerSpeedVariation && !currentLine?.is_user_line) {
          audioRate *= 0.85 + Math.random() * 0.30
        }
        audioRef.current.playbackRate = audioRate; // Set after load
        // Capture target duration for pacing comparison
        if (audioRef.current.duration && isFinite(audioRef.current.duration)) {
          targetDurationRef.current = (audioRef.current.duration / audioRate) * 1000
        }
        await audioRef.current.play();
        // Wait for audio to end, with safety timeout in case onended never fires
        const duration = audioRef.current.duration || 30
        await new Promise<void>(r => {
          if (!audioRef.current) return r()
          const safetyTimeout = setTimeout(r, (duration * 1000 / (audioRef.current.playbackRate || 1)) + 5000)
          audioRef.current.onended = () => { clearTimeout(safetyTimeout); r() }
        });
      } catch (e) {
        console.warn('Audio playback error:', e);
      }
    } else {
      await new Promise(r => setTimeout(r, 200));
    } 
  }

  const stopPlayback = () => {
    console.log('[Stop] stopPlayback called')
    setIsPlaying(false)
    isPlayingRef.current = false
    listeningRef.current = false
    busyRef.current = false
    
    // CRITICAL: Stop sending audio to STT immediately (billing stops)
    deepgram.pauseListening()
    
    if (silenceTimerRef.current) {
      clearInterval(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current)
      commitTimerRef.current = null
    }
    if (audioRef.current) { 
      audioRef.current.pause()
      audioRef.current.currentTime = 0 
    }
    setStatus('idle')
    setTranscript('')
    setMatchedWordCount(0)
    setHasError(false)
    
    // CRITICAL: Stop OpenAI STT to stop billing!
    cleanup()
  }

  const playCurrentLine = async () => {
    console.log('[Play] playCurrentLine called, currentLine:', currentLine?.id, 'busyRef:', busyRef.current, 'learningMode:', learningMode)
    if (!currentLine || busyRef.current) {
      console.log('[Play] Early return - no currentLine or busy')
      return
    }
    busyRef.current = true
    const isNarrator = currentLine.line_type === 'action' || currentLine.line_type === 'transition'
    console.log('[Play] is_user_line:', currentLine.is_user_line, 'learningMode:', learningMode)

    // NOTE: We intentionally do NOT pre-connect the mic here.
    // Activating getUserMedia() during TTS playback triggers Windows audio ducking
    // (Communications Activity reduces other sounds by 80%). Instead, we connect
    // when the user actually needs to speak — the "connecting" status handles the gap.
    
    // Repeat mode: Progressive build for user lines
    if (learningMode === 'repeat') {
      console.log('[Play] In Repeat mode branch')
      if (currentLine.is_user_line) {
        console.log('[Play] User line in Repeat mode')
        // Initialize segments if not already done
        let segs = segments
        if (segments.length === 0) {
          segs = getLineSegments(currentLine)
          console.log('[Play] Got segments:', segs)
          setSegments(segs)
          setCurrentSegmentIndex(0)
          setBuildProgress(0)
          setLastCheckpoint(0)
          setCheckpointCount(0)
          // Load saved progress from Supabase (don't await - let it run in background)
          loadBuildProgress(currentLine.id, segs.length).catch(e => console.warn('loadBuildProgress error:', e))
          console.log('[Play] Kicked off build progress load')
        }
        
        // Play accumulated segments (0 to currentSegmentIndex) via TTS
        // Use segs (local) not segments (state) since state update is async
        const segIdx = segments.length === 0 ? 0 : currentSegmentIndex
        const accumulatedText = segs.slice(0, segIdx + 1).join(' ')
        console.log('[Play] About to call TTS with:', accumulatedText)
        setStatus('segment')
        await playSegmentLiveTTS(accumulatedText)
        
        if (!isPlayingRef.current) { busyRef.current = false; return } // User paused during TTS

        // Wait before listening (same as practice mode)
        if (settings.waitForMeDelay > 0) {
          await new Promise(r => setTimeout(r, settings.waitForMeDelay))
          if (!isPlayingRef.current) { busyRef.current = false; return }
        }

        // Start listening with 3.5s silence timeout
        aiFinishTimeRef.current = Date.now()
        if (settings.autoStartRecording) {
          startListeningForBuild(accumulatedText)
        } else {
          // Wait for user to tap play/mic to start recording
          pendingListenRef.current = () => startListeningForBuild(accumulatedText)
          setStatus('idle')
        }
        busyRef.current = false
        return
      } else {
        // For non-user lines in Repeat mode, play character name + parenthetical + audio
        setStatus(isNarrator ? 'narrator' : 'ai')
        if (!isNarrator) {
          const charVoice = characters.find(c => c.name === currentLine.character_name)?.voice_id
          await speakCharacterName(currentLine.character_name, charVoice, currentLine.audio_url_name)
          await speakParenthetical(currentLine.parenthetical, currentLine.audio_url_parenthetical)
        }
        if (currentLine.audio_url) {
          await playAudio(currentLine.audio_url)
        } else {
          await playSegmentLiveTTS(currentLine.content)
        }
        setStatus('idle')
        busyRef.current = false
        if (isPlayingRef.current) next()
        return
      }
    }
    
    if (learningMode === 'listen') {
      // In listen mode, optionally play user lines with AI voice too
      if (currentLine.is_user_line && settings.playMyLine) {
        setStatus('user-listen')
        if (currentLine.audio_url) {
          await playAudio(currentLine.audio_url)
        } else {
          await playSegmentLiveTTS(currentLine.content)
        }
        setStatus('idle')
        busyRef.current = false
        if (isPlayingRef.current) next()
        return
      }
      
      if (isNarrator) { 
        if (directionsMode === 'spoken') { 
          setStatus('narrator')
          // Use pre-generated action audio, fall back to regular audio_url, then live TTS
          const actionAudio = currentLine.audio_url_action || currentLine.audio_url
          if (actionAudio && settings.usePreGeneratedAudio) {
            await playAudio(actionAudio)
          } else if (currentLine.audio_url) {
            await playAudio(currentLine.audio_url)
          } else {
            await playSegmentLiveTTS(currentLine.content, 'en-AU-Chirp3-HD-Rasalgethi')
          }
        } else if (directionsMode === 'shown') {
          await new Promise(r => setTimeout(r, 1500))
        }
        // 'muted' mode - skip narrator lines entirely, just advance
      } else { 
        setStatus('ai')
        // Speak character name if enabled (use character's assigned voice or pre-generated audio)
        const charVoice = characters.find(c => c.name === currentLine.character_name)?.voice_id
        await speakCharacterName(currentLine.character_name, charVoice, currentLine.audio_url_name)
        // Speak parenthetical if enabled and present
        await speakParenthetical(currentLine.parenthetical, currentLine.audio_url_parenthetical)
        // Use pre-generated audio or fall back to live TTS
        if (currentLine.audio_url) {
          await playAudio(currentLine.audio_url)
        } else {
          await playSegmentLiveTTS(currentLine.content)
        }
      }
      setStatus('idle')
      busyRef.current = false
      if (isPlayingRef.current) next()
      return
    }
    
    // ============ PRACTICE MODE (default) ============
    if (currentLine.is_user_line) {
      // Play "your turn" cue if enabled
      if (settings.playYourTurnCue) {
        playYourTurn()
        await new Promise(r => setTimeout(r, settings.waitForMeDelay))
      }
      
      // Option: Play my line (AI speaks user's lines too)
      if (settings.playMyLine) {
        setStatus('ai')
        if (currentLine.audio_url) {
          await playAudio(currentLine.audio_url)
        } else {
          await playSegmentLiveTTS(currentLine.content)
        }
        setStatus('idle')
        busyRef.current = false
        if (isPlayingRef.current) next()
        return
      }
      
      aiFinishTimeRef.current = Date.now()
      if (settings.autoStartRecording) {
        startListening().catch(() => { busyRef.current = false; setStatus('idle') })
      } else {
        // Wait for user to tap play/mic to start recording
        pendingListenRef.current = () => startListening()
        setStatus('idle')
        busyRef.current = false
      }
    } else {
      setStatus(isNarrator ? 'narrator' : 'ai')
      if (!isNarrator) {
        const charVoice = characters.find(c => c.name === currentLine.character_name)?.voice_id
        await speakCharacterName(currentLine.character_name, charVoice, currentLine.audio_url_name)
        // Speak parenthetical if enabled and present
        await speakParenthetical(currentLine.parenthetical, currentLine.audio_url_parenthetical)
      }
      // Play pre-generated audio, fall back to live TTS if missing
      if (currentLine.audio_url) {
        await playAudio(currentLine.audio_url)
      } else {
        await playSegmentLiveTTS(currentLine.content)
      }
      setStatus('idle')
      busyRef.current = false
      if (isPlayingRef.current) next()
    }
  }

  // Load saved build progress from Supabase - "Option B with a Twist"
  const loadBuildProgress = async (lineId: string, totalSegments: number) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      
      const { data } = await supabase
        .from('line_practice_progress')
        .select('*')
        .eq('user_id', user.id)
        .eq('line_id', lineId)
        .single()
      
      if (data && !data.is_complete && data.highest_checkpoint > 0) {
        // Has saved progress - show resume modal (Option B with a Twist)
        setSavedCheckpoints(data.checkpoint_indices || [])
        setTotalSegmentsForLine(totalSegments)
        setLastCheckpoint(data.highest_checkpoint)
        setCheckpointCount(data.checkpoint_indices?.length || 0)
        setShowResumeModal(true)
        // Don't auto-start - wait for user choice
      } else {
        // No saved progress or already complete - start fresh
        setCurrentSegmentIndex(0)
        setBuildProgress(0)
        setLastCheckpoint(0)
        setCheckpointCount(0)
      }
    } catch (e) {
      // No saved progress, start fresh
      setCurrentSegmentIndex(0)
      setBuildProgress(0)
      setLastCheckpoint(0)
      setCheckpointCount(0)
    }
  }

  // Resume from a specific checkpoint
  const resumeFromCheckpoint = (checkpointIndex: number) => {
    setCurrentSegmentIndex(checkpointIndex)
    setBuildProgress(checkpointIndex)
    setShowResumeModal(false)
    // Auto-start the practice
    setTimeout(() => playCurrentLine(), 100)
  }

  // Start fresh (from beginning)
  const startFresh = async () => {
    setCurrentSegmentIndex(0)
    setBuildProgress(0)
    setLastCheckpoint(0)
    setCheckpointCount(0)
    setShowResumeModal(false)
    // Clear saved progress in DB
    if (currentLine) {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          await supabase
            .from('line_practice_progress')
            .delete()
            .eq('user_id', user.id)
            .eq('line_id', currentLine.id)
        }
      } catch (e) {
        console.warn('Failed to clear progress:', e)
      }
    }
    // Auto-start the practice
    setTimeout(() => playCurrentLine(), 100)
  }

  // Save build progress to Supabase
  const saveBuildProgress = async (lineId: string, segmentIndex: number, totalSegments: number, isCheckpoint: boolean, isComplete: boolean) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !currentScript) return
      
      const checkpointIndices = isCheckpoint ? 
        [...Array(Math.floor((segmentIndex + 1) / 5))].map((_, i) => (i + 1) * 5 - 1) : 
        undefined
      
      await supabase
        .from('line_practice_progress')
        .upsert({
          user_id: user.id,
          line_id: lineId,
          script_id: currentScript.id,
          current_segment_index: segmentIndex,
          total_segments: totalSegments,
          highest_checkpoint: isCheckpoint ? segmentIndex : lastCheckpoint,
          checkpoint_indices: checkpointIndices,
          is_complete: isComplete,
          completed_at: isComplete ? new Date().toISOString() : null,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,line_id' })
    } catch (e) {
      console.warn('Failed to save build progress:', e)
    }
  }

  // Start listening with silence timeout for build mode
  const startListeningForBuild = async (expectedText: string) => {
    // Increment session nonce to invalidate any pending transcripts from previous session
    listenSessionRef.current = Date.now()
    transcriptRef.current = ''
    committedTextRef.current = ''
    lockedStateRef.current = createFreshLockedState()
    expectedLineRef.current = expectedText
    setTranscript('')
    setMissingWords([])
    setWrongWords([])
    setMatchedWordCount(0)
    setHasError(false)
    // Reset word animation and results
    accumulatedAudioRef.current = 0
    setAnimatedWordIndex(0)
    setWordResults([])
    listeningRef.current = true
    if (settings.playYourTurnCue) playYourTurn()

    // Show "connecting" until audio is actually flowing
    setStatus('connecting')

    // Update prompt to bias toward expected words (instant, no reconnect)
    deepgram.updatePrompt(expectedLineRef.current)

    // Start sending audio — if connection died, reconnect first
    let started = deepgram.startListening()
    if (!started) {
      console.log('[STT] Connection lost, reconnecting...')
      await deepgram.startSession()
      started = deepgram.startListening()
      if (!started) {
        console.error('[STT] Failed to start listening after reconnect')
        setStatus('idle')
        listeningRef.current = false
        busyRef.current = false
        return
      }
    }

    // NOW audio is flowing — safe to show "listening"
    lastSpeechRef.current = Date.now()
    setStatus('listening')

    // Start recording user audio for playback
    deepgram.startRecording()

    // Timeout if no speech, emergency fallback
    if (silenceTimerRef.current) clearInterval(silenceTimerRef.current)
    silenceTimerRef.current = setInterval(() => {
      if (!listeningRef.current) { clearInterval(silenceTimerRef.current!); return; }
      const silenceMs = Date.now() - lastSpeechRef.current;
      const hasTranscript = transcriptRef.current.trim()

      if (silenceMs > 5000 && !hasTranscript) {
        clearInterval(silenceTimerRef.current!);
        handleBuildTimeout();
      }
      else if (silenceMs > settings.silenceDuration && hasTranscript) {
        // Use user's silence duration setting for build mode
        console.log('[Silence] Build mode - evaluating after', silenceMs, 'ms')
        finishListeningRef.current();
      }
    }, 250); // Check frequently for responsiveness
  }

  // Handle timeout in build mode - auto-retry from checkpoint
  // Handle timeout in build mode - auto-retry from current segment
  const handleBuildTimeout = async () => {
    listeningRef.current = false
    
    // CRITICAL: Stop sending audio to STT immediately (billing stops)
    deepgram.pauseListening()
    
    playIncorrect()
    setTranscript(transcriptRef.current || '(timeout)')
    
    // Track consecutive timeouts
    const newTimeoutCount = consecutiveTimeouts + 1
    setConsecutiveTimeouts(newTimeoutCount)
    
    // After 3 timeouts, show "still there?" instead of auto-retry
    if (newTimeoutCount >= 3) {
      setShowStillThere(true)
      setStatus('idle')
      busyRef.current = false
      return
    }
    
    // Show wrong status briefly before auto-retry
    setStatus('wrong')
    await new Promise(r => setTimeout(r, 1500)) // 1.5s to see timeout
    
    if (!isPlayingRef.current) return // User paused, don't continue
    
    // Auto-retry: replay current segment (not reset to checkpoint)
    setStatus('segment')
    
    // Play accumulated segments up to current segment index (use refs for current values)
    const segs = segmentsRef.current
    const segIdx = currentSegmentIndexRef.current
    if (segs.length > 0) {
      const accumulatedText = segs.slice(0, segIdx + 1).join(' ')
      await playSegmentLiveTTS(accumulatedText)
      if (!isPlayingRef.current) return // User paused during TTS
      startListeningForBuild(accumulatedText)
    }
    busyRef.current = false
  }

  const startListening = async () => {
    // Increment session nonce to invalidate any pending transcripts from previous session
    listenSessionRef.current = Date.now()
    transcriptRef.current = '';
    committedTextRef.current = '';
    lockedStateRef.current = createFreshLockedState();
    expectedLineRef.current = stripParentheticals(currentLine?.content || '');
    setTranscript('');
    setMissingWords([]);
    setWrongWords([]);
    setMatchedWordCount(0);
    setHasError(false);
    // Reset word animation and results
    accumulatedAudioRef.current = 0
    setAnimatedWordIndex(0)
    setWordResults([])
    listeningRef.current = true;

    // Show "connecting" while we ensure STT is ready — don't show "listening"
    // until audio is actually being captured (prevents lost first words)
    setStatus('connecting');

    // Update prompt to bias toward expected words (instant, no reconnect)
    deepgram.updatePrompt(expectedLineRef.current)

    // Start sending audio — if connection died, reconnect first
    let started = deepgram.startListening()
    if (!started) {
      console.log('[STT] Connection lost, reconnecting...')
      await deepgram.startSession()
      started = deepgram.startListening()
      if (!started) {
        console.error('[STT] Failed to start listening after reconnect')
        setStatus('idle')
        listeningRef.current = false
        busyRef.current = false
        return
      }
    }

    // NOW audio is flowing — safe to show "listening" and start the clock
    lastSpeechRef.current = Date.now();
    setStatus('listening');

    // Start recording user audio for playback
    deepgram.startRecording()

    // Silence timer - coverage-aware: if user has only said part of the line, give more time
    // Actors pause mid-line (e.g. "wow. wow." [pause] "so do you")
    setShowWaitingNudge(false)
    if (silenceTimerRef.current) clearInterval(silenceTimerRef.current)
    silenceTimerRef.current = setInterval(() => {
      if (!listeningRef.current) {
        if (silenceTimerRef.current) clearInterval(silenceTimerRef.current)
        setShowWaitingNudge(false)
        return
      }
      const silenceMs = Date.now() - lastSpeechRef.current
      const hasTranscript = transcriptRef.current.trim()
      if (hasTranscript) {
        // How much of the line has the user said?
        const expectedWords = expectedLineRef.current.split(/\s+/).filter(w => w.length > 0).length
        const spokenWords = hasTranscript.split(/\s+/).filter(w => w.length > 0).length
        const coverage = spokenWords / Math.max(1, expectedWords)
        // If user said most of the line (>= 70%), use normal silence duration
        // If user only said part of the line, give them 5s to continue
        const timeout = coverage >= 0.7 ? settings.silenceDuration : 5000
        // Log every second so we can see the countdown
        if (silenceMs > 1000 && Math.floor(silenceMs / 1000) !== Math.floor((silenceMs - 250) / 1000)) {
          console.log('[Silence]', Math.round(silenceMs/1000) + 's /', (timeout/1000) + 's timeout | spoken:', spokenWords + '/' + expectedWords, '(' + Math.round(coverage * 100) + '%) |', JSON.stringify(hasTranscript))
        }
        if (silenceMs > timeout) {
          console.log('[Silence] FIRED at', Math.round(silenceMs) + 'ms (timeout:', timeout + 'ms, coverage:', Math.round(coverage * 100) + '%) - evaluating')
          setShowWaitingNudge(false)
          finishListeningRef.current()
        }
      } else if (silenceMs > 10000) {
        // Gentle nudge after 10s with no speech — don't evaluate, just show hint
        setShowWaitingNudge(true)
      }
    }, 250)
  }
  const startListeningForSegment = async (segment: string) => { 
    transcriptRef.current = ''; 
    committedTextRef.current = ''; 
    lockedStateRef.current = createFreshLockedState();
    expectedLineRef.current = segment; 
    setTranscript(''); 
    setMissingWords([]); 
    setWrongWords([]); 
    setMatchedWordCount(0); 
    setHasError(false); 
    // Reset word animation and results
    accumulatedAudioRef.current = 0
    setAnimatedWordIndex(0)
    setWordResults([])
    listeningRef.current = true;
    lastSpeechRef.current = Date.now();
    setStatus('listening');

    // Update prompt to bias toward expected words (instant, no reconnect)
    deepgram.updatePrompt(expectedLineRef.current)

    // Start sending audio — if connection died, reconnect first
    let started = deepgram.startListening()
    if (!started) {
      console.log('[STT] Connection lost, reconnecting...')
      await deepgram.startSession()
      started = deepgram.startListening()
      if (!started) {
        console.error('[STT] Failed to start listening after reconnect')
        setStatus('idle')
        listeningRef.current = false
        busyRef.current = false
        return
      }
    }

    // Silence timer - coverage-aware (same as practice mode)
    if (silenceTimerRef.current) clearInterval(silenceTimerRef.current)
    silenceTimerRef.current = setInterval(() => {
      if (!listeningRef.current) {
        if (silenceTimerRef.current) clearInterval(silenceTimerRef.current)
        return
      }
      const silenceMs = Date.now() - lastSpeechRef.current
      const hasTranscript = transcriptRef.current.trim()
      if (hasTranscript) {
        const expectedWords = expectedLineRef.current.split(/\s+/).filter(w => w.length > 0).length
        const spokenWords = hasTranscript.split(/\s+/).filter(w => w.length > 0).length
        const coverage = spokenWords / Math.max(1, expectedWords)
        const timeout = coverage >= 0.7 ? settings.silenceDuration : 5000
        if (silenceMs > timeout) {
          finishListeningRef.current()
        }
      } else if (silenceMs > 15000) {
        finishListeningRef.current()
      }
    }, 250)
  }

  const finishListening = useCallback(() => {
    if (!listeningRef.current) return
    listeningRef.current = false
    setShowWaitingNudge(false)

    // CRITICAL: Stop sending audio to STT immediately (billing stops)
    deepgram.pauseListening()

    // Stop recording and store blob for playback
    deepgram.stopRecording().then(blob => {
      if (blob && blob.size > 0) {
        lastRecordingRef.current = blob
        setHasRecording(true)
      } else {
        setHasRecording(false)
      }
    })

    if (silenceTimerRef.current) clearInterval(silenceTimerRef.current)
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current)
    
    const spoken = transcriptRef.current.trim()

    // Calculate pacing comparison
    const userDuration = speechStartTimeRef.current > 0 ? Date.now() - speechStartTimeRef.current : 0
    const targetDuration = targetDurationRef.current
    if (userDuration > 0 && targetDuration > 0) {
      const delta = ((userDuration - targetDuration) / targetDuration) * 100
      setLastPacingDelta({ userDuration, targetDuration, delta })
    } else {
      setLastPacingDelta(null)
    }

    // Use refs for current values (state may be stale in async callbacks)
    const segs = segmentsRef.current
    const segIdx = currentSegmentIndexRef.current

    console.log('[finishListening] spoken:', JSON.stringify(spoken), 'expected:', JSON.stringify(expectedLineRef.current), 'committed:', JSON.stringify(committedTextRef.current), 'segIdx:', segIdx, 'segs.length:', segs.length)
    
    if (!spoken || !currentLine) {
      playIncorrect()
      setTranscript(spoken || '')

      // Get word-by-word results even for empty transcript (all words will be "missing")
      if (expectedLineRef.current) {
        const wordByWord = getWordByWordResults(expectedLineRef.current, spoken || '', characterNameSet)
        setWordResults(wordByWord.results)
      }

      if (learningMode === 'repeat' && segs.length > 0) {
        // Reset timeout counter on wrong (not timeout)
        setConsecutiveTimeouts(0)
        // Increment consecutive wrongs
        const newWrongCount = consecutiveWrongs + 1
        setConsecutiveWrongs(newWrongCount)

        // If 3 wrongs in a row and not on first segment, go back
        if (newWrongCount >= 3 && segIdx > 0) {
          const prevIndex = segIdx - 1
          setCurrentSegmentIndex(prevIndex)
          setBuildProgress(prevIndex)
          setConsecutiveWrongs(0) // Reset counter
          setStatus('wrong') // Show wrong state with word-by-word results
          const nonce = ++segmentNonceRef.current
          setTimeout(async () => {
            if (segmentNonceRef.current !== nonce) return // Stale
            if (!isPlayingRef.current) return
            setWordResults([])
            setStatus('segment')
            const accumulatedText = segs.slice(0, prevIndex + 1).join(' ')
            await playSegmentLiveTTS(accumulatedText)
            if (segmentNonceRef.current !== nonce || !isPlayingRef.current) return
            startListeningForBuild(accumulatedText)
            busyRef.current = false
          }, 2000)
        } else {
          // Auto-retry current segment after pause to see results
          setStatus('wrong') // Show wrong state with word-by-word results
          const nonce = ++segmentNonceRef.current
          setTimeout(async () => {
            if (segmentNonceRef.current !== nonce) return // Stale
            if (!isPlayingRef.current) return
            setWordResults([])
            setStatus('segment')
            const accumulatedText = segs.slice(0, segIdx + 1).join(' ')
            await playSegmentLiveTTS(accumulatedText)
            if (segmentNonceRef.current !== nonce || !isPlayingRef.current) return
            startListeningForBuild(accumulatedText)
            busyRef.current = false
          }, 2000)
        }
      } else {
        // Practice mode: empty transcript (no speech detected)
        setStatus('wrong')
        busyRef.current = false
        // Auto-retry same line if setting enabled (same logic as normal wrong branch)
        if (settings.autoRepeatOnWrong && isPlayingRef.current) {
          setTimeout(() => {
            if (!isPlayingRef.current) return
            setStatus('idle')
            playCurrentLine()
          }, 1500)
        }
      }
      return
    }
    
    const result = checkAccuracy(expectedLineRef.current, spoken, settings.strictMode, characterNameSet)
    setTranscript(spoken)
    setMissingWords(result.missingWords)
    setWrongWords(result.wrongWords)
    setLastLineAccuracy(result.accuracy)

    // Track per-line attempts for weak line report (functional setState to avoid dep issues)
    if (currentLine?.id) {
      const lineId = currentLine.id
      setLineAttempts(prev => {
        const updated = new Map(prev)
        const entry = updated.get(lineId) || { correct: 0, wrong: 0, accuracies: [] }
        updated.set(lineId, {
          correct: entry.correct + (result.isCorrect ? 1 : 0),
          wrong: entry.wrong + (result.isCorrect ? 0 : 1),
          accuracies: [...entry.accuracies, result.accuracy],
        })
        return updated
      })
    }

    console.log('[finishListening] result.isCorrect:', result.isCorrect, 'expected:', expectedLineRef.current)
    
    if (result.isCorrect) {
      // Reset consecutive wrongs on correct
      setConsecutiveWrongs(0)
      setConsecutiveLineFails(0)
      
      // Build mode: advance to next segment
      if (learningMode === 'repeat' && segs.length > 0) {
        const nextIndex = segIdx + 1
        const isCheckpoint = nextIndex % 5 === 0 && nextIndex < segs.length
        const isComplete = nextIndex >= segs.length
        
        console.log('[finishListening] REPEAT mode - nextIndex:', nextIndex, 'isComplete:', isComplete, 'segs.length:', segs.length)
        
        // Reset timeout counter on correct
        setConsecutiveTimeouts(0)
        
        if (isCheckpoint) {
          if (settings.playSoundOnCorrect) playCheckpoint()
          setLastCheckpoint(nextIndex)
          setCheckpointCount(prev => prev + 1)
        } else {
          if (settings.playSoundOnCorrect) playCorrect()
        }
        
        setBuildProgress(nextIndex)
        saveBuildProgress(currentLine.id, nextIndex, segs.length, isCheckpoint, isComplete)
        
        if (isComplete) {
          // Check if we need more full line repetitions
          const newCompletions = fullLineCompletions + 1
          const requiredReps = settings.repeatFullLineTimes || 1
          
          if (newCompletions < requiredReps) {
            // Need more repetitions - replay full line
            setFullLineCompletions(newCompletions)
            if (settings.playSoundOnCorrect) playCorrect()
            setStatus('segment')
            const nonce = ++segmentNonceRef.current
            setTimeout(async () => {
              if (segmentNonceRef.current !== nonce) return
              const fullText = segs.join(' ')
              await playSegmentLiveTTS(fullText)
              if (segmentNonceRef.current !== nonce || !isPlayingRef.current) return
              startListeningForBuild(fullText)
              busyRef.current = false
            }, 500)
          } else {
            // Line fully complete!
            if (settings.playSoundOnCorrect) playLineComplete() // Triumphant sound
            setSegments([])
            setCurrentSegmentIndex(0)
            setBuildProgress(0)
            setLastCheckpoint(0)
            setCheckpointCount(0)
            setFullLineCompletions(0) // Reset for next line
            setStats(s => ({ ...s, correct: s.correct + 1, completed: new Set(Array.from(s.completed).concat(currentLine.id)) }))
            if (scriptId) {
              recordAttempt(scriptId, true)
              markLineCompleted(scriptId, currentLine.id)
              saveRepeatProgress(scriptId, 0, 0) // Reset repeat progress
            }
            recordLineCompletion(user?.id || '') // Track for streaks
            setStatus('correct')
            setTimeout(() => { setStatus('idle'); busyRef.current = false; next() }, settings.autoAdvanceDelay)
          }
        } else {
          // Advance to next segment and auto-play
          console.log('[finishListening] Advancing to segment', nextIndex, '- playing accumulated:', segs.slice(0, nextIndex + 1).join(' '))
          setCurrentSegmentIndex(nextIndex)
          setStatus('segment')
          // Save repeat progress
          if (scriptId) saveRepeatProgress(scriptId, nextIndex, nextIndex)
          // Play the accumulated text (now including next segment)
          const accumulatedText = segs.slice(0, nextIndex + 1).join(' ')
          const nonce = ++segmentNonceRef.current // Guard against race conditions
          playSegmentLiveTTS(accumulatedText).then(() => {
            if (segmentNonceRef.current !== nonce) return // Stale callback, another action took over
            if (!isPlayingRef.current) return // User paused, don't continue
            startListeningForBuild(accumulatedText)
            busyRef.current = false
          })
        }
        return
      }
      
      // Normal practice mode
      if (settings.playSoundOnCorrect) playCorrect()
      setStatus('correct')
      setStats(s => ({ ...s, correct: s.correct + 1, completed: new Set(Array.from(s.completed).concat(currentLine.id)) }))
      if (scriptId) {
        recordAttempt(scriptId, true)
        markLineCompleted(scriptId, currentLine.id)
      }
      recordLineCompletion(user?.id || '') // Track for streaks
      if (settings.autoAdvanceOnCorrect) setTimeout(() => { setStatus('idle'); busyRef.current = false; next() }, settings.autoAdvanceDelay)
      else busyRef.current = false
    } else {
      if (settings.playSoundOnWrong) playIncorrect()
      setStats(s => ({ ...s, wrong: s.wrong + 1 }))
      if (scriptId) recordAttempt(scriptId, false)
      
      // Get word-by-word results for visual feedback
      const wordByWord = getWordByWordResults(expectedLineRef.current, spoken, characterNameSet)
      setWordResults(wordByWord.results)
      
      // Show error popup with what they got wrong
      const errorMsg = result.wrongWords.length > 0 
        ? result.wrongWords[0] // e.g. '"old" instead of "young"'
        : result.missingWords.length > 0 
        ? `Missing: "${result.missingWords[0]}"` 
        : 'Try again'
      setErrorPopup(errorMsg)
      setTimeout(() => setErrorPopup(null), 2500) // Hide after 2.5s

      // Speak error feedback via TTS (fire-and-forget, doesn't block flow)
      if (settings.speakErrorFeedback && errorMsg !== 'Try again') {
        playSegmentLiveTTS(errorMsg).catch(() => {})
      }

      if (learningMode === 'repeat' && segs.length > 0) {
        // Reset timeout counter on wrong answer
        setConsecutiveTimeouts(0)
        // Increment consecutive wrongs
        const newWrongCount = consecutiveWrongs + 1
        setConsecutiveWrongs(newWrongCount)

        // If 3 wrongs in a row and not on first segment, go back
        if (newWrongCount >= 3 && segIdx > 0) {
          const prevIndex = segIdx - 1
          setCurrentSegmentIndex(prevIndex)
          setBuildProgress(prevIndex)
          setConsecutiveWrongs(0) // Reset counter
          setStatus('wrong')
          const nonce = ++segmentNonceRef.current
          setTimeout(async () => {
            if (segmentNonceRef.current !== nonce) return
            if (!isPlayingRef.current) return
            setWordResults([])
            setStatus('segment')
            const accumulatedText = segs.slice(0, prevIndex + 1).join(' ')
            await playSegmentLiveTTS(accumulatedText)
            if (segmentNonceRef.current !== nonce || !isPlayingRef.current) return
            startListeningForBuild(accumulatedText)
            busyRef.current = false
          }, 2000)
        } else {
          // Auto-retry current segment after pause to show results
          setStatus('wrong')
          const nonce = ++segmentNonceRef.current
          setTimeout(async () => {
            if (segmentNonceRef.current !== nonce) return
            if (!isPlayingRef.current) return
            setWordResults([])
            setStatus('segment')
            const accumulatedText = segs.slice(0, segIdx + 1).join(' ')
            await playSegmentLiveTTS(accumulatedText)
            if (segmentNonceRef.current !== nonce || !isPlayingRef.current) return
            startListeningForBuild(accumulatedText)
            busyRef.current = false
          }, 2000)
        }
      } else {
        setStatus('wrong')
        busyRef.current = false
        
        // Handle fail modes
        if (settings.repeatFullLineOnFail && isPlayingRef.current) {
          // Track line failures
          const newLineFails = consecutiveLineFails + 1
          setConsecutiveLineFails(newLineFails)
          
          // If restartOnFail is also enabled and we've failed the line twice, restart scene
          if (settings.restartOnFail && newLineFails >= 2) {
            setTimeout(() => {
              if (!isPlayingRef.current) return
              setCurrentLineIndex(0)
              setCurrentSegmentIndex(0)
              setBuildProgress(0)
              setConsecutiveWrongs(0)
              setConsecutiveLineFails(0)
              setStatus('idle')
            }, 1500)
          } else {
            // Reset to beginning of current line (segment 0) and replay
            setTimeout(() => {
              if (!isPlayingRef.current) return
              setCurrentSegmentIndex(0)
              setBuildProgress(0)
              setConsecutiveWrongs(0)
              setStatus('idle')
              playCurrentLine()
            }, 1500)
          }
        } else if (settings.restartOnFail && isPlayingRef.current) {
          // Just restart from beginning of scene immediately
          setTimeout(() => {
            if (!isPlayingRef.current) return
            setCurrentLineIndex(0)
            setCurrentSegmentIndex(0)
            setBuildProgress(0)
            setConsecutiveWrongs(0)
            setConsecutiveLineFails(0)
            setStatus('idle')
          }, 1500)
        } else if (settings.autoRepeatOnWrong && isPlayingRef.current) {
          // Auto-repeat current segment on wrong
          setTimeout(() => {
            if (!isPlayingRef.current) return
            setStatus('idle')
            playCurrentLine()
          }, 1500) // Wait 1.5s then replay
        }
      }
    }
  }, [currentLine, settings.autoAdvanceOnCorrect, settings.autoAdvanceDelay, settings.autoRepeatOnWrong, settings.repeatFullLineTimes, settings.restartOnFail, settings.repeatFullLineOnFail, settings.strictMode, learningMode, segments, currentSegmentIndex, lastCheckpoint, consecutiveWrongs, consecutiveLineFails, fullLineCompletions])
  
  useEffect(() => { finishListeningRef.current = finishListening }, [finishListening])
  
  // Hard stop - doesn't evaluate, just stops
  const stopListening = () => {
    listeningRef.current = false
    setShowWaitingNudge(false)

    // CRITICAL: Stop sending audio to STT immediately (billing stops)
    deepgram.pauseListening()
    
    if (silenceTimerRef.current) {
      clearInterval(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current)
      commitTimerRef.current = null
    }
    setStatus('idle')
    busyRef.current = false
  }
  
  const retry = () => {
    busyRef.current = false
    setStatus('idle')
    if (learningMode === 'repeat' && segments.length > 0) {
      // In build mode, retry plays the accumulated segments again
      setTimeout(() => playCurrentLine(), 100)
    } else {
      setTimeout(startListening, 100)
    }
  }

  // Play back user's last recording
  const playLastRecording = () => {
    if (!lastRecordingRef.current) return
    if (isPlayingRecording && playbackAudioRef.current) {
      playbackAudioRef.current.pause()
      playbackAudioRef.current = null
      setIsPlayingRecording(false)
      return
    }
    const url = URL.createObjectURL(lastRecordingRef.current)
    const audio = new Audio(url)
    playbackAudioRef.current = audio
    setIsPlayingRecording(true)
    audio.onended = () => {
      URL.revokeObjectURL(url)
      playbackAudioRef.current = null
      setIsPlayingRecording(false)
    }
    audio.onerror = () => {
      URL.revokeObjectURL(url)
      playbackAudioRef.current = null
      setIsPlayingRecording(false)
    }
    audio.play().catch(() => {
      URL.revokeObjectURL(url)
      playbackAudioRef.current = null
      setIsPlayingRecording(false)
    })
  }
  
  const handlePlayPause = async () => {
    // Unlock audio on user interaction (critical for mobile)
    await audioManager.unlock()
    
    // If anything is happening, stop it immediately
    if (isPlaying || status !== 'idle') {
      stopPlayback()
      stopListening()
      pendingListenRef.current = null
    } else if (pendingListenRef.current) {
      // User manually starting recording (autoStartRecording off)
      const pendingFn = pendingListenRef.current
      pendingListenRef.current = null
      setIsPlaying(true)
      pendingFn()
    } else {
      // Clear "still there" prompt when manually pressing play
      setShowStillThere(false)
      setConsecutiveTimeouts(0)
      setIsPlaying(true)
    }
  }
  
  const handleModeChange = async (mode: LearningMode) => {
    // Unlock audio on user interaction (critical for mobile)
    await audioManager.unlock()
    
    fullReset()
    setLearningMode(mode) 
    setCurrentLineIndex(0)
  }

  const handleTitleSave = async () => {
    if (currentScript && titleValue.trim() && titleValue !== currentScript.title) {
      await updateScript(currentScript.id, { title: titleValue.trim() })
      useStore.getState().setCurrentScript({ ...currentScript, title: titleValue.trim() })
    }
    setEditingTitle(false)
  }

  // Summary screen
  if (showSummary) {
    const total = stats.correct + stats.wrong
    const accuracy = total > 0 ? Math.round((stats.correct / total) * 100) : 0
    const allPickups = Array.from(linePickupTimesRef.current.values()).flat()
    const avgPickup = allPickups.length > 0 ? allPickups.reduce((a, b) => a + b, 0) / allPickups.length : 0
    // Compute weak lines: sorted by wrong count desc, then low avg accuracy
    const weakLines = Array.from(lineAttempts.entries())
      .map(([id, data]) => ({
        id,
        ...data,
        avgAccuracy: data.accuracies.length > 0 ? Math.round(data.accuracies.reduce((a, b) => a + b, 0) / data.accuracies.length) : 0,
        line: playableLines.find(l => l.id === id),
      }))
      .filter(w => w.wrong > 0 || w.avgAccuracy < 80)
      .sort((a, b) => b.wrong - a.wrong || a.avgAccuracy - b.avgAccuracy)
      .slice(0, 5)
    return (
      <div className="h-full flex items-center justify-center p-6 pb-24 overflow-y-auto">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-sm">
          <Card padding="p-6" className="text-center">
            <div className="text-4xl mb-4 text-accent font-bold">{accuracy}%</div>
            <h2 className="font-display text-2xl text-text mb-4">Complete</h2>
            {learningMode !== 'listen' && (
              <>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="p-3 bg-success-muted rounded-lg"><div className="text-2xl font-bold text-success">{stats.correct}</div><div className="text-xs text-text-muted">Correct</div></div>
                  <div className="p-3 bg-error-muted rounded-lg"><div className="text-2xl font-bold text-error">{stats.wrong}</div><div className="text-xs text-text-muted">Mistakes</div></div>
                </div>
                {allPickups.length > 0 && (
                  <div className="p-3 bg-ai-muted rounded-lg mb-4">
                    <div className="text-lg font-bold text-ai">{(avgPickup / 1000).toFixed(1)}s</div>
                    <div className="text-xs text-text-muted">Avg Cue Pickup</div>
                  </div>
                )}
                {weakLines.length > 0 && (
                  <div className="text-left mb-4">
                    <div className="text-sm font-semibold text-text mb-2">Problem Lines</div>
                    <div className="space-y-1.5">
                      {weakLines.map(w => (
                        <div key={w.id} className="p-2 bg-error-muted rounded-lg text-xs">
                          <div className="text-text truncate">{w.line?.content || 'Unknown'}</div>
                          <div className="flex gap-3 text-text-muted mt-0.5">
                            <span className="text-error">{w.wrong} wrong</span>
                            <span className="text-success">{w.correct} correct</span>
                            <span className="text-warning">{w.avgAccuracy}% avg</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <Button
                      size="sm"
                      onClick={() => {
                        const ids = weakLines.map(w => w.id)
                        setWeakLineFilter(ids)
                        setShowSummary(false)
                        setStats({ correct: 0, wrong: 0, completed: new Set() })
                        // Jump to first weak line
                        const firstIdx = playableLines.findIndex(l => ids.includes(l.id))
                        if (firstIdx >= 0) {
                          const cueIdx = firstIdx > 0 && !playableLines[firstIdx - 1]?.is_user_line
                            ? firstIdx - 1 : firstIdx
                          goTo(cueIdx, true)
                        }
                      }}
                      className="w-full mt-3"
                    >
                      Drill Weak Lines ({weakLines.length})
                    </Button>
                  </div>
                )}
              </>
            )}
            <Button onClick={() => { setShowSummary(false); setCurrentSceneIndex(0); goTo(0); fullReset() }} className="w-full mb-2">Again</Button>
            <Button variant="secondary" onClick={() => setActiveTab('library')} className="w-full">Back to Library</Button>
          </Card>
        </motion.div>
      </div>
    )
  }

  // No script
  if (!currentScript) {
    return (
      <div className="h-full flex items-center justify-center p-5">
        <Card padding="p-8" className="text-center max-w-sm">
          <h2 className="text-text font-display text-xl mb-2">No Script Selected</h2>
          <Button onClick={() => setActiveTab('library')}>Go to Library</Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-bg practice-screen">
      <audio ref={audioRef} preload="auto" />
      
      {/* Minimal Header */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between border-b border-border/30">
        <button onClick={() => setActiveTab('library')} className="text-text-muted hover:text-text p-1 -ml-1">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        
        {editingTitle ? (
          <input
            type="text"
            value={titleValue}
            onChange={e => setTitleValue(e.target.value)}
            onBlur={handleTitleSave}
            onKeyDown={e => { if (e.key === 'Enter') handleTitleSave(); if (e.key === 'Escape') setEditingTitle(false) }}
            autoFocus
            className="flex-1 mx-4 text-base font-semibold text-text text-center bg-bg-surface/50 rounded-lg px-3 py-1 border border-accent/50 outline-none"
          />
        ) : (
          <button 
            onClick={() => { setTitleValue(currentScript.title); setEditingTitle(true) }}
            className="flex-1 text-base font-semibold text-text text-center truncate px-4 hover:text-accent transition-colors"
          >
            {currentScript.title}
          </button>
        )}
        
        <div className="flex items-center gap-2">
          {micReady && <span className="w-2 h-2 rounded-full bg-success" />}
          {/* Notes visibility toggle */}
          <button 
            onClick={() => setShowNotes(!showNotes)} 
            className={`p-2 rounded-full transition-colors ${showNotes ? 'text-ai' : 'text-text-subtle'}`}
            title={showNotes ? 'Hide notes' : 'Show notes'}
          >
            {showNotes ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
              </svg>
            )}
          </button>
          <button onClick={() => setShowSettings(!showSettings)} className={`p-2 rounded-full ${showSettings ? 'bg-accent/20 text-accent' : 'text-text-muted'}`}>
            <IconSettings size={18} />
          </button>
        </div>
      </div>

      {/* Swipeable Scene Header */}
      {scriptScenes.length > 0 && (
        <motion.div
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.2}
          onDragEnd={handleSceneSwipe}
          className="cursor-grab active:cursor-grabbing select-none bg-bg-surface/30"
        >
          <div className="px-4 py-3">
            {/* Episode info - compact row */}
            {(currentScript.season || currentScript.episode_number || currentScript.episode_title) && (
              <div className="text-center text-xs text-text-muted mb-2">
                {currentScript.season && <span>Season {currentScript.season}</span>}
                {currentScript.season && currentScript.episode_number && <span>, </span>}
                {currentScript.episode_number && <span>Episode {currentScript.episode_number}</span>}
                {currentScript.episode_title && <span className="text-text-secondary"> — "{currentScript.episode_title}"</span>}
              </div>
            )}
            
            {/* Scene navigation row */}
            <div className="flex items-center justify-between">
              <button 
                onClick={goToPrevScene}
                disabled={currentSceneIndex === 0}
                className={`p-1.5 rounded-full transition-all ${currentSceneIndex === 0 ? 'opacity-20' : 'hover:bg-overlay-10 text-text-muted hover:text-text'}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              
              <motion.div 
                key={currentSceneIndex}
                initial={{ opacity: 0, x: sceneSwipeDirection === 'left' ? 20 : sceneSwipeDirection === 'right' ? -20 : 0 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex-1 text-center px-3"
              >
                {/* Scene slug - prominent */}
                <div className="text-sm font-semibold text-text tracking-wide">{getSceneSlug(currentSceneData)}</div>
                
                {/* Scene counter and stats */}
                <div className="text-[11px] text-text-muted mt-0.5">
                  Scene {currentSceneIndex + 1} of {scriptScenes.length}
                  <span className="mx-1.5 opacity-40">·</span>
                  {playableLines.length} lines
                  {userLines.length > 0 && (
                    <span className="text-accent"> · {userLines.length} as {currentScript.user_role}</span>
                  )}
                </div>
              </motion.div>
              
              <button 
                onClick={goToNextScene}
                disabled={currentSceneIndex === scriptScenes.length - 1}
                className={`p-1.5 rounded-full transition-all ${currentSceneIndex === scriptScenes.length - 1 ? 'opacity-20' : 'hover:bg-overlay-10 text-text-muted hover:text-text'}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            
            {/* Scene description - under the heading */}
            {(currentSceneData?.description || currentScript.scene_description) && (
              <p className="text-[11px] text-text-subtle text-center italic mt-2 px-6 leading-relaxed">
                {currentSceneData?.description || currentScript.scene_description}
              </p>
            )}
          </div>
        </motion.div>
      )}

      {/* Settings Panel - Full screen slide from right */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
            onClick={() => setShowSettings(false)}
          >
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="absolute inset-0 bg-bg flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center gap-3 px-4 py-4 border-b border-border">
                <button
                  onClick={() => setShowSettings(false)}
                  className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-overlay-5 transition-colors"
                >
                  <svg className="w-6 h-6 text-text" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <h2 className="text-lg font-medium text-text">Practice Settings</h2>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {/* Mode Selection - 3-way toggle */}
                <div>
                  <div className="flex bg-bg-surface rounded-xl p-1">
                    {([
                      { key: 'listen', label: 'Listen', desc: 'Hear the scene' },
                      { key: 'repeat', label: 'Repeat', desc: 'Build up lines' },
                      { key: 'practice', label: 'Practice', desc: 'Speak & get feedback' },
                    ] as const).map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => handleModeChange(key)}
                        className={`flex-1 py-3 px-2 rounded-lg text-sm font-medium transition-all ${
                          learningMode === key
                            ? 'bg-accent text-white shadow-lg'
                            : 'text-text-muted hover:text-text'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-text-subtle mt-2 text-center">
                    {learningMode === 'listen' && 'Listen to the full scene with AI voices'}
                    {learningMode === 'repeat' && 'Build up your lines segment by segment'}
                    {learningMode === 'practice' && 'Speak your lines and get accuracy feedback'}
                  </p>
                </div>

                {/* ── ESSENTIALS ── */}
                <SettingsSection title="Essentials" defaultOpen>
                  {/* Speed */}
                  <div>
                    <label className="text-xs text-text-muted uppercase tracking-wide block mb-3">Speed</label>
                    <div className="flex gap-2">
                      {[0.5, 0.75, 1, 1.25, 1.5].map(speed => (
                        <button
                          key={speed}
                          onClick={() => updateSettings({ playbackSpeed: speed })}
                          className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${
                            settings.playbackSpeed === speed
                              ? 'bg-accent text-white'
                              : 'bg-bg-surface text-text-muted hover:text-text'
                          }`}
                        >
                          {speed}x
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Text Visibility */}
                  {['practice', 'repeat'].includes(learningMode) && (
                    <div>
                      <label className="text-xs text-text-muted uppercase tracking-wide block mb-3">Text Visibility</label>
                      <div className="grid grid-cols-4 gap-2">
                        {([
                          { key: 'full', label: 'Full' },
                          { key: 'first-letter', label: '1st' },
                          { key: 'blurred', label: 'Blur' },
                          { key: 'hidden', label: 'Hide' },
                        ] as { key: 'full' | 'first-letter' | 'blurred' | 'hidden'; label: string }[]).map(opt => (
                          <button
                            key={opt.key}
                            onClick={() => updateSettings({ textVisibility: opt.key })}
                            className={`py-2.5 rounded-xl text-sm font-medium transition-all ${
                              settings.textVisibility === opt.key
                                ? 'bg-accent text-white'
                                : 'bg-bg-surface text-text-muted hover:text-text'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Key behavior toggles */}
                  {learningMode !== 'listen' && (
                    <div className="space-y-1">
                      <SettingsToggle
                        label="Auto-advance on correct"
                        value={settings.autoAdvanceOnCorrect}
                        onChange={v => updateSettings({ autoAdvanceOnCorrect: v })}
                      />
                      <SettingsToggle
                        label="Auto-start recording"
                        value={settings.autoStartRecording}
                        onChange={v => updateSettings({ autoStartRecording: v })}
                      />
                    </div>
                  )}

                  <SettingsToggle
                    label="Loop scene"
                    value={loop}
                    onChange={setLoop}
                  />

                  {/* Full Line Repetitions (repeat mode) */}
                  {learningMode === 'repeat' && (
                    <div>
                      <label className="text-xs text-text-muted uppercase tracking-wide block mb-3">Full Line Repetitions</label>
                      <div className="flex gap-2">
                        {[1, 2, 3, 4].map(n => (
                          <button
                            key={n}
                            onClick={() => updateSettings({ repeatFullLineTimes: n })}
                            className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${
                              (settings.repeatFullLineTimes || 1) === n
                                ? 'bg-accent text-white'
                                : 'bg-bg-surface text-text-muted hover:text-text'
                            }`}
                          >
                            {n}x
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </SettingsSection>

                {/* ── AUDIO & VOICES ── */}
                <SettingsSection title="Audio & Voices">
                  <div className="space-y-1">
                    <SettingsToggle
                      label="Play 'your turn' cue"
                      value={settings.playYourTurnCue}
                      onChange={v => updateSettings({ playYourTurnCue: v })}
                    />
                    <p className="text-xs text-text-muted ml-0 mb-2">Subtle sound when it's your line</p>

                    <SettingsToggle
                      label="Sound on correct"
                      value={settings.playSoundOnCorrect}
                      onChange={v => updateSettings({ playSoundOnCorrect: v })}
                    />
                    <SettingsToggle
                      label="Sound on wrong"
                      value={settings.playSoundOnWrong}
                      onChange={v => updateSettings({ playSoundOnWrong: v })}
                    />
                    <SettingsToggle
                      label="Speak error feedback"
                      value={settings.speakErrorFeedback}
                      onChange={v => updateSettings({ speakErrorFeedback: v })}
                    />
                    <p className="text-xs text-text-muted ml-0 mb-2">AI speaks what you got wrong</p>
                    <SettingsToggle
                      label="Speak character names"
                      value={settings.speakCharacterNames}
                      onChange={v => updateSettings({ speakCharacterNames: v })}
                    />
                    <SettingsToggle
                      label="Speak parentheticals"
                      value={settings.speakParentheticals}
                      onChange={v => updateSettings({ speakParentheticals: v })}
                    />
                    <p className="text-xs text-text-muted ml-0 mb-2">Narrate cues like "(angrily)"</p>
                    <SettingsToggle
                      label="Use pre-generated audio"
                      value={settings.usePreGeneratedAudio}
                      onChange={v => updateSettings({ usePreGeneratedAudio: v })}
                    />
                    <SettingsToggle
                      label="Play my lines (AI speaks for me)"
                      value={settings.playMyLine}
                      onChange={v => updateSettings({ playMyLine: v })}
                    />
                    <p className="text-xs text-text-muted ml-0 mb-2">AI will speak your lines too</p>
                    <SettingsToggle
                      label="Partner speed variation"
                      value={settings.partnerSpeedVariation}
                      onChange={v => updateSettings({ partnerSpeedVariation: v })}
                    />
                  </div>

                  {/* Stage Directions */}
                  <div className="pt-2">
                    <SettingsToggle
                      label="Include stage directions"
                      value={includeDirections}
                      onChange={setIncludeDirections}
                    />
                    {includeDirections && (
                      <div className="flex gap-2 bg-bg-surface rounded-xl p-1.5 mt-3">
                        {(['spoken', 'shown', 'muted'] as const).map(m => (
                          <button
                            key={m}
                            onClick={() => setDirectionsMode(m)}
                            className={`flex-1 py-2.5 rounded-lg text-sm font-medium ${directionsMode === m ? 'bg-overlay-10 text-text' : 'text-text-muted'}`}
                          >
                            {m.charAt(0).toUpperCase() + m.slice(1)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </SettingsSection>

                {/* ── TIMING & FLOW ── */}
                <SettingsSection title="Timing & Flow">
                  {/* Wait for me delay */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-sm font-medium text-text">Wait before my turn</label>
                      <span className="text-sm font-medium text-accent">{(settings.waitForMeDelay / 1000).toFixed(1)}s</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={3000}
                      step={250}
                      value={settings.waitForMeDelay}
                      onChange={(e) => updateSettings({ waitForMeDelay: Number(e.target.value) })}
                      className="w-full accent-accent"
                    />
                    <p className="text-xs text-text-muted mt-1">Pause after AI speaks before your turn</p>
                  </div>

                  {/* Silence duration */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-sm font-medium text-text">Silence between lines</label>
                      <span className="text-sm font-medium text-accent">{(settings.silenceDuration / 1000).toFixed(1)}s</span>
                    </div>
                    <input
                      type="range"
                      min={500}
                      max={3000}
                      step={250}
                      value={settings.silenceDuration}
                      onChange={(e) => updateSettings({ silenceDuration: Number(e.target.value) })}
                      className="w-full accent-accent"
                    />
                  </div>

                  {learningMode !== 'listen' && (
                    <div className="space-y-1">
                      <SettingsToggle
                        label="Auto-repeat on wrong"
                        value={settings.autoRepeatOnWrong}
                        onChange={v => updateSettings({ autoRepeatOnWrong: v })}
                      />
                      <p className="text-xs text-text-muted ml-0 mb-2">Replay the line if you get it wrong</p>
                      <SettingsToggle
                        label="Repeat full line on fail"
                        value={settings.repeatFullLineOnFail}
                        onChange={v => updateSettings({ repeatFullLineOnFail: v })}
                      />
                      <p className="text-xs text-text-muted ml-0 mb-2">Restart entire line from beginning on fail</p>
                      <SettingsToggle
                        label="Restart scene on fail"
                        value={settings.restartOnFail}
                        onChange={v => updateSettings({ restartOnFail: v })}
                      />
                      <p className="text-xs text-text-muted ml-0 mb-2">{settings.repeatFullLineOnFail ? 'Back to first line after failing twice' : 'Back to first line when you fail'}</p>
                    </div>
                  )}

                  <SettingsToggle
                    label="Random line order"
                    value={settings.randomOrder}
                    onChange={v => { updateSettings({ randomOrder: v }); if (v) buildRandomQueue() }}
                  />
                </SettingsSection>

                {/* ── DISPLAY ── */}
                <SettingsSection title="Display">
                  <div className="space-y-1">
                    <SettingsToggle
                      label="Show live transcript"
                      value={settings.showLiveTranscript}
                      onChange={v => updateSettings({ showLiveTranscript: v })}
                    />
                    <SettingsToggle
                      label="Show accuracy score"
                      value={settings.showAccuracyScore}
                      onChange={v => updateSettings({ showAccuracyScore: v })}
                    />
                  </div>

                  {/* Cue-only words */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-sm font-medium text-text">Cue-only words</label>
                      <span className="text-sm font-medium text-accent">{settings.cueOnlyWords > 0 ? `${settings.cueOnlyWords} words` : 'Off'}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={10}
                      step={1}
                      value={settings.cueOnlyWords}
                      onChange={(e) => updateSettings({ cueOnlyWords: Number(e.target.value) })}
                      className="w-full accent-accent"
                    />
                    <p className="text-xs text-text-muted mt-1">Show only the first N words as a cue</p>
                  </div>

                  {/* Cold read timer */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-sm font-medium text-text">Cold read timer</label>
                      <span className="text-sm font-medium text-accent">{settings.coldReadTime > 0 ? `${settings.coldReadTime}s` : 'Off'}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={10}
                      step={1}
                      value={settings.coldReadTime}
                      onChange={(e) => updateSettings({ coldReadTime: Number(e.target.value) })}
                      className="w-full accent-accent"
                    />
                    <p className="text-xs text-text-muted mt-1">Show text briefly then apply visibility</p>
                  </div>

                  {/* Before/After visibility */}
                  <div className="space-y-3">
                    <SettingsToggle
                      label="Before/after visibility"
                      value={settings.useBeforeAfterVisibility}
                      onChange={v => updateSettings({ useBeforeAfterVisibility: v })}
                    />

                    {settings.useBeforeAfterVisibility && (
                      <>
                        <div>
                          <label className="text-xs text-text-muted block mb-2">Before speaking</label>
                          <div className="grid grid-cols-4 gap-1 bg-bg-surface rounded-lg p-1">
                            {([
                              { key: 'full', label: 'Full' },
                              { key: 'first-letter', label: '1st' },
                              { key: 'blurred', label: 'Blur' },
                              { key: 'hidden', label: 'Hide' }
                            ] as const).map(({ key, label }) => (
                              <button
                                key={key}
                                onClick={() => updateSettings({ visibilityBeforeSpeaking: key })}
                                className={`py-2 rounded text-[10px] font-medium ${settings.visibilityBeforeSpeaking === key ? 'bg-accent text-white' : 'text-text-muted'}`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-text-muted block mb-2">After speaking</label>
                          <div className="grid grid-cols-4 gap-1 bg-bg-surface rounded-lg p-1">
                            {([
                              { key: 'full', label: 'Full' },
                              { key: 'first-letter', label: '1st' },
                              { key: 'blurred', label: 'Blur' },
                              { key: 'hidden', label: 'Hide' }
                            ] as const).map(({ key, label }) => (
                              <button
                                key={key}
                                onClick={() => updateSettings({ visibilityAfterSpeaking: key })}
                                className={`py-2 rounded text-[10px] font-medium ${settings.visibilityAfterSpeaking === key ? 'bg-accent text-white' : 'text-text-muted'}`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </SettingsSection>
              </div>

              {/* Sticky footer with Done button */}
              <div className="flex-shrink-0 px-5 pt-4 pb-8 border-t border-border bg-bg">
                <Button onClick={() => setShowSettings(false)} className="w-full">Done</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress bar for current scene */}
      <ProgressBar value={playableLines.length > 0 ? ((currentLineIndex + 1) / playableLines.length) * 100 : 0} color="var(--ai)" height={2} />

      {/* Lines */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2" onClick={() => setSelectedLineId(null)}>
        {playableLines.map((line, i) => {
          const isCurrent = i === currentLineIndex
          const isUser = line.is_user_line
          const isNarrator = line.line_type === 'action' || line.line_type === 'transition'
          const isDone = stats.completed.has(line.id)
          const charVoice = !isUser ? characters.find(c => c.name === line.character_name) : null

          if (learningMode === 'listen' && isNarrator && directionsMode === 'muted' && !isCurrent) return null

          // Action/narrator lines - NO text visibility applied (only for user lines)
          if (isNarrator) {
            return (
              <motion.div 
                key={line.id} 
                ref={(el) => { if (el) lineRefs.current.set(i, el) }}
                animate={{ scale: isCurrent ? 1.01 : 1 }} 
                className={`group ${canInteract ? 'cursor-pointer' : ''}`}
              >
                <div 
                  onClick={() => canInteract && goTo(i, true)}
                  className={`px-4 py-2.5 rounded-lg text-sm italic text-center relative ${isCurrent ? 'bg-ai-highlight text-ai' : 'bg-overlay-5 text-text-muted'}`}
                >
                  {line.content}
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditModal({ type: 'line', data: line, mode: 'edit' }) }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-overlay-10 text-text-muted hover:text-text opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Edit"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  </button>
                </div>
              </motion.div>
            )
          }

          // Dialogue lines
          const isSelected = selectedLineId === line.id
          
          // Handle tap: single tap selects, double tap plays
          const handleLineTap = () => {
            if (!canInteract) return
            
            const now = Date.now()
            const lastTap = lastTapRef.current
            
            // Check for double tap (within 300ms on same line)
            if (lastTap && lastTap.lineId === line.id && now - lastTap.time < 300) {
              // Double tap - play the line
              goTo(i, true)
              setSelectedLineId(null)
              lastTapRef.current = null
            } else {
              // Single tap - select/deselect
              if (isSelected) {
                setSelectedLineId(null)
              } else {
                setSelectedLineId(line.id)
              }
              lastTapRef.current = { lineId: line.id, time: now }
            }
          }
          
          return (
            <motion.div 
              key={line.id} 
              ref={(el) => { if (el) lineRefs.current.set(i, el) }}
              animate={{ scale: isCurrent ? 1.01 : 1 }} 
              className={`group rounded-lg ${canInteract ? 'cursor-pointer' : ''} ${isCurrent ? 'bg-ai-highlight' : isDone ? 'bg-success/5' : ''} ${isSelected ? 'bg-ai-muted' : ''}`}
            >
              <div className="p-3" onClick={handleLineTap}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-bold ${isUser ? 'text-accent' : 'text-ai'}`}>{line.character_name}</span>
                  {isDone && <IconCheck size={10} className="text-success" />}
                  {charVoice?.voice_name && <span className="text-[10px] text-text-subtle px-1 py-0.5 bg-overlay-5 rounded">{charVoice.voice_name}</span>}
                  {(line.parenthetical || line.delivery_note) && <span className="text-[10px] text-warning/80 italic">({line.parenthetical || line.delivery_note})</span>}
                  {line.notes && <span className="text-[10px] text-ai font-medium">•</span>}
                  
                  {/* Action buttons - show on hover OR when selected (for mobile) */}
                  <div className={`ml-auto flex gap-1 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    {/* Play button - visible when selected */}
                    {isSelected && canInteract && (
                      <button
                        onClick={(e) => { e.stopPropagation(); goTo(i, true); setSelectedLineId(null) }}
                        className="p-1.5 rounded-lg bg-accent/20 hover:bg-accent/30 text-accent"
                        title="Play from here"
                      >
                        <IconPlay size={14} />
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditModal({ type: 'line', data: line, mode: 'edit' }); setSelectedLineId(null) }}
                      className="p-1 rounded hover:bg-overlay-10 text-text-muted hover:text-text"
                      title="Edit line"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditModal({ type: 'line', data: { ...line, afterLineId: line.id, script_id: line.script_id, scene_id: line.scene_id, sort_order: line.sort_order + 1 }, mode: 'add' }); setSelectedLineId(null) }}
                      className="p-1 rounded hover:bg-overlay-10 text-text-muted hover:text-success"
                      title="Add line after"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    </button>
                  </div>
                </div>
                {/* Line content with real-time word highlighting and build progress underline */}
                {isCurrent && isUser && (status === 'listening' || status === 'segment' || status === 'correct' || status === 'wrong' || (learningMode === 'repeat' && segments.length > 0)) ? (
                  <p className="text-sm leading-relaxed">
                    {(() => {
                      // Split content into parts: spoken words and parentheticals
                      // Regex captures parentheticals as separate parts
                      const parts = line.content.split(/(\([^)]*\))/)
                      
                      // Calculate which words are in the "built" portion (segments 0 to buildProgress-1)
                      const builtText = segments.slice(0, buildProgress).join(' ')
                      const builtWordCount = builtText ? builtText.split(/\s+/).length : 0
                      
                      // Word coloring logic:
                      // - While listening: words go gray → white (animated) → green (matched by transcript)
                      // - After result: green for correct, red for errors
                      const isShowingResult = status === 'correct' || status === 'wrong'
                      const greenWordCount = isShowingResult ? matchedWordCount : (status === 'listening' ? matchedWordCount : builtWordCount)
                      const whiteWordCount = status === 'listening' ? animatedWordIndex : 0
                      
                      let spokenWordIndex = 0 // Track spoken words only (excluding parentheticals)
                      
                      return parts.map((part, partIdx) => {
                        // Check if this part is a parenthetical
                        if (part.startsWith('(') && part.endsWith(')')) {
                          // Render parenthetical as gray italic - not part of word count
                          return (
                            <span key={partIdx} className="text-text-muted/50 italic text-xs mx-1">
                              {part}
                            </span>
                          )
                        }
                        
                        // Regular spoken text - split into words and apply highlighting
                        return part.split(/(\s+)/).map((word, wordIdx) => {
                          const isSpace = !word.trim()
                          if (isSpace) return <span key={`${partIdx}-${wordIdx}`}>{word}</span>
                          
                          const currentWordIndex = spokenWordIndex
                          spokenWordIndex++ // Increment for next spoken word
                          
                          const isBuilt = currentWordIndex < builtWordCount
                          const isAnimated = currentWordIndex < whiteWordCount
                          
                          // Use word-by-word results when showing wrong status
                          const wordResult = wordResults[currentWordIndex]
                          const useWordResults = status === 'wrong' && wordResults.length > 0
                          
                          // Determine word color
                          let colorClass = 'text-text-muted' // Default gray
                          
                          if (useWordResults) {
                            // Show word-by-word results after evaluation
                            if (wordResult === 'correct') {
                              colorClass = 'text-success'
                            } else if (wordResult === 'wrong') {
                              colorClass = 'text-error underline decoration-error'
                            } else if (wordResult === 'missing') {
                              colorClass = 'text-warning/70 underline decoration-warning/50'
                            }
                          } else if (status === 'listening') {
                            // While listening: animate gray → white → green
                            if (currentWordIndex < matchedWordCount) {
                              colorClass = 'text-success'
                            } else if (hasError && currentWordIndex === matchedWordCount) {
                              colorClass = 'text-error underline decoration-error'
                            } else if (isAnimated) {
                              colorClass = 'text-text'
                            }
                          } else if (status === 'correct') {
                            colorClass = 'text-success'
                          } else if (isBuilt) {
                            colorClass = 'text-accent underline decoration-accent/50 decoration-2 underline-offset-2'
                          }
                          
                          return (
                            <span 
                              key={`${partIdx}-${wordIdx}`}
                              className={`${useWordResults ? '' : 'transition-colors duration-100'} ${colorClass}`}
                            >
                              {word}
                            </span>
                          )
                        })
                      })
                    })()}
                  </p>
                ) : (
                  (() => {
                    // Apply text visibility settings ONLY for user lines
                    if (!isUser) {
                      // AI/other character lines - show full content
                      return <p className="text-sm leading-relaxed text-text">{line.content}</p>
                    }
                    // User lines - apply visibility settings
                    
                    // Determine which visibility mode to use
                    const isCompleted = stats.completed.has(line.id)
                    let visibility = settings.useBeforeAfterVisibility
                      ? (isCompleted ? settings.visibilityAfterSpeaking : settings.visibilityBeforeSpeaking)
                      : settings.textVisibility
                    // Cold read: show full text briefly, then apply visibility
                    if (isCurrent && settings.coldReadTime > 0 && !coldReadExpired) {
                      visibility = 'full'
                    }
                    
                    const getVisibilityClass = () => {
                      if (visibility === 'blurred') return 'blur-[6px] hover:blur-none transition-all'
                      if (visibility === 'hidden') return 'opacity-0'
                      return ''
                    }
                    let displayText = visibility === 'first-letter'
                      ? transformText(line.content, 'first-letter')
                      : line.content
                    // Cue-only: show only first N words
                    if (settings.cueOnlyWords > 0 && visibility === 'full') {
                      const words = displayText.split(' ')
                      if (words.length > settings.cueOnlyWords) {
                        displayText = words.slice(0, settings.cueOnlyWords).join(' ') + ' ...'
                      }
                    }
                    return (
                      <p className={`text-sm leading-relaxed text-text ${getVisibilityClass()}`}>
                        {visibility === 'hidden' ? <span className="opacity-30">•••</span> : displayText}
                      </p>
                    )
                  })()
                )}
                {showNotes && line.notes && <p className="text-xs text-ai/70 mt-1.5 italic border-l-2 border-ai-border pl-2">{line.notes}</p>}
                {isCurrent && isUser && status === 'correct' && (
                  <div className="mt-1 flex gap-3 text-xs font-medium">
                    {settings.showAccuracyScore && lastLineAccuracy !== null && (
                      <span className="text-success">{lastLineAccuracy}%</span>
                    )}
                    {lastPickupTime !== null && (
                      <span className="text-ai">Pickup: {(lastPickupTime / 1000).toFixed(1)}s</span>
                    )}
                    {lastPacingDelta && (
                      <span className={Math.abs(lastPacingDelta.delta) <= 10 ? 'text-success' : Math.abs(lastPacingDelta.delta) <= 25 ? 'text-warning' : 'text-error'}>
                        {lastPacingDelta.delta > 0 ? '+' : ''}{lastPacingDelta.delta.toFixed(0)}% pace
                      </span>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )
        })}

        {/* Wrong answer feedback */}
        <AnimatePresence>
          {status === 'wrong' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <Card padding="p-4" className="bg-error-muted ring-1 ring-error-border">
                <div className="text-xs text-text-muted mb-1">You said:</div>
                <div className="text-sm text-text italic mb-2">"{transcript || '(nothing)'}"</div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs mb-1">
                  {settings.showAccuracyScore && lastLineAccuracy !== null && (
                    <span className="text-warning">Accuracy: {lastLineAccuracy}%</span>
                  )}
                  {lastPickupTime !== null && (
                    <span className="text-ai">Pickup: {(lastPickupTime / 1000).toFixed(1)}s</span>
                  )}
                  {lastPacingDelta && (
                    <span className={Math.abs(lastPacingDelta.delta) <= 10 ? 'text-success' : Math.abs(lastPacingDelta.delta) <= 25 ? 'text-warning' : 'text-error'}>
                      Pace: {lastPacingDelta.delta > 0 ? '+' : ''}{lastPacingDelta.delta.toFixed(0)}%
                    </span>
                  )}
                </div>
                {wrongWords.length > 0 && <div className="text-xs text-warning mb-1">Wrong: {wrongWords.join(', ')}</div>}
                {missingWords.length > 0 && <div className="text-xs text-error mb-2">Missing: {missingWords.join(', ')}</div>}
                <div className="flex gap-2">
                  <Button size="sm" onClick={retry} className="flex-1">Try Again</Button>
                  {hasRecording && (
                    <Button size="sm" variant="secondary" onClick={playLastRecording} className="flex-shrink-0">
                      {isPlayingRecording ? 'Stop' : 'Hear Myself'}
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" onClick={() => { setStatus('idle'); busyRef.current = false; next() }} className="flex-1">Skip</Button>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Listening feedback */}
        <AnimatePresence>
          {status === 'listening' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="px-4 py-3 rounded-lg bg-ai-muted border border-ai-border">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-ai animate-pulse" />
                  <span className="flex-1 text-sm text-ai truncate">{transcript || 'Listening...'}</span>
                  <div className="w-12 h-1.5 bg-black/20 rounded-full overflow-hidden">
                    <div className="h-full bg-ai transition-all" style={{ width: `${audioLevel}%` }} />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Resume Progress Modal - "Option B with a Twist" */}
        <AnimatePresence>
          {showResumeModal && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            >
              <Card padding="p-5" className="max-w-sm w-full bg-bg-surface border border-accent/30">
                <div className="text-center mb-4">
                  <div className="text-2xl mb-2">🎯</div>
                  <h3 className="text-lg font-semibold text-text">Resume Progress?</h3>
                  <p className="text-sm text-text-muted mt-1">
                    You've mastered {lastCheckpoint} of {totalSegmentsForLine} segments
                  </p>
                </div>
                
                <div className="space-y-2 mb-4">
                  {/* Progress bar */}
                  <div className="flex gap-0.5 mb-3">
                    {Array.from({ length: totalSegmentsForLine }).map((_, i) => (
                      <div 
                        key={i} 
                        className={`flex-1 h-2 rounded-full ${
                          i < lastCheckpoint ? 'bg-success' : 'bg-overlay-10'
                        }`} 
                      />
                    ))}
                  </div>
                  
                  {/* Checkpoint buttons */}
                  {savedCheckpoints.length > 0 && (
                    <div className="text-xs text-text-muted mb-2 text-center">
                      {savedCheckpoints.length} checkpoint{savedCheckpoints.length > 1 ? 's' : ''} saved
                    </div>
                  )}
                </div>
                
                <div className="space-y-2">
                  {/* Continue from last checkpoint (main action) */}
                  <Button 
                    onClick={() => resumeFromCheckpoint(lastCheckpoint)} 
                    className="w-full bg-accent hover:bg-accent/90"
                  >
                    Continue from Segment {lastCheckpoint + 1}
                  </Button>
                  
                  {/* Start from beginning */}
                  <Button 
                    onClick={startFresh} 
                    variant="secondary" 
                    className="w-full"
                  >
                    Start from Beginning
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="h-32" />
      </div>

      {/* Scene Transition Modal */}
      <AnimatePresence>
        {showSceneTransition && nextSceneData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
            onClick={() => { 
              if (countdownRef.current) clearInterval(countdownRef.current)
              setShowSceneTransition(false)
              setAutoAdvanceCountdown(null)
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-sm bg-bg-elevated rounded-xl border border-border overflow-hidden"
            >
              <div className="p-6 text-center">
                <div className="text-sm text-text-muted mb-2">Scene Complete</div>
                
                <button
                  onClick={() => {
                    if (countdownRef.current) clearInterval(countdownRef.current)
                    setShowSceneTransition(false)
                    goToNextScene()
                  }}
                  className="w-full py-4 px-4 bg-accent/10 hover:bg-accent/20 border border-accent/30 rounded-lg text-left transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <div className="text-xs text-text-muted mb-0.5">Continue to Scene {currentSceneIndex + 2}</div>
                      <div className="text-sm font-medium text-text">{getSceneSlug(nextSceneData)}</div>
                    </div>
                  </div>
                </button>
                
                {autoAdvanceCountdown !== null && (
                  <div className="mt-4 text-xs text-text-subtle">
                    Auto-continuing in {autoAdvanceCountdown}s...
                  </div>
                )}
                
                <button
                  onClick={() => {
                    if (countdownRef.current) clearInterval(countdownRef.current)
                    setShowSceneTransition(false)
                    setAutoAdvanceCountdown(null)
                  }}
                  className="mt-4 text-sm text-text-muted hover:text-text"
                >
                  Stay on this scene
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Gentle "waiting for you" nudge after 10s silence (practice mode) */}
      <AnimatePresence>
        {showWaitingNudge && status === 'listening' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="fixed bottom-36 left-1/2 -translate-x-1/2 z-[100]"
          >
            <div className="px-4 py-2 rounded-full bg-bg-surface/90 backdrop-blur border border-border text-text-muted text-xs font-medium flex items-center gap-2">
              <IconMic size={14} className="text-accent animate-pulse" />
              <span>Waiting for you... tap skip to move on</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* "Still there?" prompt after 3 timeouts */}
      <AnimatePresence>
        {showStillThere && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: 10 }}
            className="fixed bottom-36 left-1/2 -translate-x-1/2 z-[100]"
          >
            <button
              onClick={() => {
                setShowStillThere(false)
                setConsecutiveTimeouts(0)
                // Resume from current segment
                if (segments.length > 0) {
                  setStatus('segment')
                  const accumulatedText = segments.slice(0, currentSegmentIndex + 1).join(' ')
                  playSegmentLiveTTS(accumulatedText).then(() => {
                    startListeningForBuild(accumulatedText)
                  })
                }
              }}
              className="px-5 py-2.5 bg-accent rounded-full text-white font-medium shadow-xl flex items-center gap-2 hover:bg-accent/90 transition-colors"
            >
              <span>👋</span>
              <span>Still there? Tap to continue</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Play Button with integrated segment progress */}
      <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-2">
        {/* Error popup - shows what user got wrong */}
        <AnimatePresence>
          {errorPopup && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="px-3 py-1.5 rounded-full bg-error backdrop-blur text-white text-xs font-medium shadow-lg"
            >
              {errorPopup}
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Segment progress bar - only show in repeat mode with segments */}
        {learningMode === 'repeat' && segments.length > 0 && currentLine?.is_user_line && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-bg-surface/90 backdrop-blur border border-border">
            <span className="text-[10px] text-text-muted whitespace-nowrap">
              {currentSegmentIndex + 1}/{segments.length}
            </span>
            <div className="flex gap-0.5">
              {segments.map((_, i) => (
                <div 
                  key={i} 
                  className={`w-4 h-1 rounded-full transition-colors ${
                    i < buildProgress ? 'bg-success' : 
                    i === currentSegmentIndex ? 'bg-accent' : 
                    'bg-overlay-20'
                  }`} 
                />
              ))}
            </div>
            {checkpointCount > 0 && (
              <span className="text-[10px] text-success flex items-center gap-0.5">
                <IconCheck size={8} />{checkpointCount}
              </span>
            )}
          </div>
        )}
        
        {/* Play button with listening indicator */}
        <div className="relative">
          {/* Subtle glow when listening or waiting for manual start */}
          {status === 'listening' && (
            <div className="absolute -inset-1 rounded-full bg-ai/20 blur-sm animate-pulse" />
          )}
          {pendingListenRef.current && status === 'idle' && (
            <div className="absolute -inset-1 rounded-full bg-accent/20 blur-sm animate-pulse" />
          )}
          <button 
            onClick={handlePlayPause} 
            disabled={status === 'connecting'} 
            className={`relative w-12 h-12 rounded-full flex items-center justify-center text-white transition-all duration-200 ${
              status === 'listening' ? 'bg-gradient-to-br from-ai to-ai/80 shadow-lg shadow-ai/30' :
              (isPlaying || status === 'ai' || status === 'narrator' || status === 'segment') ? 'bg-gradient-to-br from-orange-500 to-orange-600 shadow-lg shadow-orange-500/20' :
              'bg-gradient-to-br from-accent to-accent/80 shadow-lg shadow-accent/20'
            }`}
          >
            {status === 'listening' ? (
              /* Animated waveform bars */
              <div className="flex items-center justify-center gap-0.5">
                <div className="w-0.5 h-3 bg-white rounded-full animate-[waveform_0.5s_ease-in-out_infinite]" style={{ animationDelay: '0ms' }} />
                <div className="w-0.5 h-4 bg-white rounded-full animate-[waveform_0.5s_ease-in-out_infinite]" style={{ animationDelay: '150ms' }} />
                <div className="w-0.5 h-2 bg-white rounded-full animate-[waveform_0.5s_ease-in-out_infinite]" style={{ animationDelay: '300ms' }} />
                <div className="w-0.5 h-5 bg-white rounded-full animate-[waveform_0.5s_ease-in-out_infinite]" style={{ animationDelay: '100ms' }} />
                <div className="w-0.5 h-3 bg-white rounded-full animate-[waveform_0.5s_ease-in-out_infinite]" style={{ animationDelay: '250ms' }} />
              </div>
            ) : status === 'connecting' ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (isPlaying || status === 'ai' || status === 'narrator' || status === 'segment') ? (
              <IconPause size={20} />
            ) : pendingListenRef.current ? (
              <IconMic size={20} />
            ) : (
              <IconPlay size={20} className="ml-0.5" />
            )}
          </button>
        </div>
      </div>

      {/* Skip controls */}
      <div className="fixed bottom-[88px] left-1/2 -translate-x-1/2 z-30 flex items-center gap-20">
        <button 
          onClick={() => { stopPlayback(); if (currentLineIndex > 0) setCurrentLineIndex(currentLineIndex - 1) }} 
          disabled={currentLineIndex === 0} 
          className="w-9 h-9 rounded-full bg-bg-surface/80 backdrop-blur flex items-center justify-center disabled:opacity-30 text-text-muted"
        >
          <IconSkipBack size={16} />
        </button>
        <button
          onClick={() => {
            // Always-available escape: skip to next line regardless of state
            if (listeningRef.current) {
              listeningRef.current = false
              setShowWaitingNudge(false)
              deepgram.pauseListening()
              if (silenceTimerRef.current) { clearInterval(silenceTimerRef.current); silenceTimerRef.current = null }
              if (commitTimerRef.current) { clearTimeout(commitTimerRef.current); commitTimerRef.current = null }
            }
            busyRef.current = false
            if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0 }
            setStatus('idle')
            next()
          }}
          className="w-9 h-9 rounded-full bg-bg-surface/80 backdrop-blur flex items-center justify-center text-text-muted active:scale-90 transition-transform"
        >
          <IconSkipForward size={16} />
        </button>
      </div>

      {/* Edit Modal */}
      <EditModal 
        isOpen={editModal !== null} 
        onClose={() => setEditModal(null)} 
        type={editModal?.type || 'line'} 
        data={editModal?.data} 
        mode={editModal?.mode || 'edit'} 
        onSave={async (data) => { 
          if (!editModal) return
          if (editModal.type === 'line') { 
            await updateLine(data.id, data)
            useStore.getState().setLines(lines.map(l => l.id === data.id ? { ...l, ...data } : l)) 
          } else if (editModal.type === 'character') { 
            await updateCharacter(data.id, data)
            useStore.getState().setCharacters(characters.map(c => c.id === data.id ? { ...c, ...data } : c)) 
          } else if (editModal.type === 'script') { 
            await updateScript(data.id, data)
            useStore.getState().setCurrentScript({ ...currentScript!, ...data }) 
          } 
        }} 
        onDelete={async (id) => { 
          const ok = await deleteLine(id)
          if (ok) { 
            useStore.getState().setLines(lines.filter(l => l.id !== id))
            if (currentLineIndex >= sceneLines.length - 1) setCurrentLineIndex(Math.max(0, currentLineIndex - 1)) 
          } 
        }} 
        onAddLine={async (afterId, data) => { 
          const newLine = await addLine({ ...data, sort_order: (lines.find(l => l.id === afterId)?.sort_order || 0) + 1 })
          if (newLine) useStore.getState().setLines([...lines, newLine].sort((a, b) => a.sort_order - b.sort_order)) 
        }} 
      />
    </div>
  )
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between">
      <span className="text-xs text-text-muted">{label}</span>
      <button onClick={() => onChange(!value)} className={`w-9 h-5 rounded-full relative transition-colors ${value ? 'bg-accent' : 'bg-bg-surface'}`}>
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${value ? 'left-4' : 'left-0.5'}`} />
      </button>
    </label>
  )
}

function SettingsSection({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-bg-elevated hover:bg-bg-surface-hover transition-colors"
      >
        <span className="text-sm font-medium text-text">{title}</span>
        <svg
          className={`w-4 h-4 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-4 py-4 space-y-4 bg-bg">
          {children}
        </div>
      )}
    </div>
  )
}

function SettingsToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-sm text-text">{label}</span>
      <button 
        onClick={() => onChange(!value)} 
        className={`relative w-12 h-7 rounded-full transition-colors ${value ? 'bg-accent' : 'bg-bg-surface'}`}
      >
        <div className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  )
}
