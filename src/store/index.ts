import { create } from 'zustand'
import { Script, Scene, Line, Character, getAuthHeaders } from '@/lib/supabase'

// === PRACTICE SETTINGS (Global defaults) ===
export interface PracticeSettings {
  playSoundOnCorrect: boolean
  playSoundOnWrong: boolean
  speakErrorFeedback: boolean
  autoAdvanceOnCorrect: boolean
  autoAdvanceDelay: number
  autoStartRecording: boolean
  silenceDuration: number
  showLiveTranscript: boolean
  showAccuracyScore: boolean
  strictMode: boolean
  aiVoice: string
  aiVoiceSpeed: number
  playbackSpeed: number
  textVisibility: 'full' | 'first-letter' | 'blurred' | 'hidden'
  playYourTurnCue: boolean
  autoRepeatOnWrong: boolean
  playMyLine: boolean
  visibilityBeforeSpeaking: 'full' | 'first-letter' | 'blurred' | 'hidden'
  visibilityAfterSpeaking: 'full' | 'first-letter' | 'blurred' | 'hidden'
  useBeforeAfterVisibility: boolean
  waitForMeDelay: number
  coldReadTime: number
  cueOnlyWords: number
  repeatFullLineTimes: number // How many times to repeat full line at end (1-4)
  speakCharacterNames: boolean // Whether to announce character names before lines
  speakParentheticals: boolean // Whether to narrate parenthetical directions (e.g., "(angrily)")
  usePreGeneratedAudio: boolean // Whether to use pre-generated audio URLs when available
  restartOnFail: boolean // Start from beginning of scene on fail
  repeatFullLineOnFail: boolean // Repeat the full line (not segment) on fail
  randomOrder: boolean // Shuffle user lines for memorization training
  partnerSpeedVariation: boolean // Randomly vary AI partner's speaking speed
  colorTheme: 'dark' | 'light'
}

// === PER-SCRIPT PRACTICE STATE ===
export interface ScriptPracticeState {
  scriptId: string
  sceneIndex: number
  lineIndex: number
  learningMode: 'listen' | 'repeat' | 'practice' | 'speedrun' | 'cueonly' | 'random' | 'coldread' | 'emotion'
  playbackSpeed: number
  textVisibility: 'full' | 'first-letter' | 'blurred' | 'hidden'
  includeDirections: boolean
  directionsMode: 'spoken' | 'shown' | 'muted'
  loop: boolean
  completedLineIds: string[]
  correctCount: number
  wrongCount: number
  currentSegmentIndex: number
  buildProgress: number
  speedRunBestTime?: number
  lastPracticedAt: string
  totalPracticeTimeMs: number
}

// Extended Profile with settings
export interface Profile {
  id: string
  full_name: string | null
  email?: string | null
  avatar_url: string | null
  subscription_tier: string
  streak_days: number
  streak_last_date: string | null
  total_practice_minutes: number
  total_lines_practiced: number
  onboarding_complete?: boolean
  settings?: PracticeSettings
  script_states?: Record<string, ScriptPracticeState>
  recording_settings?: RecordingSettings
  slate_info?: SlateInfo
  teleprompter_settings?: TeleprompterSettings
  created_at: string
}

// === RECORDING SETTINGS ===
export interface RecordingSettings {
  resolution: '1080p' | '720p' | '4K'
  aspectRatio: '16:9' | '9:16' | '4:3' | '1:1'
  frameRate: 24 | 30 | 60
  mirror: boolean
  countdown: number
  maxDuration: number
  autoStop: boolean
  showGrid: boolean
  gridType: 'thirds' | 'center' | 'golden'
  showEyeline: boolean
  showHeadroom: boolean
  showSafeZone: boolean
  playReaderAudio: boolean
  readerVolume: number
  waitForMe: boolean
  partnerResponseDelay: number
  partnerSpeechRate: number
}

