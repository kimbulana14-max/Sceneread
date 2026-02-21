// Browser client for client components
import { createBrowserClient } from '@supabase/ssr'
import type { Session } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Singleton browser client
let browserClient: ReturnType<typeof createBrowserClient> | null = null

// Cache the session to avoid hanging getSession() calls
let cachedSession: Session | null = null

export const supabase = (() => {
  if (typeof window === 'undefined') {
    // Server-side: create new client (middleware handles cookies)
    return createBrowserClient(supabaseUrl, supabaseAnonKey)
  }
  // Client-side: singleton
  if (!browserClient) {
    browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey)
    
    // Listen for auth changes and cache the session
    browserClient.auth.onAuthStateChange((_event: string, session: Session | null) => {
      console.log('[Supabase] Auth state changed:', _event, session ? 'session exists' : 'no session')
      cachedSession = session
    })
  }
  return browserClient
})()

// Re-export for components that need to create fresh clients
export { createBrowserClient }
export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}

// Helper to get auth headers for REST API calls - uses cached session
export const getAuthHeaders = async () => {
  console.log('[getAuthHeaders] Using cached session:', cachedSession ? 'found' : 'null')
  
  // If no cached session, try to get it once with a timeout
  if (!cachedSession) {
    console.log('[getAuthHeaders] No cached session, trying getSession with timeout...')
    try {
      const timeoutPromise = new Promise<null>((_, reject) => 
        setTimeout(() => reject(new Error('getSession timeout')), 3000)
      )
      const sessionPromise = supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => data.session)
      cachedSession = await Promise.race([sessionPromise, timeoutPromise])
      console.log('[getAuthHeaders] Got session:', cachedSession ? 'found' : 'null')
    } catch (err) {
      console.warn('[getAuthHeaders] getSession failed/timed out, using anon key')
    }
  }
  
  return {
    'apikey': supabaseAnonKey,
    'Authorization': `Bearer ${cachedSession?.access_token || supabaseAnonKey}`,
    'Content-Type': 'application/json',
  }
}

// Types
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
  settings?: any
  script_states?: any
  created_at: string
}

export interface Script {
  id: string
  user_id: string
  title: string
  episode: string | null
  type: string
  user_role: string
  raw_content: string | null
  parsed_content: any
  page_count: number
  total_lines: number
  source_format: string | null
  is_archived: boolean
  voices_ready: boolean
  audio_status?: string
  audio_progress?: number
  format_type?: string
  show_name?: string | null
  season?: number | null
  episode_number?: number | null
  episode_title?: string | null
  scene_description?: string | null
  script_type?: string
  writer?: string | null
  status?: string
  accent_hint?: string
  created_at: string
  updated_at: string
}

export interface Scene {
  id: string
  script_id: string
  scene_number: number
  name: string
  description: string | null
  location: string | null
  time_of_day: string | null
  sort_order: number
  int_ext?: string | null
  sub_location?: string | null
}

export interface Line {
  id: string
  scene_id: string
  script_id: string
  character_name: string
  is_user_line: boolean
  content: string
  emotion_tag: string | null
  emotion?: string | null
  stage_direction: string | null
  line_number: number
  word_count: number
  sort_order: number
  audio_url: string | null
  audio_generated_at: string | null
  line_type?: string
  parenthetical?: string | null
  delivery_note?: string | null
  extension?: string | null
  is_continued?: boolean
  notes?: string | null
  cue?: string | null
  word_timepoints?: { word: string; start_time: number | null }[] | null
  practice_segments?: string[] | null
  // Additional audio URLs for narrator voice
  audio_url_name?: string | null        // Narrator speaking character name
  audio_url_parenthetical?: string | null  // Narrator speaking parenthetical direction
  audio_url_action?: string | null      // Narrator speaking action/stage direction
}

export interface Character {
  id: string
  script_id: string
  name: string
  voice_id: string | null
  voice_name: string | null
  gender: string | null
  suggested_voice_id: string | null
  is_user_character: boolean
  age_range?: string | null
  archetype?: string | null
  vocal_tone?: string | null
  accent_hint?: string | null
  description?: string | null
  default_emotion?: string | null
  created_at: string
}

