import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY

    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
    }

    const formData = await request.formData()
    const audio = formData.get('audio') as Blob | null
    const prompt = formData.get('prompt') as string | null

    if (!audio) {
      return NextResponse.json({ error: 'No audio provided' }, { status: 400 })
    }

    // Detect file extension from MIME type
    const mimeType = audio.type || 'audio/webm'
    let ext = 'webm'
    if (mimeType.includes('mp4') || mimeType.includes('m4a') || mimeType.includes('aac')) {
      ext = 'mp4'  // iOS records in mp4/aac
    } else if (mimeType.includes('ogg')) {
      ext = 'ogg'
    } else if (mimeType.includes('wav')) {
      ext = 'wav'
    }

    // Build multipart form for OpenAI Whisper API
    const whisperForm = new FormData()
    whisperForm.append('file', audio, `audio.${ext}`)
    whisperForm.append('model', 'gpt-4o-transcribe')
    whisperForm.append('language', 'en')

    // Prompt biases Whisper toward expected words (max 224 tokens)
    if (prompt) {
      whisperForm.append('prompt', prompt.slice(0, 800))
    }

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: whisperForm,
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('[Whisper] Transcription failed:', response.status, error)
      return NextResponse.json({ error: 'Transcription failed', details: error }, { status: response.status })
    }

    const data = await response.json()

    return NextResponse.json({ transcript: data.text || '' })
  } catch (error) {
    console.error('[Whisper] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