export interface SlateInfo {
  actorName: string
  agentName: string
  role: string
  projectTitle: string
  sceneNumber: string
  takeNumber: number
  date: string
  showSlate: boolean
  slateStyle: 'minimal' | 'classic' | 'modern' | 'broadcast'
  height: string
  location: string
  email: string
  phone: string
  slateDuration: number
  castingNotes: string
}

export interface TeleprompterSettings {
  mode: 'off' | 'manual' | 'timed' | 'stt'
  speed: number
  fontSize: number
  position: 'top' | 'bottom' | 'custom' | 'fullscreen'
  opacity: number
  highlightCurrentLine: boolean
  showLineNumbers: boolean
  customX: number
  customY: number
  customWidth: number
  customHeight: number
}

export const defaultRecordingSettings: RecordingSettings = {
  resolution: '1080p',
  aspectRatio: '9:16',
  frameRate: 30,
  mirror: true,
  countdown: 3,
  maxDuration: 300,
  autoStop: false,
  showGrid: true,
  gridType: 'thirds',
  showEyeline: false,
  showHeadroom: false,
  showSafeZone: false,
  playReaderAudio: true,
  readerVolume: 80,
  waitForMe: true,
  partnerResponseDelay: 500,
  partnerSpeechRate: 1.0,
}

export const defaultSlateInfo: SlateInfo = {
  actorName: '',
  agentName: '',
  role: '',
  projectTitle: '',
  sceneNumber: '',
  takeNumber: 1,
  date: new Date().toLocaleDateString(),
  showSlate: true,
  slateStyle: 'modern',
  height: '',
  location: '',
  email: '',
  phone: '',
  slateDuration: 3,
  castingNotes: '',
}

export const defaultTeleprompterSettings: TeleprompterSettings = {
  mode: 'off',
  speed: 50,
  fontSize: 16,
  position: 'bottom',
  opacity: 90,
  highlightCurrentLine: true,
  showLineNumbers: false,
  customX: 20,
  customY: 100,
  customWidth: 300,
  customHeight: 150,
}

export const defaultSettings: PracticeSettings = {
  playSoundOnCorrect: true,
  playSoundOnWrong: true,
  speakErrorFeedback: true,
  autoAdvanceOnCorrect: true,
  autoAdvanceDelay: 50,
  autoStartRecording: true,
  silenceDuration: 1500,
  showLiveTranscript: true,
  showAccuracyScore: false,
  strictMode: false,
  aiVoice: 'rachel',
  aiVoiceSpeed: 1.0,
  playbackSpeed: 1.0,
  textVisibility: 'full',
  playYourTurnCue: true,
  autoRepeatOnWrong: false,
  playMyLine: false,
  visibilityBeforeSpeaking: 'first-letter',
  visibilityAfterSpeaking: 'full',
  useBeforeAfterVisibility: false,
  waitForMeDelay: 150,
  coldReadTime: 3,
  cueOnlyWords: 0,
  repeatFullLineTimes: 1,
  speakCharacterNames: false,
  speakParentheticals: false,
  usePreGeneratedAudio: true,
  restartOnFail: false,
  repeatFullLineOnFail: false,
  randomOrder: false,
  partnerSpeedVariation: false,
  colorTheme: 'dark',
}

const defaultScriptState = (scriptId: string): ScriptPracticeState => ({
  scriptId,
  sceneIndex: 0,
  lineIndex: 0,
  learningMode: 'listen',
  playbackSpeed: 1.0,
  textVisibility: 'full',
  includeDirections: true,
  directionsMode: 'shown',
  loop: false,
  completedLineIds: [],
  correctCount: 0,
  wrongCount: 0,
  currentSegmentIndex: 0,
  buildProgress: 0,
  speedRunBestTime: undefined,
  lastPracticedAt: new Date().toISOString(),
  totalPracticeTimeMs: 0,
})

// Debounce helper for saving to Supabase
let saveTimeout: NodeJS.Timeout | null = null
const debouncedSave = (userId: string, data: { settings?: PracticeSettings; script_states?: Record<string, ScriptPracticeState> }) => {
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(async () => {
    try {
      const headers = await getAuthHeaders()
      await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(data)
      })
    } catch (err) {
      console.error('Failed to save settings to Supabase:', err)
    }
  }, 500) // 500ms debounce
}