export interface LinePracticeProgress {
  id: string
  user_id: string
  line_id: string
  script_id: string
  current_segment_index: number
  total_segments: number
  checkpoint_indices: number[]
  highest_checkpoint: number
  consecutive_correct: number
  total_attempts: number
  total_correct: number
  is_complete: boolean
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface PracticeSession {
  id: string
  user_id: string
  script_id: string
  scene_id: string | null
  practice_mode: string
  voice_id: string | null
  voice_settings: any
  started_at: string
  ended_at: string | null
  duration_seconds: number | null
  lines_practiced: number | null
  overall_accuracy: number | null
}

// ============================================================================
// GOOGLE CLOUD TTS VOICES - Chirp 3 HD
// ============================================================================

export interface GoogleVoice {
  id: string
  name: string
  gender: 'female' | 'male'
  archetype: string
  tone: string
  age: 'young' | 'adult' | 'mature'
}

export const GOOGLE_TTS_VOICES: GoogleVoice[] = [
  { id: 'Achernar', name: 'Achernar', gender: 'female', archetype: 'Love Interest', tone: 'Warm & Caring', age: 'adult' },
  { id: 'Aoede', name: 'Aoede', gender: 'female', archetype: 'Protagonist', tone: 'Natural & Relatable', age: 'adult' },
  { id: 'Autonoe', name: 'Autonoe', gender: 'female', archetype: 'Mentor', tone: 'Gentle & Wise', age: 'mature' },
  { id: 'Callirrhoe', name: 'Callirrhoe', gender: 'female', archetype: 'Antagonist', tone: 'Dramatic', age: 'adult' },
  { id: 'Despina', name: 'Despina', gender: 'female', archetype: 'Comic Relief', tone: 'Bright & Cheerful', age: 'young' },
  { id: 'Erinome', name: 'Erinome', gender: 'female', archetype: 'Romantic', tone: 'Soft & Vulnerable', age: 'young' },
  { id: 'Gacrux', name: 'Gacrux', gender: 'female', archetype: 'Authority', tone: 'Wise & Commanding', age: 'mature' },
  { id: 'Kore', name: 'Kore', gender: 'female', archetype: 'Young Adult', tone: 'Youthful & Fresh', age: 'young' },
  { id: 'Laomedeia', name: 'Laomedeia', gender: 'female', archetype: 'Executive', tone: 'Elegant', age: 'adult' },
  { id: 'Leda', name: 'Leda', gender: 'female', archetype: 'Narrator', tone: 'Professional & Clear', age: 'adult' },
  { id: 'Pulcherrima', name: 'Pulcherrima', gender: 'female', archetype: 'Aristocrat', tone: 'Refined', age: 'mature' },
  { id: 'Sulafat', name: 'Sulafat', gender: 'female', archetype: 'Best Friend', tone: 'Warm & Supportive', age: 'adult' },
  { id: 'Vindemiatrix', name: 'Vindemiatrix', gender: 'female', archetype: 'Villain', tone: 'Confident & Sharp', age: 'adult' },
  { id: 'Zephyr', name: 'Zephyr', gender: 'female', archetype: 'Free Spirit', tone: 'Airy & Dreamy', age: 'young' },
  { id: 'Achird', name: 'Achird', gender: 'male', archetype: 'Everyman', tone: 'Natural & Grounded', age: 'adult' },
  { id: 'Algenib', name: 'Algenib', gender: 'male', archetype: 'Executive', tone: 'Professional', age: 'adult' },
  { id: 'Algieba', name: 'Algieba', gender: 'male', archetype: 'Sidekick', tone: 'Friendly & Warm', age: 'adult' },
  { id: 'Alnilam', name: 'Alnilam', gender: 'male', archetype: 'Father Figure', tone: 'Authoritative', age: 'mature' },
  { id: 'Charon', name: 'Charon', gender: 'male', archetype: 'Narrator', tone: 'Deep & Mysterious', age: 'mature' },
  { id: 'Enceladus', name: 'Enceladus', gender: 'male', archetype: 'Therapist', tone: 'Calm & Soothing', age: 'adult' },
  { id: 'Fenrir', name: 'Fenrir', gender: 'male', archetype: 'Villain', tone: 'Strong & Intimidating', age: 'adult' },
  { id: 'Iapetus', name: 'Iapetus', gender: 'male', archetype: 'Love Interest', tone: 'Warm & Romantic', age: 'adult' },
  { id: 'Orus', name: 'Orus', gender: 'male', archetype: 'Hero', tone: 'Friendly & Likeable', age: 'adult' },
  { id: 'Puck', name: 'Puck', gender: 'male', archetype: 'Young Adult', tone: 'Energetic & Playful', age: 'young' },
  { id: 'Rasalgethi', name: 'Rasalgethi', gender: 'male', archetype: 'Narrator', tone: 'Rich & Storytelling', age: 'mature' },
  { id: 'Sadachbia', name: 'Sadachbia', gender: 'male', archetype: 'Friend', tone: 'Conversational', age: 'adult' },
  { id: 'Sadaltager', name: 'Sadaltager', gender: 'male', archetype: 'Intellectual', tone: 'Thoughtful', age: 'adult' },
  { id: 'Schedar', name: 'Schedar', gender: 'male', archetype: 'Commander', tone: 'Commanding', age: 'mature' },
  { id: 'Umbriel', name: 'Umbriel', gender: 'male', archetype: 'Mysterious', tone: 'Dark & Enigmatic', age: 'adult' },
  { id: 'Zubenelgenubi', name: 'Zubenelgenubi', gender: 'male', archetype: 'Father', tone: 'Grounded & Reliable', age: 'mature' },
]

export const EMOTION_TAGS = [
  'neutral', 'happy', 'sad', 'angry', 'excited', 'fearful', 'disgusted', 'surprised',
  'whisper', 'shouting', 'sarcastic', 'nervous', 'confident', 'pleading', 'menacing',
  'tender', 'bitter', 'hopeful', 'furious', 'devastated', 'ecstatic', 'terrified'
]

export const CHARACTER_ARCHETYPES = [
  'protagonist', 'antagonist', 'mentor', 'love_interest', 'comic_relief',
  'authority', 'friend', 'villain', 'narrator', 'sidekick', 'mysterious'
]

export const AGE_RANGES = ['young', 'adult', 'mature']

export const VOCAL_TONES = [
  'warm', 'cold', 'professional', 'friendly', 'mysterious', 'authoritative',
  'gentle', 'harsh', 'energetic', 'calm', 'dramatic', 'sarcastic'
]

export const ACCENTS = [
  { code: 'en-AU', name: 'Australian' },
  { code: 'en-GB', name: 'British' },
  { code: 'en-US', name: 'American' },
  { code: 'en-IN', name: 'Indian' },
  { code: 'vi-VN', name: 'Vietnamese' },
]

export function buildVoiceId(voiceName: string, locale: string = 'en-AU'): string {
  return `${locale}-Chirp3-HD-${voiceName}`
}

export function getVoiceByName(name: string): GoogleVoice | undefined {
  return GOOGLE_TTS_VOICES.find(v => v.name.toLowerCase() === name.toLowerCase())
}

export function suggestVoice(
  characterName: string,
  gender?: string,
  archetype?: string,
  age?: string
): GoogleVoice {
  const name = characterName.toLowerCase()
  const femaleNames = ['sarah', 'emma', 'olivia', 'ava', 'sophia', 'isabella', 'mia', 'charlotte', 'amelia', 'harper', 'evelyn', 'abigail', 'emily', 'elizabeth', 'sofia', 'ella', 'madison', 'scarlett', 'victoria', 'aria', 'grace', 'chloe', 'camila', 'luna', 'natalie', 'hannah', 'lily', 'eleanor', 'audrey', 'stella', 'claire', 'lucy', 'anna', 'caroline', 'alice', 'mary', 'kate', 'jane', 'rachel', 'jennifer', 'lisa', 'nancy', 'betty', 'helen', 'sandra', 'donna', 'carol', 'ruth', 'sharon', 'michelle', 'laura', 'jessica', 'margaret', 'dorothy', 'amy', 'angela', 'virginia', 'rebecca', 'deborah', 'stephanie', 'melissa', 'brenda', 'nicole', 'tiffany', 'maria', 'mom', 'mother', 'mum', 'wife', 'sister', 'daughter', 'aunt', 'grandmother', 'grandma', 'woman', 'girl', 'lady', 'miss', 'mrs', 'ms', 'queen', 'princess']
  const isFemale = gender === 'female' || (!gender && femaleNames.some(n => name.includes(n)))
  const targetGender = isFemale ? 'female' : 'male'
  let candidates = GOOGLE_TTS_VOICES.filter(v => v.gender === targetGender)
  if (archetype) {
    const archetypeMatches = candidates.filter(v => v.archetype.toLowerCase().includes(archetype.toLowerCase()))
    if (archetypeMatches.length > 0) candidates = archetypeMatches
  }
  if (age) {
    const ageMatches = candidates.filter(v => v.age === age)
    if (ageMatches.length > 0) candidates = ageMatches
  }
  const hash = characterName.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return candidates[hash % candidates.length] || GOOGLE_TTS_VOICES[0]
}

export const ELEVENLABS_VOICES = GOOGLE_TTS_VOICES.map(v => ({
  id: buildVoiceId(v.id),
  name: v.name,
  gender: v.gender,
  accent: 'Australian',
  style: v.tone
}))
