// API endpoints for n8n workflows
const N8N_BASE_URL = 'https://n8n.textflow.com.au/webhook'

export const api = {
  // Import a script - supports both file upload and raw text (v14)
  async importScript(options: {
    userId: string
    userRole: string
    userGender?: string
    rawText?: string
    file?: File
    title?: string
    scriptType?: string
    selectedPages?: number[]
    accentHint?: string
  }) {
    const { userId, userRole, userGender, rawText, file, title, scriptType, selectedPages, accentHint } = options
    
    if (file) {
      // File upload - use multipart/form-data
      const formData = new FormData()
      formData.append('file', file)
      formData.append('userId', userId)
      formData.append('userRole', userRole)
      if (userGender) formData.append('userGender', userGender)
      if (title) formData.append('title', title)
      if (scriptType) formData.append('scriptType', scriptType)
      if (selectedPages && selectedPages.length > 0) {
        formData.append('selectedPages', JSON.stringify(selectedPages))
      }
      if (accentHint) formData.append('accentHint', accentHint)
      
      const response = await fetch(`${N8N_BASE_URL}/sceneread-upload-v14`, {
        method: 'POST',
        body: formData,
      })
      
      if (!response.ok) throw new Error('Failed to import script')
      return response.json()
    } else if (rawText) {
      const response = await fetch(`${N8N_BASE_URL}/sceneread-upload-v14`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId, 
          userRole,
          userGender,
          rawText,
          title,
          scriptType,
          accentHint
        }),
      })
      
      if (!response.ok) throw new Error('Failed to import script')
      return response.json()
    } else {
      throw new Error('No file or text provided')
    }
  },

  // Check audio generation status
  async checkAudioStatus(scriptId: string) {
    const response = await fetch(`${N8N_BASE_URL}/sceneread-audio-status?scriptId=${scriptId}`)
    if (!response.ok) throw new Error('Failed to check audio status')
    return response.json()
  },

  // Poll audio status until complete
  async pollAudioStatus(
    scriptId: string, 
    onProgress?: (progress: number, status: string) => void,
    intervalMs: number = 2000,
    maxAttempts: number = 150
  ): Promise<{ status: string; progress: number }> {
    let attempts = 0
    
    return new Promise((resolve, reject) => {
      const checkStatus = async () => {
        try {
          attempts++
          const result = await api.checkAudioStatus(scriptId)
          
          if (onProgress) {
            onProgress(result.audioProgress || 0, result.audioStatus || 'processing')
          }
          
          if (result.audioStatus === 'completed') {
            resolve({ status: 'completed', progress: 100 })
          } else if (result.audioStatus === 'failed') {
            reject(new Error('Audio generation failed'))
          } else if (attempts >= maxAttempts) {
            reject(new Error('Audio generation timed out'))
          } else {
            setTimeout(checkStatus, intervalMs)
          }
        } catch (error) {
          if (attempts >= maxAttempts) {
            reject(error)
          } else {
            setTimeout(checkStatus, intervalMs)
          }
        }
      }
      
      checkStatus()
    })
  },

  // Batch generate audio for all lines in a script (Google Chirp v11)
  async generateBatchAudio(scriptId: string) {
    const response = await fetch(`${N8N_BASE_URL}/sceneread-batch-audio-v11`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scriptId }),
    })
    if (!response.ok) throw new Error('Failed to start batch audio generation')
    return response.json()
  },

  // Transcribe audio
  async transcribeSpeech(audioBlob: Blob) {
    const base64 = await blobToBase64(audioBlob)
    const response = await fetch(`${N8N_BASE_URL}/sceneread-transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audio: base64,
        mimeType: audioBlob.type || 'audio/webm'
      }),
    })
    if (!response.ok) throw new Error('Failed to transcribe speech')
    return response.json()
  },

  // Check line accuracy
  async checkAccuracy(expectedText: string, spokenText: string, strictMode: boolean = true) {
    const response = await fetch(`${N8N_BASE_URL}/sceneread-accuracy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedText, spokenText, strictMode }),
    })
    if (!response.ok) throw new Error('Failed to check accuracy')
    return response.json()
  },
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const base64 = reader.result as string
      resolve(base64.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

// ============================================================================
// GOOGLE CHIRP 3 HD VOICES
// All voices are generated via n8n batch workflow - no live TTS
// ============================================================================

export interface Voice {
  id: string           // Google Chirp voice ID (e.g., en-AU-Chirp3-HD-Rasalgethi)
  name: string         // Display name
  gender: 'F' | 'M'
  archetype: string    // Character type this voice suits
}

// Google Chirp 3 HD voice library
export const VOICES: Voice[] = [
  // Female voices
  { id: 'Achernar', name: 'Achernar', gender: 'F', archetype: 'Love Interest / Mother' },
  { id: 'Aoede', name: 'Aoede', gender: 'F', archetype: 'Protagonist / Friend' },
  { id: 'Autonoe', name: 'Autonoe', gender: 'F', archetype: 'Mentor / Therapist' },
  { id: 'Callirrhoe', name: 'Callirrhoe', gender: 'F', archetype: 'Antagonist / Dramatic' },
  { id: 'Despina', name: 'Despina', gender: 'F', archetype: 'Comic Relief / Best Friend' },
  { id: 'Erinome', name: 'Erinome', gender: 'F', archetype: 'Romantic / Vulnerable' },
  { id: 'Gacrux', name: 'Gacrux', gender: 'F', archetype: 'Authority / Boss' },
  { id: 'Kore', name: 'Kore', gender: 'F', archetype: 'Protagonist / Young Adult' },
  { id: 'Laomedeia', name: 'Laomedeia', gender: 'F', archetype: 'Sophisticated / Executive' },
  { id: 'Leda', name: 'Leda', gender: 'F', archetype: 'Narrator / Doctor' },
  { id: 'Pulcherrima', name: 'Pulcherrima', gender: 'F', archetype: 'Aristocrat / Elegant' },
  { id: 'Sulafat', name: 'Sulafat', gender: 'F', archetype: 'Friend / Sister' },
  { id: 'Vindemiatrix', name: 'Vindemiatrix', gender: 'F', archetype: 'Antagonist / Villain' },
  { id: 'Zephyr', name: 'Zephyr', gender: 'F', archetype: 'Free Spirit / Artistic' },
  
  // Male voices
  { id: 'Achird', name: 'Achird', gender: 'M', archetype: 'Protagonist / Everyman' },
  { id: 'Algenib', name: 'Algenib', gender: 'M', archetype: 'Executive / Lawyer' },
  { id: 'Algieba', name: 'Algieba', gender: 'M', archetype: 'Comic Relief / Sidekick' },
  { id: 'Alnilam', name: 'Alnilam', gender: 'M', archetype: 'Authority / Father' },
  { id: 'Charon', name: 'Charon', gender: 'M', archetype: 'Narrator / Mysterious' },
  { id: 'Enceladus', name: 'Enceladus', gender: 'M', archetype: 'Therapist / Doctor' },
  { id: 'Fenrir', name: 'Fenrir', gender: 'M', archetype: 'Antagonist / Villain' },
  { id: 'Iapetus', name: 'Iapetus', gender: 'M', archetype: 'Love Interest / Romantic' },
  { id: 'Orus', name: 'Orus', gender: 'M', archetype: 'Protagonist / Hero' },
  { id: 'Puck', name: 'Puck', gender: 'M', archetype: 'Young Adult / Comic Relief' },
  { id: 'Rasalgethi', name: 'Rasalgethi', gender: 'M', archetype: 'Narrator / Storyteller' },
  { id: 'Sadachbia', name: 'Sadachbia', gender: 'M', archetype: 'Friend / Colleague' },
  { id: 'Sadaltager', name: 'Sadaltager', gender: 'M', archetype: 'Intellectual / Academic' },
  { id: 'Schedar', name: 'Schedar', gender: 'M', archetype: 'Authority / Military' },
  { id: 'Umbriel', name: 'Umbriel', gender: 'M', archetype: 'Villain / Mysterious' },
  { id: 'Zubenelgenubi', name: 'Zubenelgenubi', gender: 'M', archetype: 'Reliable / Father Figure' },
]

// Get voice by name
export function getVoiceByName(name: string): Voice | undefined {
  return VOICES.find(v => v.name.toLowerCase() === name.toLowerCase())
}

// Get voices filtered by gender
export function getVoicesByGender(gender: 'F' | 'M'): Voice[] {
  return VOICES.filter(v => v.gender === gender)
}

// Get voices filtered by archetype
export function getVoicesByArchetype(archetype: string): Voice[] {
  return VOICES.filter(v => v.archetype.toLowerCase().includes(archetype.toLowerCase()))
}

// Supported accents for Google Chirp 3 HD
export const ACCENTS = [
  { code: 'en-AU', name: 'Australian' },
  { code: 'en-GB', name: 'British' },
  { code: 'en-US', name: 'American' },
  { code: 'en-IN', name: 'Indian' },
] as const

// Build full voice ID from voice name and accent
export function buildVoiceId(voiceName: string, accentCode: string = 'en-AU'): string {
  return `${accentCode}-Chirp3-HD-${voiceName}`
}