// === SETTINGS STORE ===
interface SettingsState {
  settings: PracticeSettings
  userId: string | null
  updateSettings: (partial: Partial<PracticeSettings>) => void
  resetSettings: () => void
  hydrate: (userId: string, savedSettings?: PracticeSettings) => void
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: defaultSettings,
  userId: null,
  updateSettings: (partial) => {
    const newSettings = { ...get().settings, ...partial }
    set({ settings: newSettings })
    // Save to Supabase
    const userId = get().userId
    if (userId) {
      debouncedSave(userId, { settings: newSettings })
    }
  },
  resetSettings: () => {
    set({ settings: defaultSettings })
    const userId = get().userId
    if (userId) {
      debouncedSave(userId, { settings: defaultSettings })
    }
  },
  hydrate: (userId, savedSettings) => {
    set({ 
      userId,
      settings: savedSettings ? { ...defaultSettings, ...savedSettings } : defaultSettings 
    })
  },
}))

// === SCRIPT PRACTICE STATE STORE ===
interface ScriptPracticeStore {
  scriptStates: Record<string, ScriptPracticeState>
  sessionStartTime: number | null
  userId: string | null
  
  getScriptState: (scriptId: string) => ScriptPracticeState
  updateScriptState: (scriptId: string, partial: Partial<ScriptPracticeState>) => void
  savePosition: (scriptId: string, sceneIndex: number, lineIndex: number) => void
  saveLearningMode: (scriptId: string, mode: 'practice' | 'listen' | 'repeat' | 'speedrun' | 'cueonly' | 'random' | 'coldread' | 'emotion') => void
  saveScriptSettings: (scriptId: string, settings: {
    playbackSpeed?: number
    textVisibility?: 'full' | 'first-letter' | 'blurred' | 'hidden'
    includeDirections?: boolean
    directionsMode?: 'spoken' | 'shown' | 'muted'
    loop?: boolean
  }) => void
  markLineCompleted: (scriptId: string, lineId: string) => void
  recordAttempt: (scriptId: string, correct: boolean) => void
  saveRepeatProgress: (scriptId: string, segmentIndex: number, buildProgress: number) => void
  resetScriptProgress: (scriptId: string) => void
  startSession: () => void
  endSession: (scriptId: string) => void
  hydrate: (userId: string, savedStates?: Record<string, ScriptPracticeState>) => void
  clearAll: () => void
}

