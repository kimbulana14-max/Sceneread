'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, Button, Badge, Toggle } from './ui'
import { useStore, useSettings, useRecordingSettings, RecordingSettings, SlateInfo, TeleprompterSettings } from '@/store'
import { useOpenAIRealtime } from '@/hooks/useOpenAIRealtime'
import { supabase, Line, Script } from '@/lib/supabase'
import { getLockedWordMatch, createFreshLockedState, LockedWordState, checkAccuracy } from '@/lib/accuracy'
import { triggerAchievementCheck } from '@/hooks/useAchievements'

// ============================================================================
// TYPES
// ============================================================================

// Scene playback state machine
type SceneState = 'idle' | 'user-speaking' | 'evaluating' | 'partner-speaking' | 'transitioning'

interface Take {
  id: string
  number: number
  blob: Blob
  url: string // Blob URL for immediate playback
  remoteUrl?: string // Supabase URL after upload (better for iOS)
  mimeType: string // Track the actual mime type used
  duration: number
  timestamp: Date
  starred: boolean
  notes: string
  thumbnail?: string
  uploaded?: boolean
  supabaseId?: string
  isPortrait?: boolean // Track if video is portrait (9:16) or landscape (16:9)
}

interface SavedRecording {
  id: string
  title: string
  video_url: string
  thumbnail_url: string | null
  duration_seconds: number
  take_number: number
  is_favorite: boolean
  notes: string | null
  created_at: string
  script_id: string | null
  script?: { title: string; user_role: string } | null
}

type ViewMode = 'select' | 'record' | 'review' | 'settings' | 'recordings'

// ============================================================================
// ICONS (Compact)
// ============================================================================

