import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const apiKey = process.env.OPENAI_API_KEY
    
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
    }

    // GA endpoint: /v1/realtime/client_secrets with type: "transcription"
    // Using the correct GA format with audio.input structure
    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session: {
          type: 'transcription',
          audio: {
            input: {
              format: {
                type: 'audio/pcm',
                rate: 24000,
              },
              transcription: {
                model: 'gpt-4o-transcribe',
                language: 'en',
              },
              turn_detection: {
                type: 'server_vad',
                threshold: 0.5,
                prefix_padding_ms: 300,
                silence_duration_ms: 700,
              },
            },
          },
        },
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('[OpenAI Token] Failed to get client secret:', response.status, error)
      return NextResponse.json({ error: 'Failed to create session', details: error }, { status: response.status })
    }

    const data = await response.json()
    console.log('[OpenAI Token] Client secret created')
    
    // GA API returns { value: "ek_xxx", expires_at: ..., session: {...} }
    return NextResponse.json({
      client_secret: data.value,
      expires_at: data.expires_at,
    })
    
  } catch (error) {
    console.error('[OpenAI Token] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