export const useScriptPractice = create<ScriptPracticeStore>((set, get) => ({
  scriptStates: {},
  sessionStartTime: null,
  userId: null,
  
  getScriptState: (scriptId) => {
    const states = get().scriptStates
    if (states[scriptId]) return states[scriptId]
    return defaultScriptState(scriptId)
  },
  
  updateScriptState: (scriptId, partial) => {
    const states = get().scriptStates
    const current = states[scriptId] || defaultScriptState(scriptId)
    const updated = { 
      ...current, 
      ...partial, 
      lastPracticedAt: new Date().toISOString() 
    }
    const newStates = { ...states, [scriptId]: updated }
    set({ scriptStates: newStates })
    // Save to Supabase
    const userId = get().userId
    if (userId) {
      debouncedSave(userId, { script_states: newStates })
    }
  },
  
  savePosition: (scriptId, sceneIndex, lineIndex) => {
    get().updateScriptState(scriptId, { sceneIndex, lineIndex })
  },
  
  saveLearningMode: (scriptId, mode) => {
    get().updateScriptState(scriptId, { learningMode: mode })
  },
  
  saveScriptSettings: (scriptId, settings) => {
    get().updateScriptState(scriptId, settings)
  },
  
  markLineCompleted: (scriptId, lineId) => {
    const state = get().getScriptState(scriptId)
    if (!state.completedLineIds.includes(lineId)) {
      get().updateScriptState(scriptId, {
        completedLineIds: [...state.completedLineIds, lineId]
      })
    }
  },
  
  recordAttempt: (scriptId, correct) => {
    const state = get().getScriptState(scriptId)
    get().updateScriptState(scriptId, {
      correctCount: state.correctCount + (correct ? 1 : 0),
      wrongCount: state.wrongCount + (correct ? 0 : 1)
    })
  },
  
  saveRepeatProgress: (scriptId, segmentIndex, buildProgress) => {
    get().updateScriptState(scriptId, { currentSegmentIndex: segmentIndex, buildProgress })
  },
  
  resetScriptProgress: (scriptId) => {
    const states = get().scriptStates
    const newStates = { ...states, [scriptId]: defaultScriptState(scriptId) }
    set({ scriptStates: newStates })
    const userId = get().userId
    if (userId) {
      debouncedSave(userId, { script_states: newStates })
    }
  },
  
  startSession: () => {
    set({ sessionStartTime: Date.now() })
  },
  
  endSession: (scriptId) => {
    const startTime = get().sessionStartTime
    if (startTime) {
      const duration = Date.now() - startTime
      const state = get().getScriptState(scriptId)
      get().updateScriptState(scriptId, {
        totalPracticeTimeMs: state.totalPracticeTimeMs + duration
      })
    }
    set({ sessionStartTime: null })
  },
  
  hydrate: (userId, savedStates) => {
    set({ 
      userId,
      scriptStates: savedStates || {} 
    })
  },
  
  clearAll: () => {
    set({ scriptStates: {}, sessionStartTime: null })
    const userId = get().userId
    if (userId) {
      debouncedSave(userId, { script_states: {} })
    }
  },
}))

// === APP STATE ===
interface AppState {
  user: Profile | null
  setUser: (user: Profile | null) => void
  scripts: Script[]
  setScripts: (scripts: Script[]) => void
  currentScript: Script | null
  setCurrentScript: (script: Script | null) => void
  scenes: Scene[]
  setScenes: (scenes: Scene[]) => void
  currentScene: Scene | null
  setCurrentScene: (scene: Scene | null) => void
  lines: Line[]
  setLines: (lines: Line[]) => void
  characters: Character[]
  setCharacters: (characters: Character[]) => void
  currentLineIndex: number
  setCurrentLineIndex: (index: number) => void
  isPlaying: boolean
  setIsPlaying: (playing: boolean) => void
  practiceMode: 'full' | 'cue' | 'memory'
  setPracticeMode: (mode: 'full' | 'cue' | 'memory') => void
  selectedVoice: string
  setSelectedVoice: (voice: string) => void
  voiceSpeed: number
  setVoiceSpeed: (speed: number) => void
  voiceStability: number
  setVoiceStability: (stability: number) => void
  isRecording: boolean
  setIsRecording: (recording: boolean) => void
  activeTab: 'home' | 'library' | 'practice' | 'record' | 'voices' | 'insights' | 'profile'
  setActiveTab: (tab: 'home' | 'library' | 'practice' | 'record' | 'voices' | 'insights' | 'profile') => void
  getVoiceForCharacter: (characterName: string) => string | null
}