const Icons = {
  Camera: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>,
  Mic: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>,
  Stop: () => <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>,
  Play: ({ size = 20 }: { size?: number }) => <svg width={size} height={size} fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>,
  Pause: () => <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>,
  Star: ({ filled, size = 20 }: { filled?: boolean, size?: number }) => <svg width={size} height={size} fill={filled ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>,
  Settings: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  Trash: ({ size = 20 }: { size?: number }) => <svg width={size} height={size} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
  Download: ({ size = 20 }: { size?: number }) => <svg width={size} height={size} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>,
  Flip: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>,
  Teleprompter: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  Grid: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>,
  X: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>,
  ChevronLeft: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>,
  ChevronRight: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>,
  Upload: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>,
  Check: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>,
  GridLines: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 8h16M4 16h16M8 4v16M16 4v16" /></svg>,
  Eyeline: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>,
  Script: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  Video: () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>,
  Folder: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>,
  Clock: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  MoreVertical: ({ size = 20 }: { size?: number }) => <svg width={size} height={size} fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="19" r="1" fill="currentColor" /></svg>,
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function RecordScreen() {
  const { scripts, setScripts, currentScript, setCurrentScript, scenes, lines, setLines, user } = useStore()
  
  // View & UI state
  const [viewMode, setViewMode] = useState<ViewMode>('select')
  const [showControls, setShowControls] = useState(true)
  const [selectedScriptForRecording, setSelectedScriptForRecording] = useState<Script | null>(null)
  const [quickRecordTitle, setQuickRecordTitle] = useState('')
  const [showScriptPicker, setShowScriptPicker] = useState(false)
  const [scriptSearchQuery, setScriptSearchQuery] = useState('')
  
  // Saved recordings from database
  const [savedRecordings, setSavedRecordings] = useState<SavedRecording[]>([])
  const [loadingRecordings, setLoadingRecordings] = useState(true) // Start true to show loading state
  const [uploadingTake, setUploadingTake] = useState<string | null>(null) // Track which take is uploading
  const [activeRecordingMenu, setActiveRecordingMenu] = useState<string | null>(null) // For triple dot menu
  const [selectedRecordingForPreview, setSelectedRecordingForPreview] = useState<SavedRecording | null>(null)
  
  // Orientation detection
  const [isLandscape, setIsLandscape] = useState(false)
  
  // Camera
  const [cameras, setCameras] = useState<{deviceId: string, label: string}[]>([])
  const [selectedCamera, setSelectedCamera] = useState('')
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [videoMounted, setVideoMounted] = useState(false)
  const [permissionState, setPermissionState] = useState<'unknown' | 'prompt' | 'granted' | 'denied'>('unknown')
  
  // Recording
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [audioLevel, setAudioLevel] = useState(0)
  const [simpleRecordMode, setSimpleRecordMode] = useState(true) // TEST: Direct recording without canvas
  
  // Takes (current session)
  const [takes, setTakes] = useState<Take[]>([])
  const [selectedTake, setSelectedTake] = useState<Take | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [uploading, setUploading] = useState<string | null>(null)
  const [takePreviewModal, setTakePreviewModal] = useState<Take | null>(null)
  const [editingTakeNotes, setEditingTakeNotes] = useState<string | null>(null)
  const [tempNotes, setTempNotes] = useState('')
  
  // Settings from store (persisted to Supabase)
  const { 
    recordingSettings, 
    slateInfo, 
    teleprompterSettings,
    updateRecordingSettings,
    updateSlateInfo,
    updateTeleprompterSettings
  } = useRecordingSettings()
  
  // Local setters that also update the store
  const setRecordingSettings = (updater: React.SetStateAction<typeof recordingSettings>) => {
    const newValue = typeof updater === 'function' ? updater(recordingSettings) : updater
    updateRecordingSettings(newValue)
  }
  
  const setSlateInfo = (updater: React.SetStateAction<typeof slateInfo>) => {
    const newValue = typeof updater === 'function' ? updater(slateInfo) : updater
    updateSlateInfo(newValue)
  }
  
  const setTeleprompterSettings = (updater: React.SetStateAction<typeof teleprompterSettings>) => {
    const newValue = typeof updater === 'function' ? updater(teleprompterSettings) : updater
    updateTeleprompterSettings(newValue)
  }
  
  // Initialize slate with user info if not already set
  useEffect(() => {
    if (user && !slateInfo.actorName) {
      updateSlateInfo({
        actorName: user.full_name || '',
        email: user.email || '',
      })
    }
  }, [user])
  
  // Teleprompter - REMOVED currentLineIndex, using only sceneLineIndex now
  const [sttTranscript, setSttTranscript] = useState('')
  
  // Scene playback - STATE MACHINE
  const [sceneState, setSceneState] = useState<SceneState>('idle')
  const [sceneLineIndex, setSceneLineIndex] = useState(0)
  
  // Word-by-word tracking for STT mode
  const [matchedWordCount, setMatchedWordCount] = useState(0)
  const [hasWordError, setHasWordError] = useState(false)
  const [committedTranscript, setCommittedTranscript] = useState('')
  const committedTranscriptRef = useRef('')
  const expectedLineRef = useRef('')
  const lockedStateRef = useRef<LockedWordState>(createFreshLockedState()) // Word locking state
  
  // Teleprompter drag state
  const [isDraggingTeleprompter, setIsDraggingTeleprompter] = useState(false)
  const [isResizingTeleprompter, setIsResizingTeleprompter] = useState(false)
  const dragStartRef = useRef({ x: 0, y: 0, startX: 0, startY: 0 })
  const resizeStartRef = useRef({ width: 0, height: 0, startX: 0, startY: 0 })
  
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const canvasStreamRef = useRef<MediaStream | null>(null)
  const compositeAnimationRef = useRef<number | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const recordingStartTimeRef = useRef<number>(0)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const teleprompterRef = useRef<HTMLDivElement>(null)
  const reviewVideoRef = useRef<HTMLVideoElement>(null)
  const readerAudioRef = useRef<HTMLAudioElement | null>(null)
  const saveSettingsTimeout = useRef<NodeJS.Timeout | null>(null)
  const stopSTTRef = useRef<() => void>(() => {})
  const sceneStateRef = useRef<SceneState>('idle')
  
  // Keep ref in sync with state for callbacks
  useEffect(() => {
    sceneStateRef.current = sceneState
  }, [sceneState])
  
  // Get lines for current script (if any)
  const scriptLines = selectedScriptForRecording 
    ? lines.filter(l => l.script_id === selectedScriptForRecording.id)
    : []
  
  // Video ref callback
  const videoRefCallback = useCallback((node: HTMLVideoElement | null) => {
    if (node) {
      (videoRef as React.MutableRefObject<HTMLVideoElement | null>).current = node
      setVideoMounted(true)
    }
  }, [])

  // ============================================================================
  // ORIENTATION DETECTION
  // ============================================================================
  
  useEffect(() => {
    const checkOrientation = () => {
      setIsLandscape(window.innerWidth > window.innerHeight)
    }
    
    checkOrientation()
    window.addEventListener('resize', checkOrientation)
    window.addEventListener('orientationchange', checkOrientation)
    
    return () => {
      window.removeEventListener('resize', checkOrientation)
      window.removeEventListener('orientationchange', checkOrientation)
    }
  }, [])

  // ============================================================================
  // OPENAI REALTIME STT - With word-by-word tracking and filler word support
  // ============================================================================
  
  // Refs for STT callbacks (avoid stale closures)
  const scriptLinesRef = useRef<Line[]>([])
  const sceneLineIndexRef = useRef(0)
  const isRecordingRef = useRef(false)
  const advanceLineRef = useRef<() => void>(() => {})
  
  // Keep refs in sync
  useEffect(() => { scriptLinesRef.current = scriptLines }, [scriptLines])
  useEffect(() => { sceneLineIndexRef.current = sceneLineIndex }, [sceneLineIndex])
  useEffect(() => { isRecordingRef.current = isRecording }, [isRecording])
  
  // Simple advance function
  const advanceToNextLine = useCallback(() => {
    const nextIndex = sceneLineIndexRef.current + 1
    if (nextIndex >= scriptLinesRef.current.length) {
      console.log('[Teleprompter] Reached end of script')
      setSceneState('idle') // Mark as complete
      return false // Signal we didn't advance
    }
    console.log('[Teleprompter] Advancing to line', nextIndex)
    setSceneLineIndex(nextIndex)
    
    // Reset word tracking
    setMatchedWordCount(0)
    setHasWordError(false)
    setSttTranscript('')
    setCommittedTranscript('')
    committedTranscriptRef.current = ''
    lockedStateRef.current = createFreshLockedState() // Reset word locking
    return true // Signal we advanced
  }, [])
  
  // Keep advance ref updated
  useEffect(() => { advanceLineRef.current = advanceToNextLine }, [advanceToNextLine])
  
  const { isListening: sttListening, startSession: startSTT, stopSession: stopSTT } = useOpenAIRealtime({
    onPartialTranscript: (data) => {
      if (!isRecordingRef.current) return
      if (!data.text.trim()) return
      
      // Combine committed + partial for display
      const fullText = committedTranscriptRef.current
        ? committedTranscriptRef.current + ' ' + data.text
        : data.text
      
      setSttTranscript(fullText)
      
      // Real-time word matching with locking against current line
      const currentLine = scriptLinesRef.current[sceneLineIndexRef.current]
      if (currentLine?.is_user_line) {
        const newState = getLockedWordMatch(currentLine.content, fullText, lockedStateRef.current)
        lockedStateRef.current = newState
        setMatchedWordCount(newState.lockedCount)
        setHasWordError(newState.hasError)
      }
    },
    onCommittedTranscript: (data) => {
      if (!isRecordingRef.current) return
      if (!data.text.trim()) return
      
      // Accumulate committed transcripts
      const newCommitted = committedTranscriptRef.current
        ? committedTranscriptRef.current + ' ' + data.text
        : data.text
      
      committedTranscriptRef.current = newCommitted
      setCommittedTranscript(newCommitted)
      setSttTranscript(newCommitted)
      
      // Update word matching with locking
      const currentLine = scriptLinesRef.current[sceneLineIndexRef.current]
      if (currentLine?.is_user_line) {
        const newState = getLockedWordMatch(currentLine.content, newCommitted, lockedStateRef.current)
        lockedStateRef.current = newState
        setMatchedWordCount(newState.lockedCount)
        setHasWordError(newState.hasError)
      }
    },
    onError: (err) => console.error('[STT]', err),
  })
  
  // Keep ref updated for cleanup
  useEffect(() => {
    stopSTTRef.current = stopSTT
  }, [stopSTT])

  // ============================================================================
  // LOAD SAVED RECORDINGS
  // ============================================================================
  
  const loadSavedRecordings = useCallback(async () => {
    if (!user?.id) {
      console.log('[Recordings] No user, skipping load')
      return
    }
    
    console.log('[Recordings] Loading for user:', user.id)
    setLoadingRecordings(true)
    try {
      const { data, error } = await supabase
        .from('recordings')
        .select(`
          id, title, video_url, thumbnail_url, duration_seconds, 
          take_number, is_favorite, notes, created_at, script_id,
          scripts:script_id (title, user_role)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50)
      
      if (error) {
        console.error('[Recordings] Query error:', error)
        throw error
      }
      
      console.log('[Recordings] Loaded:', data?.length || 0, 'recordings')
      setSavedRecordings((data || []).map((r: any) => ({
        ...r,
        script: r.scripts as any
      })))
    } catch (err) {
      console.error('[Recordings] Load failed:', err)
    } finally {
      setLoadingRecordings(false)
    }
  }, [user?.id])
  
  // Load recordings when entering selection screen OR when user becomes available
  useEffect(() => {
    if (user?.id && viewMode === 'select') {
      loadSavedRecordings()
    }
  }, [user?.id, viewMode, loadSavedRecordings])
  
  // Close recording menu when clicking outside
  useEffect(() => {
    if (!activeRecordingMenu) return
    
    const handleClickOutside = () => setActiveRecordingMenu(null)
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [activeRecordingMenu])
  
  // Reload takes when entering record mode with a script (handles "come back" scenario)
  useEffect(() => {
    const loadTakesForScript = async () => {
      if (!user?.id || !selectedScriptForRecording || viewMode !== 'record') return
      
      try {
        const { data: existingRecordings } = await supabase
          .from('recordings')
          .select('*')
          .eq('user_id', user.id)
          .eq('script_id', selectedScriptForRecording.id)
          .order('created_at', { ascending: false })
        
        if (existingRecordings && existingRecordings.length > 0) {
          console.log('[Recording] Reloaded', existingRecordings.length, 'takes for script')
          const existingTakes: Take[] = existingRecordings.map((r: any, idx: number) => ({
            id: r.id,
            number: r.take_number || (existingRecordings.length - idx),
            blob: new Blob(),
            url: r.video_url, // Use remote URL as primary
            remoteUrl: r.video_url, // Also set as remote for iOS compatibility
            mimeType: r.video_url?.includes('.mp4') ? 'video/mp4' : 'video/webm',
            duration: r.duration_seconds || 0,
            timestamp: new Date(r.created_at),
            starred: r.is_favorite || false,
            notes: r.notes || '',
            thumbnail: r.thumbnail_url,
            uploaded: true,
            supabaseId: r.id,
          }))
          setTakes(existingTakes)
          setSlateInfo(prev => ({ ...prev, takeNumber: existingTakes.length + 1 }))
        }
      } catch (err) {
        console.error('[Recording] Failed to reload takes:', err)
      }
    }
    
    loadTakesForScript()
  }, [viewMode, selectedScriptForRecording?.id, user?.id])
  
  // Also load scripts when user is available
  useEffect(() => {
    if (user?.id && scripts.length === 0) {
      fetchUserScripts()
    }
  }, [user?.id, scripts.length])
  
  // Fetch scripts for the script picker
  const fetchUserScripts = async () => {
    if (!user?.id) return
    try {
      const { data, error } = await supabase
        .from('scripts')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_archived', false)
        .order('created_at', { ascending: false })
      
      if (!error && data) {
        setScripts(data)
      }
    } catch (err) {
      console.error('[Scripts] Fetch failed:', err)
    }
  }

  // ============================================================================
  // LOAD SETTINGS FROM SUPABASE
  // ============================================================================
  
  useEffect(() => {
    if (!user?.id) return
    
    const loadSettings = async () => {
      try {
        const { data } = await supabase
          .from('recording_settings')
          .select('*')
          .eq('user_id', user.id)
          .single()
        
        if (data) {
          setRecordingSettings(prev => ({
            ...prev,
            resolution: data.resolution || prev.resolution,
            aspectRatio: data.aspect_ratio || prev.aspectRatio,
            frameRate: data.frame_rate || prev.frameRate,
            mirror: data.mirror_preview ?? prev.mirror,
            countdown: data.countdown_seconds ?? prev.countdown,
          }))
          setTeleprompterSettings(prev => ({
            ...prev,
            mode: data.teleprompter_enabled ? 'timed' : 'off',
            speed: (data.teleprompter_speed || 1) * 50,
            fontSize: data.teleprompter_font_size || prev.fontSize,
            position: data.teleprompter_position || prev.position,
            opacity: (data.teleprompter_opacity || 0.85) * 100,
          }))
          setSlateInfo(prev => ({
            ...prev,
            actorName: data.slate_name || user?.full_name || '',
            agentName: data.slate_agent_name || '',
          }))
        }
      } catch (err) {
        console.log('[Settings] No saved settings found')
      }
    }
    loadSettings()
  }, [user?.id])


  // ============================================================================
  // SAVE SETTINGS TO SUPABASE (debounced)
  // ============================================================================
  
  const saveSettings = useCallback(() => {
    if (!user?.id) return
    
    if (saveSettingsTimeout.current) clearTimeout(saveSettingsTimeout.current)
    saveSettingsTimeout.current = setTimeout(async () => {
      try {
        await supabase.from('recording_settings').upsert({
          user_id: user.id,
          resolution: recordingSettings.resolution,
          aspect_ratio: recordingSettings.aspectRatio,
          frame_rate: recordingSettings.frameRate,
          mirror_preview: recordingSettings.mirror,
          countdown_seconds: recordingSettings.countdown,
          teleprompter_enabled: teleprompterSettings.mode !== 'off',
          teleprompter_speed: teleprompterSettings.speed / 50,
          teleprompter_font_size: teleprompterSettings.fontSize,
          teleprompter_position: teleprompterSettings.position,
          teleprompter_opacity: teleprompterSettings.opacity / 100,
          slate_name: slateInfo.actorName,
          slate_agent_name: slateInfo.agentName,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
      } catch (err) {
        console.error('[Settings] Save failed:', err)
      }
    }, 1000)
  }, [user?.id, recordingSettings, teleprompterSettings, slateInfo])
  
  useEffect(() => { saveSettings() }, [recordingSettings, teleprompterSettings, slateInfo.actorName, slateInfo.agentName])

  // ============================================================================
  // CAMERA
  // ============================================================================
  
  // Check permission state when entering record view
  useEffect(() => {
    if (viewMode === 'select') return
    
    const checkPermissionState = async () => {
      try {
        console.log('[Camera] Checking permission state for viewMode:', viewMode)
        
        // First, try to enumerate devices - this works if permission was previously granted
        try {
          const devices = await navigator.mediaDevices.enumerateDevices()
          const videoDevices = devices.filter(d => d.kind === 'videoinput')
          
          // If we can see device labels, permission was granted
          if (videoDevices.length > 0 && videoDevices[0].label) {
            console.log('[Camera] Permission already granted (can see device labels)')
            setPermissionState('granted')
            const mappedDevices = videoDevices.map(d => ({ 
              deviceId: d.deviceId, 
              label: d.label || `Camera ${d.deviceId.slice(0, 4)}` 
            }))
            setCameras(mappedDevices)
            if (!selectedCamera && mappedDevices.length > 0) {
              setSelectedCamera(mappedDevices[0].deviceId)
            }
            return
          }
        } catch (e) {
          console.log('[Camera] enumerateDevices failed:', e)
        }
        
        // Try permissions.query if available
        if (navigator.permissions && navigator.permissions.query) {
          try {
            const cameraPermission = await navigator.permissions.query({ name: 'camera' as PermissionName })
            const micPermission = await navigator.permissions.query({ name: 'microphone' as PermissionName })
            
            console.log('[Camera] Permission state - camera:', cameraPermission.state, 'mic:', micPermission.state)
            
            if (cameraPermission.state === 'granted' && micPermission.state === 'granted') {
              setPermissionState('granted')
              // Enumerate devices now
              const devices = await navigator.mediaDevices.enumerateDevices()
              const videoDevices = devices
                .filter(d => d.kind === 'videoinput')
                .map(d => ({ deviceId: d.deviceId, label: d.label || `Camera ${d.deviceId.slice(0, 4)}` }))
              console.log('[Camera] Found devices:', videoDevices)
              setCameras(videoDevices)
              if (videoDevices.length > 0 && !selectedCamera) {
                setSelectedCamera(videoDevices[0].deviceId)
              }
              return
            } else if (cameraPermission.state === 'denied' || micPermission.state === 'denied') {
              setPermissionState('denied')
              setCameraError('Camera or microphone access was previously denied. Please enable in your browser settings.')
              return
            }
          } catch (e) {
            console.log('[Camera] permissions.query not supported:', e)
          }
        }
        
        // Permission state is 'prompt' or unknown - need user gesture to request
        console.log('[Camera] Need user gesture to request permission')
        setPermissionState('prompt')
        setCameraError('tap_to_enable')
        
      } catch (err) {
        console.error('[Camera] Permission check error:', err)
        setPermissionState('prompt')
        setCameraError('tap_to_enable')
      }
    }
    
    checkPermissionState()
  }, [viewMode])

  // Function to request permission - MUST be called from user gesture (button click)
  const requestCameraPermission = async () => {
    try {
      console.log('[Camera] Requesting HIGH QUALITY permission from user gesture...')
      setCameraError(null)
      
      // Request with HIGH QUALITY constraints to get proper permission
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
          facingMode: 'user'
        }, 
        audio: {
          sampleRate: { ideal: 48000 },
          channelCount: { ideal: 2 }
        }
      })
      
      // Log what we actually got
      const videoTrack = stream.getVideoTracks()[0]
      const audioTrack = stream.getAudioTracks()[0]
      if (videoTrack) {
        console.log('[Camera] Permission granted - Video:', videoTrack.getSettings())
      }
      if (audioTrack) {
        console.log('[Camera] Permission granted - Audio:', audioTrack.getSettings())
      }
      
      setPermissionState('granted')
      stream.getTracks().forEach(t => t.stop())
      
      // Enumerate devices now that we have permission
      const devices = await navigator.mediaDevices.enumerateDevices()
      const videoDevices = devices
        .filter(d => d.kind === 'videoinput')
        .map(d => ({ deviceId: d.deviceId, label: d.label || `Camera ${d.deviceId.slice(0, 4)}` }))
      console.log('[Camera] Found devices:', videoDevices)
      setCameras(videoDevices)
      if (videoDevices.length > 0) {
        setSelectedCamera(videoDevices[0].deviceId)
      }
    } catch (err: any) {
      console.error('[Camera] Permission request failed:', err)
      
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPermissionState('denied')
        setCameraError('Camera access denied. Please allow camera and microphone in your browser settings, then tap "Try Again".')
      } else if (err.name === 'NotFoundError') {
        setCameraError('No camera found. Please connect a camera and try again.')
      } else if (err.name === 'OverconstrainedError') {
        // If high quality fails, try basic
        console.log('[Camera] High quality failed, trying basic...')
        try {
          const basicStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
          setPermissionState('granted')
          basicStream.getTracks().forEach(t => t.stop())
          const devices = await navigator.mediaDevices.enumerateDevices()
          const videoDevices = devices
            .filter(d => d.kind === 'videoinput')
            .map(d => ({ deviceId: d.deviceId, label: d.label || `Camera ${d.deviceId.slice(0, 4)}` }))
          setCameras(videoDevices)
          if (videoDevices.length > 0) {
            setSelectedCamera(videoDevices[0].deviceId)
          }
        } catch (basicErr: any) {
          setCameraError(`Camera error: ${basicErr.message || 'Unknown error'}`)
        }
      } else {
        setCameraError(`Camera error: ${err.message || 'Unknown error'}`)
      }
    }
  }

  useEffect(() => {
    // Init camera for record view and its overlay panels (settings, slate, review, recordings)
    const needsCamera = viewMode !== 'select'
    // Don't try to init camera until permission is granted and we have a device selected
    if (!selectedCamera || !videoMounted || !needsCamera || permissionState !== 'granted') {
      console.log('[Camera] Skipping init - selectedCamera:', !!selectedCamera, 'videoMounted:', videoMounted, 'needsCamera:', needsCamera, 'permission:', permissionState)
      return
    }
    
    const initCamera = async () => {
      try {
        console.log('[Camera] Initializing camera:', selectedCamera)
        
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop())
        }
        
        // For mobile, cameras always output landscape regardless of phone orientation
        // We request the highest quality we can get and handle cropping in the UI/recording
        const isVertical = recordingSettings.aspectRatio === '9:16'
        
        // On mobile, always request landscape dimensions from the camera
        // The vertical crop happens in the canvas during recording
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
        
        // Request MAXIMUM quality - Android front cameras typically support up to 1080p
        // We'll request 1920x1080 and let the browser give us the best it can
        const requestWidth = 1920
        const requestHeight = 1080
        
        console.log('[Camera] Requesting HIGH QUALITY stream:', { 
          requestWidth, 
          requestHeight, 
          isVertical,
          isMobile,
          frameRate: recordingSettings.frameRate,
          deviceId: selectedCamera
        })
        
        // Build video constraints with EXPLICIT high quality requirements
        const videoConstraints: MediaTrackConstraints = {
          width: { ideal: requestWidth, min: 1280 }, 
          height: { ideal: requestHeight, min: 720 }, 
          frameRate: { ideal: recordingSettings.frameRate || 30, min: 24 },
          facingMode: 'user'
        }
        
        // Use deviceId if we have one
        if (selectedCamera) {
          videoConstraints.deviceId = { exact: selectedCamera }
          delete videoConstraints.facingMode // Can't use both
        }
        
        // Audio constraints - HIGH QUALITY for recording
        const audioConstraints: MediaTrackConstraints = {
          echoCancellation: false, // Disable for better quality recording
          noiseSuppression: false, // Disable for natural sound
          autoGainControl: false,  // Disable for consistent levels
          sampleRate: { ideal: 48000 }, // CD quality
          channelCount: { ideal: 2 }    // Stereo if available
        }
        
        console.log('[Camera] Video constraints:', videoConstraints)
        console.log('[Camera] Audio constraints:', audioConstraints)
        
        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: audioConstraints
        })
        
        // Log actual track settings
        const videoTrack = stream.getVideoTracks()[0]
        const audioTrack = stream.getAudioTracks()[0]
        if (videoTrack) {
          const settings = videoTrack.getSettings()
          console.log('[Camera] Video track settings:', settings)
        }
        if (audioTrack) {
          const settings = audioTrack.getSettings()
          console.log('[Camera] Audio track settings:', settings)
        }
        
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().then(() => {
              setCameraReady(true)
              setCameraError(null)
            })
          }
        }
        
        // Audio analyzer
        const audioContext = new AudioContext()
        const analyser = audioContext.createAnalyser()
        const source = audioContext.createMediaStreamSource(stream)
        source.connect(analyser)
        analyser.fftSize = 256
        audioContextRef.current = audioContext
        analyserRef.current = analyser
        
        // Throttle audio level updates to ~15fps for better performance
        let lastUpdate = 0
        const updateLevel = () => {
          if (!analyserRef.current) return
          const now = Date.now()
          if (now - lastUpdate > 66) { // ~15fps
            const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
            analyserRef.current.getByteFrequencyData(dataArray)
            const avg = dataArray.reduce((a, b) => a + b) / dataArray.length
            setAudioLevel(avg / 128)
            lastUpdate = now
          }
          requestAnimationFrame(updateLevel)
        }
        updateLevel()
        
      } catch (err) {
        console.error('[Camera]', err)
        setCameraError('Camera initialization failed')
        setCameraReady(false)
      }
    }
    
    initCamera()
    return () => { streamRef.current?.getTracks().forEach(t => t.stop()) }
  }, [selectedCamera, videoMounted, viewMode, permissionState, recordingSettings.aspectRatio, recordingSettings.frameRate])

  // Cleanup camera and STT when leaving to selection screen (not for overlays like settings/slate)
  useEffect(() => {
    if (viewMode === 'select') {
      streamRef.current?.getTracks().forEach(t => t.stop())
      setCameraReady(false)
      setVideoMounted(false)
      // Always stop STT when leaving record view using ref to avoid stale closure
      console.log('[Cleanup] Leaving to select screen, stopping STT')
      stopSTTRef.current()
    }
  }, [viewMode])

  // ============================================================================
  // RECORDING
  // ============================================================================
  
  const startRecording = useCallback(async () => {
    if (!streamRef.current || isRecording) return
    
    // Step 1: Countdown (if enabled)
    if (recordingSettings.countdown > 0 && countdown === null) {
      setCountdown(recordingSettings.countdown)
      return
    }
    
    // Step 2: Actually start recording (slate is handled inside via canvas compositing)
    actuallyStartRecording()
  }, [isRecording, countdown, recordingSettings])
  
  // SIMPLE DIRECT RECORDING - No canvas, no compositing, just record the stream directly
  const simpleStartRecording = useCallback(async () => {
    if (!streamRef.current) {
      console.error('[SimpleRecord] No stream available')
      return
    }
    
    try {
      console.log('[SimpleRecord] Starting DIRECT recording (no canvas)')
      chunksRef.current = []
      recordingStartTimeRef.current = Date.now()
      
      // Record the camera stream DIRECTLY - no canvas, no processing
      const stream = streamRef.current
      
      // Log stream info
      const videoTrack = stream.getVideoTracks()[0]
      const audioTrack = stream.getAudioTracks()[0]
      console.log('[SimpleRecord] Video track:', videoTrack?.getSettings())
      console.log('[SimpleRecord] Audio track:', audioTrack?.getSettings())
      
      // Try different mime types - prefer VP8 for better compatibility
      let mimeType = ''
      const candidates = [
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=vp8',
        'video/webm',
        ''
      ]
      
      for (const candidate of candidates) {
        if (!candidate || MediaRecorder.isTypeSupported(candidate)) {
          mimeType = candidate
          break
        }
      }
      
      console.log('[SimpleRecord] Using mimeType:', mimeType || 'browser default')
      
      // LOWER bitrate for smoother encoding on mobile
      // Request keyframes more frequently for smoother playback
      const options: MediaRecorderOptions = { 
        videoBitsPerSecond: 1000000,  // 1 Mbps (lower = easier to encode)
        audioBitsPerSecond: 128000,   // 128 kbps audio
      }
      if (mimeType) options.mimeType = mimeType
      
      const mediaRecorder = new MediaRecorder(stream, options)
      const actualMimeType = mediaRecorder.mimeType
      console.log('[SimpleRecord] Actual mimeType:', actualMimeType)
      console.log('[SimpleRecord] videoBitsPerSecond:', options.videoBitsPerSecond)
      
      mediaRecorder.ondataavailable = (e) => {
        console.log('[SimpleRecord] Data chunk:', e.data.size, 'bytes')
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      
      mediaRecorder.onerror = (e) => {
        console.error('[SimpleRecord] MediaRecorder error:', e)
      }
      
      mediaRecorder.onstop = async () => {
        console.log('[SimpleRecord] Stopped, total chunks:', chunksRef.current.length)
        const totalSize = chunksRef.current.reduce((sum, chunk) => sum + chunk.size, 0)
        console.log('[SimpleRecord] Total size:', totalSize, 'bytes')
        
        const stopTime = Date.now()
        const duration = Math.round((stopTime - recordingStartTimeRef.current) / 1000)
        
        const blobMimeType = actualMimeType || 'video/webm'
        const blob = new Blob(chunksRef.current, { type: blobMimeType })
        console.log('[SimpleRecord] Final blob:', blob.size, 'bytes, type:', blob.type)
        
        const url = URL.createObjectURL(blob)
        console.log('[SimpleRecord] Blob URL created')
        
        // Test: Can we create a video element and play this?
        const testVideo = document.createElement('video')
        testVideo.src = url
        testVideo.onloadedmetadata = () => {
          console.log('[SimpleRecord] TEST: Video duration:', testVideo.duration, 'seconds')
          console.log('[SimpleRecord] TEST: Video dimensions:', testVideo.videoWidth, 'x', testVideo.videoHeight)
        }
        testVideo.onerror = () => {
          console.error('[SimpleRecord] TEST: Video element cannot load blob')
        }
        
        const thumbnail = await generateThumbnail(blob)
        
        const newTake: Take = {
          id: `take-${Date.now()}`,
          number: takes.length + 1,
          blob,
          url,
          mimeType: blobMimeType,
          duration,
          timestamp: new Date(),
          starred: false,
          notes: '',
          thumbnail,
          isPortrait: false, // Direct recording is whatever camera outputs
        }
        
        console.log('[SimpleRecord] Take created, duration:', duration, 'seconds')
        
        // Don't auto-upload for testing - just add locally
        setTakes(prev => [...prev, newTake])
        setRecordingTime(0)
      }
      
      mediaRecorderRef.current = mediaRecorder
      
      // Start with smaller timeslice (100ms) for more frequent data collection
      // This can help with smoother playback
      mediaRecorder.start(100)
      
      console.log('[SimpleRecord] Recording started, state:', mediaRecorder.state)
      setIsRecording(true)
      setIsPaused(false)
      
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)
      
    } catch (err) {
      console.error('[SimpleRecord] Error:', err)
    }
  }, [takes.length])
  
  const actuallyStartRecording = useCallback(async () => {
    if (!streamRef.current || !videoRef.current) return
    
    // TEST MODE: Use simple direct recording
    if (simpleRecordMode) {
      console.log('[Recording] Using SIMPLE RECORD MODE')
      simpleStartRecording()
      return
    }
    
    try {
      chunksRef.current = []
      
      // Get video dimensions from camera
      const video = videoRef.current
      const sourceWidth = video.videoWidth || 1920
      const sourceHeight = video.videoHeight || 1080
      
      // Calculate output dimensions based on aspect ratio setting
      const isVertical = recordingSettings.aspectRatio === '9:16'
      let outputWidth: number
      let outputHeight: number
      let cropX = 0
      let cropY = 0
      let cropWidth = sourceWidth
      let cropHeight = sourceHeight
      
      if (isVertical) {
        // For vertical output, we need to crop the center of the landscape video
        // Output: 1080x1920 (9:16)
        outputWidth = 1080
        outputHeight = 1920
        
        // Calculate crop region from center of source video
        // The source is landscape (e.g., 1920x1080), we need to extract a vertical portion
        const targetRatio = 9 / 16 // 0.5625
        const sourceRatio = sourceWidth / sourceHeight
        
        if (sourceRatio > targetRatio) {
          // Source is wider than target, crop width
          cropHeight = sourceHeight
          cropWidth = Math.round(sourceHeight * targetRatio)
          cropX = Math.round((sourceWidth - cropWidth) / 2)
          cropY = 0
        } else {
          // Source is taller than target, crop height
          cropWidth = sourceWidth
          cropHeight = Math.round(sourceWidth / targetRatio)
          cropX = 0
          cropY = Math.round((sourceHeight - cropHeight) / 2)
        }
      } else {
        // Landscape: use full video or crop to 16:9
        outputWidth = 1920
        outputHeight = 1080
        // Use full source for landscape (already likely 16:9)
      }
      
      console.log('[Recording] Source:', sourceWidth, 'x', sourceHeight)
      console.log('[Recording] Output:', outputWidth, 'x', outputHeight)
      console.log('[Recording] Crop region:', { cropX, cropY, cropWidth, cropHeight })
      
      // Create canvas for compositing at output dimensions
      const canvas = document.createElement('canvas')
      canvas.width = outputWidth
      canvas.height = outputHeight
      const ctx = canvas.getContext('2d')!
      canvasRef.current = canvas
      
      recordingStartTimeRef.current = Date.now()
      
      // Composite function - draws video to canvas
      const drawFrame = () => {
        if (!ctx || !video) return
        
        // Draw video frame with cropping for vertical/horizontal aspect ratio
        // drawImage(source, srcX, srcY, srcW, srcH, destX, destY, destW, destH)
        if (recordingSettings.mirror) {
          ctx.save()
          ctx.scale(-1, 1)
          ctx.drawImage(video, cropX, cropY, cropWidth, cropHeight, -outputWidth, 0, outputWidth, outputHeight)
          ctx.restore()
        } else {
          ctx.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, outputWidth, outputHeight)
        }
        
        // Continue animation loop while recording
        if (mediaRecorderRef.current?.state === 'recording') {
          compositeAnimationRef.current = requestAnimationFrame(drawFrame)
        }
      }
      
      // Get canvas stream and add audio from original stream
      const canvasStream = canvas.captureStream(30) // 30 fps
      const audioTracks = streamRef.current.getAudioTracks()
      audioTracks.forEach(track => canvasStream.addTrack(track))
      canvasStreamRef.current = canvasStream
      
      // Record the composited canvas stream
      // Prefer MP4 on iOS Safari for better playback compatibility
      // Fall back to WebM with VP8 on other browsers
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
      
      let mimeType: string
      let fileExtension: string
      
      if ((isIOS || isSafari) && MediaRecorder.isTypeSupported('video/mp4')) {
        mimeType = 'video/mp4'
        fileExtension = 'mp4'
      } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
        mimeType = 'video/webm;codecs=vp8,opus'
        fileExtension = 'webm'
      } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
        mimeType = 'video/webm;codecs=vp9,opus'
        fileExtension = 'webm'
      } else if (MediaRecorder.isTypeSupported('video/webm')) {
        mimeType = 'video/webm'
        fileExtension = 'webm'
      } else {
        // Last resort - let browser choose
        mimeType = ''
        fileExtension = 'webm'
      }
      
      console.log('[Recording] Platform:', isIOS ? 'iOS' : isSafari ? 'Safari' : 'Other')
      console.log('[Recording] Using mimeType:', mimeType || 'browser default')
      
      const recorderOptions: MediaRecorderOptions = {
        videoBitsPerSecond: 5000000,
      }
      if (mimeType) recorderOptions.mimeType = mimeType
      
      const mediaRecorder = new MediaRecorder(canvasStream, recorderOptions)
      const actualMimeType = mediaRecorder.mimeType // Get actual mime type used
      console.log('[Recording] Actual mimeType from recorder:', actualMimeType)
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      
      mediaRecorder.onstop = async () => {
        // Stop animation loop
        if (compositeAnimationRef.current) {
          cancelAnimationFrame(compositeAnimationRef.current)
          compositeAnimationRef.current = null
        }
        
        const stopTime = Date.now()
        const startTime = recordingStartTimeRef.current
        console.log('[Recording] Stop time:', stopTime, 'Start time:', startTime, 'Diff:', stopTime - startTime)
        
        // Use actual mime type from recorder for proper playback
        const blobMimeType = actualMimeType || 'video/webm'
        const blob = new Blob(chunksRef.current, { type: blobMimeType })
        const url = URL.createObjectURL(blob)
        const thumbnail = await generateThumbnail(blob)
        
        // Calculate actual duration from recording time
        const actualDuration = Math.round((stopTime - startTime) / 1000)
        console.log('[Recording] Duration calculated:', actualDuration, 'seconds', 'mimeType:', blobMimeType)
        
        const newTake: Take = {
          id: `take-${Date.now()}`,
          number: takes.length + 1,
          blob, url,
          mimeType: blobMimeType,
          duration: actualDuration,
          timestamp: new Date(),
          starred: false,
          notes: '',
          thumbnail,
          isPortrait: recordingSettings.aspectRatio === '9:16',
        }
        
        console.log('[Recording] New take duration:', newTake.duration)
        
        // Auto-upload immediately
        const uploadedTake = await autoUploadTake(newTake)
        setTakes(prev => [...prev, uploadedTake])
        setSlateInfo(prev => ({ ...prev, takeNumber: prev.takeNumber + 1 }))
        setRecordingTime(0)
      }
      
      mediaRecorderRef.current = mediaRecorder
      
      // Start drawing frames
      drawFrame()
      
      // Start recording
      mediaRecorder.start(1000)
      setIsRecording(true)
      setIsPaused(false)
      
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (recordingSettings.autoStop && prev >= recordingSettings.maxDuration) {
            stopRecording()
            return prev
          }
          return prev + 1
        })
      }, 1000)
      
    } catch (err) {
      console.error('[Recording]', err)
    }
  }, [takes.length, recordingTime, recordingSettings])


  // Countdown effect - after countdown ends, start recording
  useEffect(() => {
    if (countdown === null) return
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(timer)
    } else {
      // Countdown finished - start recording (slate is handled via canvas compositing)
      setCountdown(null)
      actuallyStartRecording()
    }
  }, [countdown])

  const stopRecording = useCallback(() => {
    if (!mediaRecorderRef.current || !isRecording) return
    console.log('[Recording] Stopping recording')
    mediaRecorderRef.current.stop()
    setIsRecording(false)
    setIsPaused(false)
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    // Stop animation loop
    if (compositeAnimationRef.current) {
      cancelAnimationFrame(compositeAnimationRef.current)
      compositeAnimationRef.current = null
    }
    // Always stop STT when stopping recording using ref
    console.log('[Recording] Stopping STT session')
    stopSTTRef.current()
  }, [isRecording])

  const generateThumbnail = async (blob: Blob): Promise<string | undefined> => {
    return new Promise((resolve) => {
      const video = document.createElement('video')
      video.src = URL.createObjectURL(blob)
      video.currentTime = 0.5
      video.onloadeddata = () => {
        // Use actual video dimensions for thumbnail aspect ratio
        const isVerticalVideo = video.videoHeight > video.videoWidth
        const canvas = document.createElement('canvas')
        if (isVerticalVideo) {
          // Portrait: 90x160 (9:16)
          canvas.width = 90
          canvas.height = 160
        } else {
          // Landscape: 160x90 (16:9)
          canvas.width = 160
          canvas.height = 90
        }
        canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.7))
        URL.revokeObjectURL(video.src)
      }
      video.onerror = () => resolve(undefined)
    })
  }

  // ============================================================================
  // TAKES MANAGEMENT & AUTO-UPLOAD
  // ============================================================================
  
  const toggleStarTake = (takeId: string) => setTakes(prev => prev.map(t => t.id === takeId ? { ...t, starred: !t.starred } : t))
  
  const saveTakeNotes = async (takeId: string, notes: string) => {
    // Update local state
    setTakes(prev => prev.map(t => t.id === takeId ? { ...t, notes } : t))
    
    // Update in Supabase if uploaded
    const take = takes.find(t => t.id === takeId)
    if (take?.supabaseId) {
      try {
        await supabase.from('recordings').update({ notes }).eq('id', take.supabaseId)
      } catch (err) {
        console.error('[SaveNotes] Failed:', err)
      }
    }
    
    // Clear editing state
    setEditingTakeNotes(null)
    setTempNotes('')
  }
  
  const deleteTake = async (takeId: string) => {
    const take = takes.find(t => t.id === takeId)
    if (take) {
      URL.revokeObjectURL(take.url)
      // Also delete from Supabase if uploaded
      if (take.supabaseId) {
        try {
          await supabase.from('recordings').delete().eq('id', take.supabaseId)
        } catch (err) {
          console.error('[Delete] Failed:', err)
        }
      }
    }
    setTakes(prev => prev.filter(t => t.id !== takeId))
    if (selectedTake?.id === takeId) setSelectedTake(null)
  }

  const downloadTake = (take: Take) => {
    const a = document.createElement('a')
    a.href = take.remoteUrl || take.url
    const title = selectedScriptForRecording?.title || quickRecordTitle || 'Recording'
    const ext = take.mimeType?.includes('mp4') ? 'mp4' : 'webm'
    a.download = `${title.replace(/\s+/g, '_')}_Take${take.number}.${ext}`
    a.click()
  }

  // Auto-upload take immediately after recording
  const autoUploadTake = async (take: Take): Promise<Take> => {
    if (!user?.id) {
      console.error('[AutoUpload] No user ID, cannot upload')
      return take
    }
    
    setUploadingTake(take.id)
    
    try {
      console.log('[AutoUpload] Starting upload for take', take.number, 'blob size:', take.blob.size, 'mimeType:', take.mimeType)
      
      // Determine file extension and content type from actual mimeType
      const isMP4 = take.mimeType?.includes('mp4')
      const fileExt = isMP4 ? 'mp4' : 'webm'
      const contentType = isMP4 ? 'video/mp4' : 'video/webm'
      
      // Upload to Supabase Storage
      const fileName = `${user.id}/${Date.now()}_take${take.number}.${fileExt}`
      console.log('[AutoUpload] Uploading to:', fileName, 'contentType:', contentType)
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('recordings')
        .upload(fileName, take.blob, { 
          contentType,
          upsert: false 
        })
      
      if (uploadError) {
        console.error('[AutoUpload] Storage upload failed:', uploadError)
        throw uploadError
      }
      
      console.log('[AutoUpload] Storage upload success:', uploadData)
      
      // Get public URL
      const { data: { publicUrl } } = supabase.storage.from('recordings').getPublicUrl(fileName)
      console.log('[AutoUpload] Public URL:', publicUrl)
      
      // Generate title
      const title = selectedScriptForRecording 
        ? `${selectedScriptForRecording.title} - Take ${take.number}`
        : quickRecordTitle || `Recording ${new Date().toLocaleDateString()}`
      
      // Save to recordings table
      const { data: recording, error: dbError } = await supabase
        .from('recordings')
        .insert({
          user_id: user.id,
          script_id: selectedScriptForRecording?.id || null,
          title,
          video_url: publicUrl,
          thumbnail_url: take.thumbnail || null,
          duration_seconds: take.duration,
          resolution: recordingSettings.resolution,
          aspect_ratio: recordingSettings.aspectRatio,
          take_number: take.number,
          is_favorite: take.starred,
          notes: take.notes,
          slate_info: slateInfo,
        })
        .select()
        .single()
      
      if (dbError) {
        console.error('[AutoUpload] Database insert failed:', dbError)
        throw dbError
      }
      
      console.log('[AutoUpload] Success! Recording ID:', recording.id, 'Remote URL:', publicUrl)
      setUploadingTake(null)
      
      // Trigger achievement check for recording milestones
      setTimeout(() => triggerAchievementCheck(), 500)
      
      // Return with remoteUrl for better playback on iOS
      return { ...take, uploaded: true, supabaseId: recording.id, remoteUrl: publicUrl }
      
    } catch (err) {
      console.error('[AutoUpload] Failed:', err)
      setUploadingTake(null)
      return take
    }
  }

  // Legacy manual upload (kept for UI button if needed)
  const uploadTake = async (take: Take) => {
    if (!user?.id || take.uploaded) return
    
    setUploading(take.id)
    const updatedTake = await autoUploadTake(take)
    setTakes(prev => prev.map(t => t.id === take.id ? updatedTake : t))
    setUploading(null)
  }
  // Delete saved recording from database
  const deleteSavedRecording = async (recordingId: string) => {
    try {
      await supabase.from('recordings').delete().eq('id', recordingId)
      setSavedRecordings(prev => prev.filter(r => r.id !== recordingId))
      setActiveRecordingMenu(null)
    } catch (err) {
      console.error('[Delete]', err)
    }
  }
  
  // Toggle favorite on saved recording
  const toggleSavedRecordingFavorite = async (recordingId: string) => {
    const recording = savedRecordings.find(r => r.id === recordingId)
    if (!recording) return
    
    const newFavorite = !recording.is_favorite
    try {
      await supabase.from('recordings').update({ is_favorite: newFavorite }).eq('id', recordingId)
      setSavedRecordings(prev => prev.map(r => 
        r.id === recordingId ? { ...r, is_favorite: newFavorite } : r
      ))
      setActiveRecordingMenu(null)
    } catch (err) {
      console.error('[Favorite]', err)
    }
  }
  
  // Download saved recording
  const downloadSavedRecording = async (recording: SavedRecording) => {
    try {
      const response = await fetch(recording.video_url)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${recording.title || 'recording'}.webm`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setActiveRecordingMenu(null)
    } catch (err) {
      console.error('[Download]', err)
    }
  }

  // ============================================================================
  // TELEPROMPTER & SCENE PLAYBACK - State Machine Based
  // ============================================================================
  
  // Reset STT state when mode changes
  useEffect(() => {
    setMatchedWordCount(0)
    setHasWordError(false)
    setSttTranscript('')
    setCommittedTranscript('')
    committedTranscriptRef.current = ''
  }, [teleprompterSettings.mode])
  
  // Start/stop STT based on state
  // Start/stop STT based on recording state (simpler - just run during recording in STT mode)
  useEffect(() => {
    const shouldListen = teleprompterSettings.mode === 'stt' && 
                         isRecording && 
                         !isPaused
    
    if (shouldListen && !sttListening) {
      console.log('[STT] Starting session')
      // Extract unique words from user lines for Keyterm Prompting
      const userLines = scriptLines.filter(l => l.is_user_line)
      const allWords = userLines
      console.log('[STT] Starting OpenAI Realtime session')
      startSTT()
    } else if (!shouldListen && sttListening) {
      console.log('[STT] Stopping session')
      stopSTT()
    }
  }, [teleprompterSettings.mode, isRecording, isPaused, sttListening, startSTT, stopSTT, scriptLines])
  
  // Timed mode auto-advance (only affects display, not scene state)
  useEffect(() => {
    if (teleprompterSettings.mode !== 'timed' || !isRecording || isPaused) return
    const interval = setInterval(() => {
      setSceneLineIndex(prev => prev >= scriptLines.length - 1 ? prev : prev + 1)
    }, (100 - teleprompterSettings.speed) * 100)
    return () => clearInterval(interval)
  }, [teleprompterSettings.mode, teleprompterSettings.speed, isRecording, isPaused, scriptLines.length])

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`

  // ============================================================================
  // SCENE STATE MACHINE - Handle line transitions & partner audio
  // ============================================================================
  
  // Play partner audio - simple version
  const playPartnerAudio = useCallback((audioUrl: string) => {
    // Prevent overlapping audio
    if (readerAudioRef.current) {
      console.log('[Partner] Already playing, ignoring')
      return
    }
    
    setSceneState('partner-speaking')
    
    // Apply partner response delay
    const delay = recordingSettings.partnerResponseDelay
    
    const startPlayback = () => {
      const audio = new Audio(audioUrl)
      audio.volume = recordingSettings.readerVolume / 100
      audio.playbackRate = recordingSettings.partnerSpeechRate
      readerAudioRef.current = audio
      
      audio.onended = () => {
        console.log('[Partner] Audio ended')
        readerAudioRef.current = null
        setSceneState('idle')
        // Only advance if not at end
        if (sceneLineIndexRef.current < scriptLinesRef.current.length - 1) {
          advanceLineRef.current()
        } else {
          console.log('[Partner] At end of script, not advancing')
        }
      }
      
      audio.onerror = () => {
        console.log('[Partner] Audio error')
        readerAudioRef.current = null
        setSceneState('idle')
        if (sceneLineIndexRef.current < scriptLinesRef.current.length - 1) {
          advanceLineRef.current()
        }
      }
      
      audio.play().catch(() => {
        console.log('[Partner] Play failed')
        readerAudioRef.current = null
        setSceneState('idle')
        if (sceneLineIndexRef.current < scriptLinesRef.current.length - 1) {
          advanceLineRef.current()
        }
      })
    }
    
    if (delay > 0) {
      setTimeout(startPlayback, delay)
    } else {
      startPlayback()
    }
  }, [recordingSettings.partnerResponseDelay, recordingSettings.readerVolume, recordingSettings.partnerSpeechRate])

  // Handle scene line changes - play partner audio when it's their turn
  useEffect(() => {
    if (!isRecording || isPaused) return
    if (sceneState === 'partner-speaking') return // Don't interrupt partner
    
    // Check bounds
    if (sceneLineIndex >= scriptLines.length) {
      console.log('[Scene] At end of script, stopping')
      setSceneState('idle')
      return
    }
    
    const line = scriptLines[sceneLineIndex]
    if (!line) return
    
    console.log('[Scene] Line', sceneLineIndex, ':', line.is_user_line ? 'USER' : 'PARTNER', '-', line.content.substring(0, 30))
    
    if (line.is_user_line) {
      // User's turn - just update state, STT handles the rest
      setSceneState('user-speaking')
    } else if (recordingSettings.playReaderAudio && line.audio_url) {
      // Partner's turn - play audio
      playPartnerAudio(line.audio_url)
    } else {
      // Partner line with no audio or audio disabled - skip after brief pause
      setSceneState('transitioning')
      setTimeout(() => advanceLineRef.current(), 300)
    }
  }, [sceneLineIndex, isRecording, isPaused, sceneState, scriptLines, recordingSettings.playReaderAudio, playPartnerAudio])

  // Initialize scene when recording starts
  useEffect(() => {
    if (isRecording && scriptLines.length > 0) {
      console.log('[Scene] Recording started, resetting to line 0')
      setSceneLineIndex(0)
      setSceneState('idle')
      setMatchedWordCount(0)
      setHasWordError(false)
      setSttTranscript('')
      setCommittedTranscript('')
      committedTranscriptRef.current = ''
    }
  }, [isRecording, scriptLines.length])

  // Stop partner audio and reset teleprompter when recording stops
  useEffect(() => {
    if (!isRecording) {
      // Stop any playing audio
      if (readerAudioRef.current) {
        readerAudioRef.current.pause()
        readerAudioRef.current = null
      }
      
      // Reset teleprompter to start
      setSceneLineIndex(0)
      setSceneState('idle')
      setMatchedWordCount(0)
      setHasWordError(false)
      setSttTranscript('')
      setCommittedTranscript('')
      committedTranscriptRef.current = ''
      
      console.log('[Scene] Recording stopped, teleprompter reset to start')
    }
  }, [isRecording])

  // ============================================================================
  // START RECORDING SESSION
  // ============================================================================
  
  const startWithScript = async (script: Script) => {
    setSelectedScriptForRecording(script)
    setSlateInfo(prev => ({
      ...prev,
      role: script.user_role || '',
      projectTitle: script.title || '',
      takeNumber: 1,
    }))
    
    // Load existing recordings for this script as takes
    if (user?.id) {
      try {
        const { data: existingRecordings } = await supabase
          .from('recordings')
          .select('*')
          .eq('user_id', user.id)
          .eq('script_id', script.id)
          .order('created_at', { ascending: false })
        
        if (existingRecordings && existingRecordings.length > 0) {
          console.log('[Recording] Found', existingRecordings.length, 'existing recordings')
          // Convert to Take format with iOS-compatible fields
          const existingTakes: Take[] = existingRecordings.map((r: any, idx: number) => ({
            id: r.id,
            number: r.take_number || (existingRecordings.length - idx),
            blob: new Blob(), // Empty blob for existing recordings
            url: r.video_url, // Use remote URL as primary
            remoteUrl: r.video_url, // Also set as remote for iOS compatibility
            mimeType: r.video_url?.includes('.mp4') ? 'video/mp4' : 'video/webm',
            duration: r.duration_seconds || 0,
            timestamp: new Date(r.created_at),
            starred: r.is_favorite || false,
            notes: r.notes || '',
            thumbnail: r.thumbnail_url,
            uploaded: true,
            supabaseId: r.id,
          }))
          setTakes(existingTakes)
          setSlateInfo(prev => ({ ...prev, takeNumber: existingTakes.length + 1 }))
        } else {
          setTakes([])
        }
      } catch (err) {
        console.error('[Recording] Failed to load existing recordings:', err)
        setTakes([])
      }
    } else {
      setTakes([])
    }
    
    // Load lines for this script if not already in store
    const existingLines = lines.filter(l => l.script_id === script.id)
    console.log('[Recording] Existing lines for script:', existingLines.length)
    if (existingLines.length === 0) {
      console.log('[Recording] Loading lines for script:', script.id)
      try {
        const result = await supabase
          .from('lines')
          .select('*')
          .eq('script_id', script.id)
          .order('sort_order', { ascending: true })
        
        console.log('[Recording] Supabase result:', { data: result.data?.length, error: result.error, status: result.status })
        
        if (result.data && result.data.length > 0) {
          console.log('[Recording] Loaded', result.data.length, 'lines')
          // Merge with existing lines, avoiding duplicates
          const existingIds = new Set(lines.map((l: Line) => l.id))
          const newLines = result.data.filter((l: Line) => !existingIds.has(l.id))
          setLines([...lines, ...newLines])
        } else if (result.error) {
          console.error('[Recording] Error loading lines:', JSON.stringify(result.error))
        } else {
          console.log('[Recording] No lines found for script')
        }
      } catch (err) {
        console.error('[Recording] Failed to load lines:', err)
      }
    }
    
    setViewMode('record')
  }
  
  const startQuickRecord = () => {
    setSelectedScriptForRecording(null)
    setQuickRecordTitle('')
    setSlateInfo(prev => ({
      ...prev,
      role: '',
      projectTitle: '',
      takeNumber: 1,
    }))
    setTakes([])
    setViewMode('record')
  }

  // ============================================================================
  // RENDER: SELECTION SCREEN
  // ============================================================================
  
  const renderSelectionScreen = () => {
    const userScripts = scripts.filter(s => !s.is_archived)
    const filteredScripts = scriptSearchQuery 
      ? userScripts.filter(s => 
          s.title.toLowerCase().includes(scriptSearchQuery.toLowerCase()) ||
          s.user_role?.toLowerCase().includes(scriptSearchQuery.toLowerCase())
        )
      : userScripts
    
    // Group saved recordings
    const scriptRecordings = savedRecordings.filter(r => r.script_id)
    const quickRecordings = savedRecordings.filter(r => !r.script_id)
    
    return (
      <div className="h-full flex flex-col bg-bg">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-border">
          <h1 className="text-xl font-semibold text-text">Studio</h1>
          <p className="text-sm text-text-muted mt-1">Create self-tapes and recordings</p>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {/* New Recording Options */}
          <div className="p-4 space-y-3">
            <h2 className="text-xs uppercase tracking-wide text-text-muted font-medium">New Recording</h2>
            
            {/* Choose Script */}
            <button
              onClick={() => setShowScriptPicker(true)}
              className="w-full p-4 bg-bg-surface hover:bg-bg-surface-hover border border-border rounded-xl text-left transition-colors group"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
                  <Icons.Script />
                </div>
                <div className="flex-1">
                  <div className="font-medium text-text group-hover:text-accent transition-colors">With Script</div>
                  <div className="text-sm text-text-muted">Practice a scene with AI reader</div>
                </div>
                <Icons.ChevronRight />
              </div>
            </button>
            
            {/* Quick Record */}
            <button
              onClick={startQuickRecord}
              className="w-full p-4 bg-bg-surface hover:bg-bg-surface-hover border border-border rounded-xl text-left transition-colors group"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-ai/10 flex items-center justify-center text-ai">
                  <Icons.Video />
                </div>
                <div className="flex-1">
                  <div className="font-medium text-text group-hover:text-ai transition-colors">Quick Record</div>
                  <div className="text-sm text-text-muted">Just record without a script</div>
                </div>
                <Icons.ChevronRight />
              </div>
            </button>
          </div>
          
          {/* By Project - Scripts that have recordings */}
          {(() => {
            // Group recordings by script and get unique scripts with recordings
            const scriptsWithRecordings = savedRecordings
              .filter(r => r.script_id)
              .reduce((acc, r) => {
                const scriptId = r.script_id as string
                if (!acc.find(s => s.script_id === scriptId)) {
                  const script = scripts?.find(s => s.id === scriptId)
                  if (script) {
                    const recordingCount = savedRecordings.filter(rec => rec.script_id === scriptId).length
                    acc.push({ ...script, script_id: scriptId, recordingCount })
                  }
                }
                return acc
              }, [] as Array<{ id: string; title: string; user_role?: string; script_id: string; recordingCount: number }>)
            
            if (scriptsWithRecordings.length === 0) return null
            
            return (
              <div className="px-4 pb-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs uppercase tracking-wide text-text-muted font-medium">Scripts</h2>
                </div>
                <div className="space-y-2">
                  {scriptsWithRecordings.slice(0, 5).map(script => (
                    <button
                      key={script.id}
                      onClick={() => {
                        // Filter to show only recordings for this script
                        setSelectedScriptForRecording(scripts?.find(s => s.id === script.id) || null)
                        setViewMode('recordings')
                      }}
                      className="w-full flex items-center gap-3 p-3 bg-bg-surface hover:bg-bg-surface-hover border border-border rounded-lg text-left transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-text truncate">{script.title}</div>
                        <div className="text-xs text-text-muted">{script.recordingCount} recording{script.recordingCount !== 1 ? 's' : ''}</div>
                      </div>
                      <Icons.ChevronRight />
                    </button>
                  ))}
                </div>
              </div>
            )
          })()}
          
          {/* Recent Recordings - Show section with loading, content, or empty state */}
          {(savedRecordings.length > 0 || loadingRecordings) && (
            <div className="px-4 pb-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs uppercase tracking-wide text-text-muted font-medium">Recent Recordings</h2>
                {savedRecordings.length > 0 && (
                  <button 
                    onClick={() => setViewMode('recordings')}
                    className="text-xs text-accent hover:text-accent/80"
                  >
                    View All
                  </button>
                )}
              </div>
              
              {loadingRecordings ? (
                <div className="py-8 flex justify-center">
                  <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <div className="space-y-2">
                  {savedRecordings.slice(0, 5).map(recording => (
                    <div
                      key={recording.id}
                      className="flex items-center gap-3 p-3 bg-bg-surface rounded-lg border border-border relative"
                    >
                      {/* Clickable area - opens preview */}
                      <button
                        onClick={() => setSelectedRecordingForPreview(recording)}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left"
                      >
                        {/* Thumbnail */}
                        <div className="w-16 h-10 rounded bg-bg-elevated overflow-hidden flex-shrink-0">
                          {recording.thumbnail_url ? (
                            <img src={recording.thumbnail_url} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-text-muted">
                              <Icons.Video />
                            </div>
                          )}
                        </div>
                        
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-text truncate">
                            {recording.title || `Take ${recording.take_number}`}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-text-muted">
                            <span>{formatTime(recording.duration_seconds)}</span>
                            <span>·</span>
                            <span>{new Date(recording.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </button>
                      
                      {/* Favorite indicator */}
                      {recording.is_favorite && (
                        <div className="text-warning flex-shrink-0">
                          <Icons.Star filled size={16} />
                        </div>
                      )}
                      
                      {/* Actions menu button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setActiveRecordingMenu(activeRecordingMenu === recording.id ? null : recording.id)
                        }}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-text-muted flex-shrink-0"
                      >
                        <Icons.MoreVertical size={18} />
                      </button>
                      
                      {/* Dropdown menu */}
                      <AnimatePresence>
                        {activeRecordingMenu === recording.id && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: -5 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -5 }}
                            className="absolute right-2 top-full mt-1 z-50 bg-bg-elevated border border-border rounded-lg shadow-lg overflow-hidden min-w-[160px]"
                          >
                            <button
                              onClick={() => setSelectedRecordingForPreview(recording)}
                              className="w-full px-4 py-2.5 text-left text-sm hover:bg-white/5 flex items-center gap-3"
                            >
                              <Icons.Play size={16} />
                              Play
                            </button>
                            <button
                              onClick={() => toggleSavedRecordingFavorite(recording.id)}
                              className="w-full px-4 py-2.5 text-left text-sm hover:bg-white/5 flex items-center gap-3"
                            >
                              <Icons.Star size={16} filled={recording.is_favorite} />
                              {recording.is_favorite ? 'Remove Favorite' : 'Add to Favorites'}
                            </button>
                            <button
                              onClick={() => downloadSavedRecording(recording)}
                              className="w-full px-4 py-2.5 text-left text-sm hover:bg-white/5 flex items-center gap-3"
                            >
                              <Icons.Download size={16} />
                              Download
                            </button>
                            <div className="h-px bg-border" />
                            <button
                              onClick={() => {
                                if (confirm('Delete this recording?')) {
                                  deleteSavedRecording(recording.id)
                                }
                              }}
                              className="w-full px-4 py-2.5 text-left text-sm hover:bg-white/5 flex items-center gap-3 text-error"
                            >
                              <Icons.Trash size={16} />
                              Delete
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          
          {/* Empty State - Only show when not loading and no recordings */}
          {savedRecordings.length === 0 && !loadingRecordings && (
            <div className="px-4 py-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-bg-surface flex items-center justify-center text-text-muted">
                <Icons.Camera />
              </div>
              <p className="text-text-muted">No recordings yet</p>
              <p className="text-sm text-text-subtle mt-1">Start recording to see your takes here</p>
            </div>
          )}
        </div>
        
        {/* Script Picker Modal */}
        <AnimatePresence>
          {showScriptPicker && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
              onClick={() => setShowScriptPicker(false)}
            >
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="absolute bottom-0 left-0 right-0 bg-bg rounded-t-2xl max-h-[85vh] flex flex-col pb-safe"
                onClick={e => e.stopPropagation()}
              >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                  <h2 className="text-lg font-semibold">Choose Script</h2>
                  <button onClick={() => setShowScriptPicker(false)} className="p-2 -mr-2">
                    <Icons.X />
                  </button>
                </div>
                
                {/* Search */}
                <div className="p-4 border-b border-border">
                  <input
                    type="text"
                    placeholder="Search scripts..."
                    value={scriptSearchQuery}
                    onChange={e => setScriptSearchQuery(e.target.value)}
                    className="w-full px-4 py-3 bg-bg-surface border border-border rounded-xl text-text placeholder:text-text-muted focus:outline-none focus:border-accent"
                  />
                </div>
                
                {/* Scripts List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {filteredScripts.length === 0 ? (
                    <div className="text-center py-8 text-text-muted">
                      <p>No scripts found</p>
                      <p className="text-sm mt-1">Upload scripts in the Library tab</p>
                    </div>
                  ) : (
                    filteredScripts.map(script => (
                      <button
                        key={script.id}
                        onClick={() => {
                          startWithScript(script)
                          setShowScriptPicker(false)
                        }}
                        className="w-full p-4 bg-bg-surface hover:bg-bg-surface-hover border border-border rounded-xl text-left transition-colors"
                      >
                        <div className="font-medium text-text">{script.title}</div>
                        <div className="flex items-center gap-2 mt-1 text-sm text-text-muted">
                          {script.user_role && (
                            <span className="text-accent">{script.user_role}</span>
                          )}
                          {script.show_name && (
                            <>
                              <span>·</span>
                              <span>{script.show_name}</span>
                            </>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Recording Preview Modal */}
        <AnimatePresence>
          {selectedRecordingForPreview && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
              onClick={() => setSelectedRecordingForPreview(null)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-bg-elevated rounded-2xl overflow-hidden max-w-lg w-full max-h-[80vh] flex flex-col"
                onClick={e => e.stopPropagation()}
              >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-text truncate">
                      {selectedRecordingForPreview.title || `Take ${selectedRecordingForPreview.take_number}`}
                    </h3>
                    <p className="text-sm text-text-muted">
                      {formatTime(selectedRecordingForPreview.duration_seconds)} · {new Date(selectedRecordingForPreview.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedRecordingForPreview(null)}
                    className="p-2 rounded-lg hover:bg-white/10"
                  >
                    <Icons.X />
                  </button>
                </div>
                
                {/* Video - from Supabase storage with mobile-compatible playback */}
                <div className="flex-1 flex items-center justify-center bg-black">
                  <video
                    key={selectedRecordingForPreview.video_url}
                    controls
                    autoPlay
                    playsInline
                    webkit-playsinline="true"
                    x-webkit-airplay="allow"
                    preload="auto"
                    src={selectedRecordingForPreview.video_url}
                    className="w-full h-full object-contain"
                    style={{ maxHeight: 'calc(100vh - 200px)' }}
                    onLoadedMetadata={(e) => {
                      const video = e.currentTarget
                      console.log('[VideoPlayer] Remote video loaded, duration:', video.duration, 'src:', video.currentSrc?.substring(0, 50))
                    }}
                    onCanPlay={(e) => {
                      console.log('[VideoPlayer] Can play saved recording')
                      e.currentTarget.play().catch(err => console.log('[VideoPlayer] Autoplay blocked:', err))
                    }}
                    onError={(e) => {
                      const video = e.currentTarget
                      console.error('[VideoPlayer] Playback error:', video.error?.code, video.error?.message, 'src:', video.currentSrc)
                    }}
                  />
                </div>
                
                {/* Actions */}
                <div className="flex items-center justify-between p-4 border-t border-border">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleSavedRecordingFavorite(selectedRecordingForPreview.id)}
                      className={`p-2 rounded-lg hover:bg-white/10 ${selectedRecordingForPreview.is_favorite ? 'text-warning' : 'text-text-muted'}`}
                    >
                      <Icons.Star filled={selectedRecordingForPreview.is_favorite} />
                    </button>
                    <button
                      onClick={() => downloadSavedRecording(selectedRecordingForPreview)}
                      className="p-2 rounded-lg hover:bg-white/10 text-text-muted"
                    >
                      <Icons.Download />
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm('Delete this recording?')) {
                        deleteSavedRecording(selectedRecordingForPreview.id)
                        setSelectedRecordingForPreview(null)
                      }
                    }}
                    className="p-2 rounded-lg hover:bg-white/10 text-error"
                  >
                    <Icons.Trash />
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }


  // ============================================================================
  // RENDER: TELEPROMPTER (Draggable, Resizable, Smooth Scroll)
  // ============================================================================
  
  // Smooth scroll to current line
  useEffect(() => {
    if (!teleprompterRef.current || teleprompterSettings.mode === 'off') return
    
    const container = teleprompterRef.current
    const currentLineEl = container.querySelector(`[data-line="${sceneLineIndex}"]`) as HTMLElement
    
    if (currentLineEl) {
      const containerHeight = container.clientHeight
      const lineTop = currentLineEl.offsetTop
      const lineHeight = currentLineEl.offsetHeight
      
      // Center the current line in the container
      const scrollTarget = lineTop - (containerHeight / 2) + (lineHeight / 2)
      
      container.scrollTo({
        top: Math.max(0, scrollTarget),
        behavior: 'smooth'
      })
    }
  }, [sceneLineIndex, teleprompterSettings.mode])
  
  // Drag handlers
  const handleTeleprompterDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    if (teleprompterSettings.position !== 'custom') return
    e.preventDefault()
    e.stopPropagation()
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    
    dragStartRef.current = {
      x: clientX,
      y: clientY,
      startX: teleprompterSettings.customX,
      startY: teleprompterSettings.customY,
    }
    setIsDraggingTeleprompter(true)
  }
  
  const handleTeleprompterDragMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isDraggingTeleprompter) return
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    
    const deltaX = clientX - dragStartRef.current.x
    const deltaY = clientY - dragStartRef.current.y
    
    setTeleprompterSettings(prev => ({
      ...prev,
      customX: Math.max(0, dragStartRef.current.startX + deltaX),
      customY: Math.max(0, dragStartRef.current.startY + deltaY),
    }))
  }, [isDraggingTeleprompter])
  
  const handleTeleprompterDragEnd = useCallback(() => {
    setIsDraggingTeleprompter(false)
  }, [])
  
  // Resize handlers
  const handleTeleprompterResizeStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    
    resizeStartRef.current = {
      width: teleprompterSettings.customWidth,
      height: teleprompterSettings.customHeight,
      startX: clientX,
      startY: clientY,
    }
    setIsResizingTeleprompter(true)
  }
  
  const handleTeleprompterResizeMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isResizingTeleprompter) return
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    
    const deltaX = clientX - resizeStartRef.current.startX
    const deltaY = clientY - resizeStartRef.current.startY
    
    setTeleprompterSettings(prev => ({
      ...prev,
      customWidth: Math.max(150, resizeStartRef.current.width + deltaX),
      customHeight: Math.max(80, resizeStartRef.current.height + deltaY),
    }))
  }, [isResizingTeleprompter])
  
  const handleTeleprompterResizeEnd = useCallback(() => {
    setIsResizingTeleprompter(false)
  }, [])
  
  // Add/remove event listeners for drag/resize
  useEffect(() => {
    if (isDraggingTeleprompter) {
      window.addEventListener('mousemove', handleTeleprompterDragMove)
      window.addEventListener('mouseup', handleTeleprompterDragEnd)
      window.addEventListener('touchmove', handleTeleprompterDragMove)
      window.addEventListener('touchend', handleTeleprompterDragEnd)
    }
    return () => {
      window.removeEventListener('mousemove', handleTeleprompterDragMove)
      window.removeEventListener('mouseup', handleTeleprompterDragEnd)
      window.removeEventListener('touchmove', handleTeleprompterDragMove)
      window.removeEventListener('touchend', handleTeleprompterDragEnd)
    }
  }, [isDraggingTeleprompter, handleTeleprompterDragMove, handleTeleprompterDragEnd])
  
  useEffect(() => {
    if (isResizingTeleprompter) {
      window.addEventListener('mousemove', handleTeleprompterResizeMove)
      window.addEventListener('mouseup', handleTeleprompterResizeEnd)
      window.addEventListener('touchmove', handleTeleprompterResizeMove)
      window.addEventListener('touchend', handleTeleprompterResizeEnd)
    }
    return () => {
      window.removeEventListener('mousemove', handleTeleprompterResizeMove)
      window.removeEventListener('mouseup', handleTeleprompterResizeEnd)
      window.removeEventListener('touchmove', handleTeleprompterResizeMove)
      window.removeEventListener('touchend', handleTeleprompterResizeEnd)
    }
  }, [isResizingTeleprompter, handleTeleprompterResizeMove, handleTeleprompterResizeEnd])
  
  const renderTeleprompter = () => {
    if (teleprompterSettings.mode === 'off' || !scriptLines.length) return null
    
    const isCustomPosition = teleprompterSettings.position === 'custom'
    const isFullscreen = teleprompterSettings.position === 'fullscreen'
    
    // Position styles
    const positionStyles: React.CSSProperties = isFullscreen
      ? { left: 0, right: 0, top: 50, bottom: 120 } // Between header and record button
      : isCustomPosition
        ? {
            left: teleprompterSettings.customX,
            top: teleprompterSettings.customY,
            width: teleprompterSettings.customWidth,
            height: teleprompterSettings.customHeight,
          }
        : teleprompterSettings.position === 'top'
          ? { left: 0, right: 0, top: 60 }
          : { left: 0, right: 0, bottom: 140 } // Higher up from bottom
    
    return (
      <div 
        className={`absolute z-30 ${isCustomPosition ? 'rounded-lg overflow-hidden' : ''} ${isFullscreen ? 'flex flex-col rounded-lg overflow-hidden mx-2' : ''}`}
        style={{
          ...positionStyles,
          opacity: teleprompterSettings.opacity / 100,
        }}
      >
        {/* Fullscreen header with close button */}
        {isFullscreen && (
          <div className="flex items-center justify-between px-4 py-2 bg-black/90 border-b border-white/10">
            <span className="text-sm text-white/70">Teleprompter</span>
            <button 
              onClick={() => setTeleprompterSettings(s => ({ ...s, position: 'bottom' }))}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        
        {/* Drag handle (only in custom mode) */}
        {isCustomPosition && (
          <div 
            className="absolute top-0 left-0 right-0 h-6 bg-black/80 cursor-move flex items-center justify-center gap-2 touch-none"
            onMouseDown={handleTeleprompterDragStart}
            onTouchStart={handleTeleprompterDragStart}
          >
            <div className="w-8 h-1 rounded-full bg-white/40" />
          </div>
        )}
        
        {/* Content */}
        <div 
          ref={teleprompterRef}
          className={`overflow-y-auto overflow-x-hidden scroll-smooth ${
            isFullscreen
              ? 'flex-1 px-6 py-4 bg-black/95'
              : isCustomPosition 
                ? 'h-full pt-6 pb-4 px-3 bg-black/80' 
                : `max-h-44 px-3 py-2 ${
                    teleprompterSettings.position === 'top' 
                      ? 'bg-gradient-to-b from-black/90 via-black/70 to-transparent' 
                      : 'bg-gradient-to-t from-black/90 via-black/70 to-transparent'
                  }`
          }`}
          style={isCustomPosition ? { height: `calc(100% - ${sttTranscript ? '32px' : '0px'})` } : undefined}
        >
          <div className={`space-y-2 ${isFullscreen ? 'max-w-2xl mx-auto space-y-4' : ''}`}>
            {scriptLines.map((line, i) => {
              const isCurrentSceneLine = i === sceneLineIndex
              const isPastLine = i < sceneLineIndex
              const isUserLine = line.is_user_line
              // Show word tracing for current user line when STT is active (recording in STT mode)
              const isActiveUserLine = isCurrentSceneLine && isUserLine && 
                teleprompterSettings.mode === 'stt' && isRecording && !isPaused
              
              // Word-by-word rendering for active user line in STT mode
              const renderLineContent = () => {
                if (isActiveUserLine && teleprompterSettings.mode === 'stt') {
                  // Split into words and color based on matchedWordCount
                  const words = line.content.split(/(\s+)/)
                  let wordIndex = 0
                  
                  return words.map((word, idx) => {
                    const isSpace = !word.trim()
                    if (isSpace) return <span key={idx}>{word}</span>
                    
                    const currentWordIdx = wordIndex
                    wordIndex++
                    
                    const isMatched = currentWordIdx < matchedWordCount
                    const isErrorWord = hasWordError && currentWordIdx === matchedWordCount
                    
                    return (
                      <span
                        key={idx}
                        className={`transition-colors duration-150 ${
                          isMatched 
                            ? 'text-success' 
                            : isErrorWord 
                              ? 'text-error underline decoration-error' 
                              : 'text-white'
                        }`}
                      >
                        {word}
                      </span>
                    )
                  })
                }
                
                // Default: show full content
                return <span>{line.content}</span>
              }
              
              // Larger text for fullscreen mode
              const fontSize = isFullscreen 
                ? Math.max(teleprompterSettings.fontSize * 1.5, 20) 
                : teleprompterSettings.fontSize
              
              return (
                <div
                  key={line.id}
                  data-line={i}
                  className={`leading-relaxed transition-all duration-300 ${
                    isCurrentSceneLine
                      ? isUserLine 
                        ? `font-semibold bg-accent/40 rounded-md px-2 py-1 -mx-1 ${isFullscreen ? 'scale-100 py-3 px-4' : 'scale-105'} origin-left`
                        : `text-ai font-semibold bg-ai/30 rounded-md px-2 py-1 -mx-1 ${isFullscreen ? 'py-3 px-4' : ''}`
                      : isPastLine 
                        ? 'text-white/25 scale-95 origin-left'
                        : isUserLine ? 'text-white/70' : 'text-white/50 italic'
                  }`}
                  style={{ fontSize }}
                >
                  {teleprompterSettings.showLineNumbers && (
                    <span className="text-xs opacity-40 mr-2 font-mono">{i + 1}</span>
                  )}
                  <span className={`text-xs mr-1.5 ${isCurrentSceneLine ? 'opacity-80' : 'opacity-50'}`}>
                    {isUserLine ? '▸' : `${line.character_name}:`}
                  </span>
                  {renderLineContent()}
                </div>
              )
            })}
          </div>
        </div>
        
        {/* STT status and transcript */}
        {teleprompterSettings.mode === 'stt' && isRecording && !isPaused && (
          <div className={`${isFullscreen ? 'mx-6 mb-4' : isCustomPosition ? 'absolute bottom-0 left-0 right-0' : 'mx-3 mt-1'} px-3 py-2 backdrop-blur-sm text-sm rounded-lg flex items-center gap-2 ${
            hasWordError ? 'bg-error/40 text-error/80' : 'bg-success/40 text-success/80'
          }`}>
            <div className={`w-2.5 h-2.5 rounded-full animate-pulse flex-shrink-0 ${hasWordError ? 'bg-error' : 'bg-success'}`} />
            <span className="truncate font-medium">
              {sttTranscript || 'Listening...'}
            </span>
            {matchedWordCount > 0 && (
              <span className="ml-auto text-white/60">{matchedWordCount} words</span>
            )}
          </div>
        )}
        
        {/* Fullscreen toggle button (in non-fullscreen modes) */}
        {!isFullscreen && (
          <button
            onClick={() => setTeleprompterSettings(s => ({ ...s, position: 'fullscreen' }))}
            className="absolute top-1 right-1 p-1.5 rounded-lg bg-black/60 hover:bg-black/80 transition-colors z-10"
          >
            <svg className="w-4 h-4 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
        )}
        
        {/* Resize handle (only in custom mode) */}
        {isCustomPosition && (
          <div 
            className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize touch-none flex items-center justify-center"
            onMouseDown={handleTeleprompterResizeStart}
            onTouchStart={handleTeleprompterResizeStart}
          >
            <svg className="w-3 h-3 text-white/60" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22 22H20V20H22V22ZM22 18H20V16H22V18ZM18 22H16V20H18V22ZM22 14H20V12H22V14ZM18 18H16V16H18V18ZM14 22H12V20H14V22Z"/>
            </svg>
          </div>
        )}
      </div>
    )
  }

  // ============================================================================
  // RENDER: FRAMING GUIDES
  // ============================================================================
  
  const renderFramingGuides = () => {
    if (!recordingSettings.showGrid && !recordingSettings.showEyeline && !recordingSettings.showHeadroom) return null
    
    return (
      <div className="absolute inset-0 pointer-events-none z-10">
        {/* Rule of Thirds Grid */}
        {recordingSettings.showGrid && recordingSettings.gridType === 'thirds' && (
          <svg className="absolute inset-0 w-full h-full">
            <line x1="33.33%" y1="0" x2="33.33%" y2="100%" stroke="white" strokeOpacity="0.3" strokeWidth="1" />
            <line x1="66.66%" y1="0" x2="66.66%" y2="100%" stroke="white" strokeOpacity="0.3" strokeWidth="1" />
            <line x1="0" y1="33.33%" x2="100%" y2="33.33%" stroke="white" strokeOpacity="0.3" strokeWidth="1" />
            <line x1="0" y1="66.66%" x2="100%" y2="66.66%" stroke="white" strokeOpacity="0.3" strokeWidth="1" />
            <circle cx="33.33%" cy="33.33%" r="4" fill="white" fillOpacity="0.4" />
            <circle cx="66.66%" cy="33.33%" r="4" fill="white" fillOpacity="0.4" />
            <circle cx="33.33%" cy="66.66%" r="4" fill="white" fillOpacity="0.4" />
            <circle cx="66.66%" cy="66.66%" r="4" fill="white" fillOpacity="0.4" />
          </svg>
        )}
        
        {/* Center Grid */}
        {recordingSettings.showGrid && recordingSettings.gridType === 'center' && (
          <svg className="absolute inset-0 w-full h-full">
            <line x1="50%" y1="0" x2="50%" y2="100%" stroke="white" strokeOpacity="0.4" strokeWidth="1" strokeDasharray="8,8" />
            <line x1="0" y1="50%" x2="100%" y2="50%" stroke="white" strokeOpacity="0.4" strokeWidth="1" strokeDasharray="8,8" />
            <circle cx="50%" cy="50%" r="6" fill="none" stroke="white" strokeOpacity="0.5" strokeWidth="1" />
          </svg>
        )}
        
        {/* Eyeline Guide */}
        {recordingSettings.showEyeline && (
          <div className="absolute left-0 right-0" style={{ top: '30%' }}>
            <div className="flex items-center justify-center gap-2">
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-yellow-400/50 to-transparent" />
              <span className="text-[10px] text-warning/70 px-1">EYELINE</span>
              <div className="flex-1 h-px bg-gradient-to-l from-transparent via-yellow-400/50 to-transparent" />
            </div>
          </div>
        )}
        
        {/* Headroom Guide */}
        {recordingSettings.showHeadroom && (
          <div className="absolute left-0 right-0" style={{ top: '8%' }}>
            <div className="flex items-center justify-center gap-2">
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />
              <span className="text-[10px] text-cyan-400/60 px-1">HEADROOM</span>
              <div className="flex-1 h-px bg-gradient-to-l from-transparent via-cyan-400/40 to-transparent" />
            </div>
          </div>
        )}
        
        {/* Safe Zone */}
        {recordingSettings.showSafeZone && (
          <div className="absolute inset-0 m-[5%] border border-dashed border-white/20 rounded" />
        )}
      </div>
    )
  }


  // ============================================================================
  // RENDER: SETTINGS PANEL
  // ============================================================================
  
  const renderSettings = () => (
    <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} className="absolute inset-0 bg-bg z-50 overflow-y-auto">
      <div className="p-4 pb-20">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button onClick={() => setViewMode('record')} className="p-2 -mr-2"><Icons.X /></button>
        </div>

        {/* Camera */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-text-muted mb-3">Camera</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-text-muted mb-1 block">Resolution</label>
              <div className="grid grid-cols-3 gap-2">
                {(['720p', '1080p', '4K'] as const).map(r => (
                  <button key={r} onClick={() => setRecordingSettings(s => ({ ...s, resolution: r }))}
                    className={`py-2 rounded-lg text-sm font-medium ${recordingSettings.resolution === r ? 'bg-accent text-white' : 'bg-bg-surface'}`}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-text-muted mb-1 block">Aspect Ratio</label>
              <div className="grid grid-cols-4 gap-2">
                {(['16:9', '9:16', '4:3', '1:1'] as const).map(r => (
                  <button key={r} onClick={() => setRecordingSettings(s => ({ ...s, aspectRatio: r }))}
                    className={`py-2 rounded-lg text-sm font-medium ${recordingSettings.aspectRatio === r ? 'bg-accent text-white' : 'bg-bg-surface'}`}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-text-muted mb-1 block">Frame Rate</label>
              <div className="grid grid-cols-3 gap-2">
                {([24, 30, 60] as const).map(f => (
                  <button key={f} onClick={() => setRecordingSettings(s => ({ ...s, frameRate: f }))}
                    className={`py-2 rounded-lg text-sm font-medium ${recordingSettings.frameRate === f ? 'bg-accent text-white' : 'bg-bg-surface'}`}>
                    {f}fps
                  </button>
                ))}
              </div>
            </div>
            <Toggle value={recordingSettings.mirror} onChange={(v) => setRecordingSettings(s => ({ ...s, mirror: v }))} label="Mirror Preview" />
          </div>
        </div>

        {/* Recording */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-text-muted mb-3">Recording</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-text-muted mb-1 block">Countdown: {recordingSettings.countdown}s</label>
              <input type="range" min={0} max={10} value={recordingSettings.countdown} 
                onChange={(e) => setRecordingSettings(s => ({ ...s, countdown: +e.target.value }))}
                className="w-full accent-accent" />
            </div>
          </div>
        </div>

        {/* Teleprompter */}
        {selectedScriptForRecording && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-text-muted mb-3">Teleprompter</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-text-muted mb-1 block">Mode</label>
                <div className="grid grid-cols-4 gap-2">
                  {([{ v: 'off', l: 'Off' }, { v: 'manual', l: 'Manual' }, { v: 'timed', l: 'Timed' }, { v: 'stt', l: 'Voice' }] as const).map(m => (
                    <button key={m.v} onClick={() => setTeleprompterSettings(s => ({ ...s, mode: m.v as any }))}
                      className={`py-2 rounded-lg text-sm font-medium ${teleprompterSettings.mode === m.v ? 'bg-ai text-white' : 'bg-bg-surface'}`}>
                      {m.l}
                    </button>
                  ))}
                </div>
              </div>
              {teleprompterSettings.mode !== 'off' && (
                <>
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">Position</label>
                    <div className="grid grid-cols-3 gap-2">
                      {([{ v: 'top', l: 'Top' }, { v: 'bottom', l: 'Bottom' }, { v: 'custom', l: 'Custom' }] as const).map(p => (
                        <button key={p.v} onClick={() => setTeleprompterSettings(s => ({ ...s, position: p.v as any }))}
                          className={`py-2 rounded-lg text-sm font-medium ${teleprompterSettings.position === p.v ? 'bg-ai text-white' : 'bg-bg-surface'}`}>
                          {p.l}
                        </button>
                      ))}
                    </div>
                    {teleprompterSettings.position === 'custom' && (
                      <p className="text-xs text-text-muted mt-1">Drag to move, corner to resize</p>
                    )}
                  </div>
                  {teleprompterSettings.mode === 'timed' && (
                    <div>
                      <label className="text-xs text-text-muted mb-1 block">Speed: {teleprompterSettings.speed}%</label>
                      <input type="range" min={10} max={100} value={teleprompterSettings.speed}
                        onChange={(e) => setTeleprompterSettings(s => ({ ...s, speed: +e.target.value }))}
                        className="w-full accent-ai" />
                    </div>
                  )}
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">Font Size: {teleprompterSettings.fontSize}px</label>
                    <input type="range" min={10} max={28} value={teleprompterSettings.fontSize}
                      onChange={(e) => setTeleprompterSettings(s => ({ ...s, fontSize: +e.target.value }))}
                      className="w-full accent-ai" />
                  </div>
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">Opacity: {teleprompterSettings.opacity}%</label>
                    <input type="range" min={40} max={100} value={teleprompterSettings.opacity}
                      onChange={(e) => setTeleprompterSettings(s => ({ ...s, opacity: +e.target.value }))}
                      className="w-full accent-ai" />
                  </div>
                  <Toggle 
                    value={teleprompterSettings.showLineNumbers} 
                    onChange={(v) => setTeleprompterSettings(s => ({ ...s, showLineNumbers: v }))} 
                    label="Show line numbers" 
                  />
                </>
              )}
            </div>
          </div>
        )}

        {/* Scene Partner */}
        {selectedScriptForRecording && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-text-muted mb-3">Scene Partner (AI Reader)</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm">Play other characters</span>
                  <p className="text-xs text-text-muted">AI reads scene partner lines</p>
                </div>
                <Toggle value={recordingSettings.playReaderAudio} onChange={(v) => setRecordingSettings(s => ({ ...s, playReaderAudio: v }))} />
              </div>
              {recordingSettings.playReaderAudio && (
                <>
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">Volume: {recordingSettings.readerVolume}%</label>
                    <input type="range" min={20} max={100} value={recordingSettings.readerVolume}
                      onChange={(e) => setRecordingSettings(s => ({ ...s, readerVolume: +e.target.value }))}
                      className="w-full accent-accent" />
                  </div>
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">
                      Speech Speed: {recordingSettings.partnerSpeechRate.toFixed(1)}x
                    </label>
                    <input type="range" min={0.5} max={2} step={0.1} value={recordingSettings.partnerSpeechRate}
                      onChange={(e) => setRecordingSettings(s => ({ ...s, partnerSpeechRate: +e.target.value }))}
                      className="w-full accent-accent" />
                  </div>
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">
                      Response Delay: {recordingSettings.partnerResponseDelay === 0 ? 'Instant' : `${recordingSettings.partnerResponseDelay}ms`}
                    </label>
                    <input type="range" min={0} max={2000} step={100} value={recordingSettings.partnerResponseDelay}
                      onChange={(e) => setRecordingSettings(s => ({ ...s, partnerResponseDelay: +e.target.value }))}
                      className="w-full accent-accent" />
                    <div className="flex justify-between text-xs text-text-muted mt-1">
                      <span>Instant</span>
                      <span>Natural</span>
                      <span>Slow</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Framing Guides */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-text-muted mb-3">Framing Guides</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">Grid Overlay</span>
              <Toggle value={recordingSettings.showGrid} onChange={(v) => setRecordingSettings(s => ({ ...s, showGrid: v }))} />
            </div>
            {recordingSettings.showGrid && (
              <div className="grid grid-cols-3 gap-2">
                {([{ v: 'thirds', l: 'Thirds' }, { v: 'center', l: 'Center' }, { v: 'golden', l: 'Golden' }] as const).map(g => (
                  <button key={g.v} onClick={() => setRecordingSettings(s => ({ ...s, gridType: g.v }))}
                    className={`py-1.5 rounded text-xs ${recordingSettings.gridType === g.v ? 'bg-accent text-white' : 'bg-bg-surface'}`}>
                    {g.l}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm">Eyeline Guide</span>
              <Toggle value={recordingSettings.showEyeline} onChange={(v) => setRecordingSettings(s => ({ ...s, showEyeline: v }))} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Headroom Guide</span>
              <Toggle value={recordingSettings.showHeadroom} onChange={(v) => setRecordingSettings(s => ({ ...s, showHeadroom: v }))} />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )


  // ============================================================================
  // RENDER: TAKES REVIEW
  // ============================================================================
  
  const renderTakesReview = () => (
    <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="absolute inset-0 bg-bg z-50 flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <button onClick={() => { setViewMode('record'); setSelectedTake(null); setIsPlaying(false) }} className="p-1"><Icons.ChevronLeft /></button>
          <h2 className="text-lg font-semibold">Takes ({takes.length})</h2>
        </div>
      </div>

      {selectedTake && (
        <div className="p-4 border-b border-border bg-bg-elevated">
          {/* Video preview - tap to open fullscreen */}
          <button 
            onClick={() => setTakePreviewModal(selectedTake)}
            className={`w-full ${isLandscape ? 'aspect-video' : 'aspect-[9/16]'} bg-black rounded-xl overflow-hidden relative max-h-[35vh]`}
          >
            <video 
              ref={reviewVideoRef} 
              playsInline
              webkit-playsinline="true"
              preload="metadata"
              src={selectedTake.remoteUrl || selectedTake.url}
              className="w-full h-full object-contain" 
              onEnded={() => setIsPlaying(false)} 
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center">
                <Icons.Play />
              </div>
            </div>
            <div className="absolute bottom-2 right-2 px-2 py-1 rounded bg-black/70 text-xs">
              Tap to expand
            </div>
          </button>
          
          <div className="flex items-center justify-between mt-3">
            <div>
              <div className="font-medium">Take #{selectedTake.number}</div>
              <div className="text-sm text-text-muted">{formatTime(selectedTake.duration)}</div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => toggleStarTake(selectedTake.id)} className={`p-2 rounded-lg ${selectedTake.starred ? 'text-warning' : 'text-text-muted'}`}>
                <Icons.Star filled={selectedTake.starred} />
              </button>
              <button onClick={() => uploadTake(selectedTake)} disabled={selectedTake.uploaded || uploading === selectedTake.id}
                className={`p-2 rounded-lg ${selectedTake.uploaded ? 'text-success' : 'text-text-muted'}`}>
                {uploading === selectedTake.id ? <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" /> 
                  : selectedTake.uploaded ? <Icons.Check /> : <Icons.Upload />}
              </button>
              <button onClick={() => downloadTake(selectedTake)} className="p-2 rounded-lg text-text-muted"><Icons.Download /></button>
              <button onClick={() => deleteTake(selectedTake.id)} className="p-2 rounded-lg text-error"><Icons.Trash /></button>
            </div>
          </div>
          
          {/* Notes section */}
          <div className="mt-3 pt-3 border-t border-border">
            {editingTakeNotes === selectedTake.id ? (
              <div className="space-y-2">
                <textarea
                  value={tempNotes}
                  onChange={(e) => setTempNotes(e.target.value)}
                  placeholder="Add notes about this take..."
                  className="w-full p-3 bg-bg-surface rounded-lg border border-border text-sm resize-none"
                  rows={3}
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <button 
                    onClick={() => { setEditingTakeNotes(null); setTempNotes('') }}
                    className="px-3 py-1.5 text-sm text-text-muted hover:text-text"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => saveTakeNotes(selectedTake.id, tempNotes)}
                    className="px-3 py-1.5 text-sm bg-accent text-white rounded-lg"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setEditingTakeNotes(selectedTake.id); setTempNotes(selectedTake.notes || '') }}
                className="w-full text-left"
              >
                {selectedTake.notes ? (
                  <div>
                    <div className="text-xs text-text-muted mb-1">Notes</div>
                    <div className="text-sm text-text">{selectedTake.notes}</div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-text-muted hover:text-text">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Add notes
                  </div>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {takes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted">
            <Icons.Camera />
            <p className="mt-2">No takes yet</p>
          </div>
        ) : (
          <div className={`grid ${isLandscape ? 'grid-cols-4' : 'grid-cols-2'} gap-3`}>
            {takes.map(take => (
              <button key={take.id} onClick={() => setSelectedTake(take)}
                className={`rounded-xl overflow-hidden border-2 text-left ${selectedTake?.id === take.id ? 'border-accent' : 'border-transparent'}`}>
                <div className={`${take.isPortrait ? 'aspect-[9/16]' : 'aspect-video'} bg-bg-surface relative`}>
                  {take.thumbnail ? <img src={take.thumbnail} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Icons.Camera /></div>}
                  {take.starred && <div className="absolute top-1 right-1 text-warning"><Icons.Star filled /></div>}
                  {take.uploaded && <div className="absolute top-1 left-1 text-success"><Icons.Check /></div>}
                  {take.notes && <div className="absolute bottom-1 left-1 text-text-muted"><svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></div>}
                  <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/70 text-xs">{formatTime(take.duration)}</div>
                </div>
                <div className="p-2 bg-bg-surface">
                  <div className="text-sm font-medium">Take #{take.number}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      
      {/* Fullscreen Take Preview Modal */}
      <AnimatePresence>
        {takePreviewModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 bg-black/80 relative z-10">
              <div>
                <div className="font-medium text-white">Take #{takePreviewModal.number}</div>
                <div className="text-sm text-text-muted">{formatTime(takePreviewModal.duration)}</div>
              </div>
              <button
                onClick={() => setTakePreviewModal(null)}
                className="p-2 rounded-lg bg-white/10 text-white"
              >
                <Icons.X />
              </button>
            </div>
            
            {/* Video - Professional player with mobile compatibility */}
            <div className="flex-1 flex items-center justify-center bg-black relative">
              <video
                key={takePreviewModal.id}
                controls
                autoPlay
                playsInline
                webkit-playsinline="true"
                x-webkit-airplay="allow"
                preload="auto"
                controlsList="nodownload"
                className="w-full h-full object-contain"
                style={{ maxHeight: 'calc(100vh - 160px)' }}
                // Use src directly for blob URLs (better mobile compatibility)
                src={takePreviewModal.remoteUrl || takePreviewModal.url}
                onLoadedMetadata={(e) => {
                  const video = e.currentTarget
                  console.log('[VideoPlayer] Loaded metadata, duration:', video.duration, 'readyState:', video.readyState, 'src:', video.currentSrc?.substring(0, 50))
                }}
                onCanPlay={(e) => {
                  console.log('[VideoPlayer] Can play, attempting autoplay...')
                  e.currentTarget.play().catch(err => console.log('[VideoPlayer] Autoplay blocked:', err))
                }}
                onError={(e) => {
                  const video = e.currentTarget
                  const errorCode = video.error?.code
                  const errorMsg = video.error?.message
                  console.error('[VideoPlayer] Error:', errorCode, errorMsg, 'src:', video.currentSrc?.substring(0, 50))
                  
                  // If remote URL failed, try blob URL as fallback
                  if (takePreviewModal.remoteUrl && video.currentSrc === takePreviewModal.remoteUrl && takePreviewModal.url) {
                    console.log('[VideoPlayer] Remote URL failed, trying blob URL...')
                    video.src = takePreviewModal.url
                    video.load()
                  }
                }}
                onWaiting={() => console.log('[VideoPlayer] Waiting/buffering...')}
                onPlaying={() => console.log('[VideoPlayer] Playing')}
              />
              
              {/* Loading indicator */}
              {!takePreviewModal.remoteUrl && takePreviewModal.uploaded === false && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <div className="flex flex-col items-center gap-2 text-white">
                    <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span className="text-sm">Uploading...</span>
                  </div>
                </div>
              )}
            </div>
            
            {/* Actions */}
            <div className="flex items-center justify-center gap-4 p-4 bg-black/80 relative z-10">
              <button
                onClick={() => toggleStarTake(takePreviewModal.id)}
                className={`p-3 rounded-full ${takePreviewModal.starred ? 'bg-warning-muted text-warning' : 'bg-white/10 text-white'}`}
              >
                <Icons.Star filled={takePreviewModal.starred} />
              </button>
              <button
                onClick={() => downloadTake(takePreviewModal)}
                className="p-3 rounded-full bg-white/10 text-white"
              >
                <Icons.Download />
              </button>
              <button
                onClick={() => {
                  if (confirm('Delete this take?')) {
                    deleteTake(takePreviewModal.id)
                    setTakePreviewModal(null)
                  }
                }}
                className="p-3 rounded-full bg-white/10 text-error"
              >
                <Icons.Trash />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )

  // ============================================================================
  // RENDER: ALL RECORDINGS
  // ============================================================================
  
  const renderAllRecordings = () => {
    // Filter by selected script if coming from "By Project"
    const filteredRecordings = selectedScriptForRecording 
      ? savedRecordings.filter(r => r.script_id === selectedScriptForRecording.id)
      : savedRecordings
    
    const groupedByScript = filteredRecordings.reduce((acc, r) => {
      const key = r.script_id || 'quick'
      if (!acc[key]) acc[key] = []
      acc[key].push(r)
      return acc
    }, {} as Record<string, SavedRecording[]>)
    
    const title = selectedScriptForRecording 
      ? selectedScriptForRecording.title 
      : 'All Recordings'
    
    return (
      <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="absolute inset-0 bg-bg z-50 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <button onClick={() => { setViewMode('select'); setSelectedScriptForRecording(null) }} className="p-1"><Icons.ChevronLeft /></button>
            <h2 className="text-lg font-semibold truncate">{title}</h2>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Quick Recordings */}
          {groupedByScript['quick']?.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-text-muted mb-3 flex items-center gap-2">
                <Icons.Video />
                Quick Recordings
              </h3>
              <div className="space-y-2">
                {groupedByScript['quick'].map(recording => (
                  <RecordingItem key={recording.id} recording={recording} onDelete={deleteSavedRecording} />
                ))}
              </div>
            </div>
          )}
          
          {/* Script Recordings */}
          {Object.entries(groupedByScript)
            .filter(([key]) => key !== 'quick')
            .map(([scriptId, recordings]) => (
              <div key={scriptId}>
                <h3 className="text-sm font-medium text-text-muted mb-3 flex items-center gap-2">
                  <Icons.Script />
                  {recordings[0].script?.title || 'Unknown Script'}
                  {recordings[0].script?.user_role && (
                    <span className="text-accent text-xs">({recordings[0].script.user_role})</span>
                  )}
                </h3>
                <div className="space-y-2">
                  {recordings.map(recording => (
                    <RecordingItem key={recording.id} recording={recording} onDelete={deleteSavedRecording} />
                  ))}
                </div>
              </div>
            ))}
          
          {savedRecordings.length === 0 && (
            <div className="text-center py-12 text-text-muted">
              <Icons.Folder />
              <p className="mt-2">No recordings saved yet</p>
            </div>
          )}
        </div>
      </motion.div>
    )
  }

  // ============================================================================
  // MAIN RENDER
  // ============================================================================
  
  // Show selection screen if not in record mode
  if (viewMode === 'select') {
    return renderSelectionScreen()
  }
  
  // Recording interface - FULLSCREEN with overlay controls
  return (
    <div className="h-full bg-black relative overflow-hidden no-select">
      {/* Camera Feed - FULLSCREEN */}
      <div className="absolute inset-0">
        {cameraError ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center p-6 max-w-sm">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent/20 flex items-center justify-center">
                <Icons.Camera />
              </div>
              
              {cameraError === 'tap_to_enable' ? (
                <>
                  <h3 className="text-lg font-semibold text-text mb-2">Enable Camera & Microphone</h3>
                  <p className="text-text-muted text-sm mb-6">
                    SceneRead needs access to your camera and microphone to record self-tapes.
                  </p>
                  <Button onClick={requestCameraPermission} className="w-full">
                    Enable Camera & Microphone
                  </Button>
                </>
              ) : permissionState === 'denied' ? (
                <>
                  <h3 className="text-lg font-semibold text-text mb-2">Permission Denied</h3>
                  <p className="text-text-muted text-sm mb-4">{cameraError}</p>
                  <div className="space-y-3 text-left">
                    <p className="text-xs text-text-subtle">
                      <strong>Android Chrome:</strong> Tap the lock icon in the address bar → Site settings → Allow Camera and Microphone
                    </p>
                    <p className="text-xs text-text-subtle">
                      <strong>Or:</strong> Go to Chrome Settings → Site settings → Camera/Microphone → Find sceneread.app and Allow
                    </p>
                  </div>
                  <Button variant="secondary" className="mt-4 w-full" onClick={() => window.location.reload()}>
                    Try Again
                  </Button>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-semibold text-text mb-2">Camera Access Required</h3>
                  <p className="text-text-muted text-sm mb-4">{cameraError}</p>
                  <Button onClick={requestCameraPermission} className="w-full">
                    Enable Camera & Microphone
                  </Button>
                </>
              )}
            </div>
          </div>
        ) : (
          <>
            <video
              ref={videoRefCallback}
              autoPlay playsInline muted
              className="absolute inset-0 w-full h-full object-cover will-change-transform"
              style={{ 
                transform: recordingSettings.mirror ? 'scaleX(-1)' : 'none',
                WebkitBackfaceVisibility: 'hidden',
                backfaceVisibility: 'hidden',
              }}
            />
            
            {!cameraReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
                <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            
            {renderFramingGuides()}
            {renderTeleprompter()}
            
            {/* Countdown */}
            <AnimatePresence>
              {countdown !== null && (
                <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 2, opacity: 0 }}
                  className="absolute inset-0 flex items-center justify-center bg-black/60 z-30">
                  <span className="text-8xl font-bold">{countdown}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>

      {/* Recording indicator - TOP OVERLAY */}
      {isRecording && (
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-20 safe-area-top">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60">
            <div className="w-3 h-3 rounded-full bg-error animate-pulse" />
            <span className="text-sm font-mono">{formatTime(recordingTime)}</span>
          </div>
          <div className="flex items-center gap-2">
            {sceneState === 'partner-speaking' && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-ai/80">
                <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                <span className="text-xs text-white">Partner</span>
              </div>
            )}
            {sceneState === 'user-speaking' && (
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${hasWordError ? 'bg-error/80' : matchedWordCount > 0 ? 'bg-success/80' : 'bg-accent/80'}`}>
                {teleprompterSettings.mode === 'stt' && matchedWordCount > 0 && (
                  <span className="text-xs text-white font-mono">{matchedWordCount}</span>
                )}
                <span className="text-xs text-white">Your line</span>
              </div>
            )}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60">
              <Icons.Mic />
              <div className="w-12 h-2 bg-white/20 rounded-full overflow-hidden">
                <div className="h-full bg-success rounded-full transition-all" style={{ width: `${Math.min(100, audioLevel * 50)}%` }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top bar when not recording - OVERLAY */}
      {!isRecording && cameraReady && (
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-20 safe-area-top">
          <button onClick={() => setViewMode('select')} className="flex items-center gap-2 px-3 py-2 rounded-full bg-black/60">
            <Icons.ChevronLeft />
            <span className="text-sm">Back</span>
          </button>
          <div className="flex items-center gap-2">
            {/* TEST MODE TOGGLE */}
            <button 
              onClick={() => setSimpleRecordMode(s => !s)}
              className={`px-3 py-2 rounded-full text-xs font-mono ${simpleRecordMode ? 'bg-success/80 text-white' : 'bg-black/60 text-text-muted'}`}
            >
              {simpleRecordMode ? 'SIMPLE' : 'CANVAS'}
            </button>
            <button onClick={() => setViewMode('review')} className="flex items-center gap-2 px-3 py-2 rounded-full bg-black/60">
              <Icons.Grid />
              <span className="text-sm">{takes.length}</span>
            </button>
            <button onClick={() => setRecordingSettings(s => ({ ...s, showGrid: !s.showGrid }))}
              className={`p-2 rounded-full bg-black/60 ${recordingSettings.showGrid ? 'text-warning' : ''}`}>
              <Icons.GridLines />
            </button>
            {cameras.length > 1 && (
              <button onClick={() => {
                const i = cameras.findIndex(c => c.deviceId === selectedCamera)
                setSelectedCamera(cameras[(i + 1) % cameras.length].deviceId)
              }} className="p-2 rounded-full bg-black/60">
                <Icons.Camera />
              </button>
            )}
            <button onClick={() => setRecordingSettings(s => ({ ...s, mirror: !s.mirror }))}
              className={`p-2 rounded-full bg-black/60 ${recordingSettings.mirror ? 'text-accent' : ''}`}>
              <Icons.Flip />
            </button>
            <button onClick={() => setViewMode('settings')} className="p-2 rounded-full bg-black/60">
              <Icons.Settings />
            </button>
          </div>
        </div>
      )}
      
      {/* Script info - small pill at top center when recording with script */}
      {selectedScriptForRecording && !isRecording && cameraReady && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20">
          <div className="px-3 py-1 rounded-full bg-black/60 text-center">
            <span className="text-xs text-white/80">{selectedScriptForRecording.title}</span>
            {selectedScriptForRecording.user_role && (
              <span className="text-xs text-accent ml-1">• {selectedScriptForRecording.user_role}</span>
            )}
          </div>
        </div>
      )}

      {/* Bottom Controls - OVERLAY */}
      <div className="absolute bottom-0 left-0 right-0 z-20 safe-area-bottom">
        <div className="flex items-center justify-center gap-8 pb-6 pt-4">
          {/* Spacer for balance */}
          <div className="p-3 w-11" />
          
          <button
            onClick={() => isRecording ? stopRecording() : startRecording()}
            disabled={!cameraReady}
            className={`w-20 h-20 rounded-full flex items-center justify-center transition-transform active:scale-95 ${
              isRecording ? 'bg-error' : 'bg-white'
            } disabled:opacity-50 shadow-lg`}
          >
            {isRecording ? <Icons.Stop /> : <div className="w-7 h-7 rounded-full bg-error" />}
          </button>
          
          {selectedScriptForRecording ? (
            <button
              onClick={() => setTeleprompterSettings(s => ({ ...s, mode: s.mode === 'off' ? 'stt' : 'off' }))}
              className={`p-3 rounded-full active:scale-95 ${teleprompterSettings.mode !== 'off' ? 'bg-ai text-white' : 'bg-black/60'}`}
            >
              <Icons.Teleprompter />
            </button>
          ) : (
            <div className="p-3 rounded-full bg-transparent w-11" /> 
          )}
        </div>
        
        {/* Manual teleprompter nav */}
        {teleprompterSettings.mode === 'manual' && scriptLines.length > 0 && !isRecording && (
          <div className="flex items-center justify-center gap-4 pb-4">
            <button onClick={() => setSceneLineIndex(i => Math.max(0, i - 1))} disabled={sceneLineIndex === 0} className="p-2 bg-black/60 rounded-lg disabled:opacity-50">
              <Icons.ChevronLeft />
            </button>
            <span className="text-sm text-white/70">{sceneLineIndex + 1} / {scriptLines.length}</span>
            <button onClick={() => setSceneLineIndex(i => Math.min(scriptLines.length - 1, i + 1))} disabled={sceneLineIndex >= scriptLines.length - 1} className="p-2 bg-black/60 rounded-lg disabled:opacity-50">
              <Icons.ChevronRight />
            </button>
          </div>
        )}
      </div>

      {/* Panels */}
      <AnimatePresence>
        {viewMode === 'settings' && renderSettings()}
        {viewMode === 'review' && renderTakesReview()}
        {viewMode === 'recordings' && renderAllRecordings()}
      </AnimatePresence>
    </div>
  )
}

// ============================================================================
// RECORDING ITEM COMPONENT
// ============================================================================

function RecordingItem({ recording, onDelete }: { recording: SavedRecording; onDelete: (id: string) => void }) {
  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`
  
  return (
    <div className="flex items-center gap-3 p-3 bg-bg-surface rounded-lg border border-border">
      {/* Thumbnail */}
      <div className="w-20 h-12 rounded bg-bg-elevated overflow-hidden flex-shrink-0">
        {recording.thumbnail_url ? (
          <img src={recording.thumbnail_url} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-text-muted">
            <Icons.Video />
          </div>
        )}
      </div>
      
      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-text truncate">
          {recording.title || `Take ${recording.take_number}`}
        </div>
        <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5">
          <Icons.Clock />
          <span>{formatTime(recording.duration_seconds)}</span>
          <span>·</span>
          <span>{new Date(recording.created_at).toLocaleDateString()}</span>
        </div>
      </div>
      
      {/* Actions */}
      <div className="flex items-center gap-1">
        {recording.is_favorite && (
          <div className="p-1.5 text-warning">
            <Icons.Star filled />
          </div>
        )}
        <a
          href={recording.video_url}
          download
          className="p-1.5 text-text-muted hover:text-text"
          onClick={e => e.stopPropagation()}
        >
          <Icons.Download />
        </a>
        <button
          onClick={() => onDelete(recording.id)}
          className="p-1.5 text-text-muted hover:text-error"
        >
          <Icons.Trash />
        </button>
      </div>
    </div>
  )
}