export const useStore = create<AppState>((set, get) => ({
  user: null,
  setUser: (user) => {
    set({ user })
    // Hydrate settings and script states when user is set
    if (user) {
      useSettings.getState().hydrate(user.id, user.settings)
      useScriptPractice.getState().hydrate(user.id, user.script_states)
      useRecordingSettings.getState().hydrate(user.id, {
        recording_settings: user.recording_settings,
        slate_info: user.slate_info,
        teleprompter_settings: user.teleprompter_settings,
      })
    }
  },
  scripts: [],
  setScripts: (scripts) => set({ scripts: Array.isArray(scripts) ? scripts : [] }),
  currentScript: null,
  setCurrentScript: (script) => set({ currentScript: script }),
  scenes: [],
  setScenes: (scenes) => set({ scenes }),
  currentScene: null,
  setCurrentScene: (scene) => set({ currentScene: scene }),
  lines: [],
  setLines: (lines) => set({ lines }),
  characters: [],
  setCharacters: (characters) => set({ characters }),
  currentLineIndex: 0,
  setCurrentLineIndex: (index) => set({ currentLineIndex: index }),
  isPlaying: false,
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  practiceMode: 'full',
  setPracticeMode: (mode) => set({ practiceMode: mode }),
  selectedVoice: 'rachel',
  setSelectedVoice: (voice) => set({ selectedVoice: voice }),
  voiceSpeed: 100,
  setVoiceSpeed: (speed) => set({ voiceSpeed: speed }),
  voiceStability: 75,
  setVoiceStability: (stability) => set({ voiceStability: stability }),
  isRecording: false,
  setIsRecording: (recording) => set({ isRecording: recording }),
  activeTab: 'home',
  setActiveTab: (tab) => set({ activeTab: tab }),
  getVoiceForCharacter: (characterName: string) => {
    const char = get().characters.find(c => c.name === characterName)
    return char?.voice_id || null
  },
}))

// === RECORDING SETTINGS STORE ===
interface RecordingSettingsState {
  recordingSettings: RecordingSettings
  slateInfo: SlateInfo
  teleprompterSettings: TeleprompterSettings
  userId: string | null
  updateRecordingSettings: (partial: Partial<RecordingSettings>) => void
  updateSlateInfo: (partial: Partial<SlateInfo>) => void
  updateTeleprompterSettings: (partial: Partial<TeleprompterSettings>) => void
  hydrate: (userId: string, saved?: { 
    recording_settings?: RecordingSettings
    slate_info?: SlateInfo
    teleprompter_settings?: TeleprompterSettings
  }) => void
}

// Debounced save for recording settings
let recordingSaveTimeout: NodeJS.Timeout | null = null
const debouncedRecordingSave = (userId: string, data: { 
  recording_settings?: RecordingSettings
  slate_info?: SlateInfo
  teleprompter_settings?: TeleprompterSettings
}) => {
  if (recordingSaveTimeout) clearTimeout(recordingSaveTimeout)
  recordingSaveTimeout = setTimeout(async () => {
    try {
      const headers = await getAuthHeaders()
      await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(data)
      })
      console.log('[RecordingSettings] Saved to Supabase')
    } catch (err) {
      console.error('[RecordingSettings] Failed to save:', err)
    }
  }, 500)
}

export const useRecordingSettings = create<RecordingSettingsState>((set, get) => ({
  recordingSettings: defaultRecordingSettings,
  slateInfo: defaultSlateInfo,
  teleprompterSettings: defaultTeleprompterSettings,
  userId: null,
  
  updateRecordingSettings: (partial) => {
    const newSettings = { ...get().recordingSettings, ...partial }
    set({ recordingSettings: newSettings })
    const userId = get().userId
    if (userId) {
      debouncedRecordingSave(userId, { recording_settings: newSettings })
    }
  },
  
  updateSlateInfo: (partial) => {
    const newSlate = { ...get().slateInfo, ...partial }
    set({ slateInfo: newSlate })
    const userId = get().userId
    if (userId) {
      debouncedRecordingSave(userId, { slate_info: newSlate })
    }
  },
  
  updateTeleprompterSettings: (partial) => {
    const newSettings = { ...get().teleprompterSettings, ...partial }
    set({ teleprompterSettings: newSettings })
    const userId = get().userId
    if (userId) {
      debouncedRecordingSave(userId, { teleprompter_settings: newSettings })
    }
  },
  
  hydrate: (userId, saved) => {
    set({
      userId,
      recordingSettings: saved?.recording_settings 
        ? { ...defaultRecordingSettings, ...saved.recording_settings }
        : defaultRecordingSettings,
      slateInfo: saved?.slate_info
        ? { ...defaultSlateInfo, ...saved.slate_info }
        : defaultSlateInfo,
      teleprompterSettings: saved?.teleprompter_settings
        ? { ...defaultTeleprompterSettings, ...saved.teleprompter_settings }
        : defaultTeleprompterSettings,
    })
  },
}))
