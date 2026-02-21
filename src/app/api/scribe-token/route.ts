import { NextResponse } from 'next/server'

export async function POST() {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY
    
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
    }

    // Generate a single-use token for Scribe v2 Realtime
    // Endpoint: POST /v1/single-use-token/:token_type
    // token_type can be: realtime_scribe or tts_websocket
    const response = await fetch('https://api.elevenlabs.io/v1/single-use-token/realtime_scribe', {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('ElevenLabs token error:', response.status, errorText)
      return NextResponse.json({ error: 'Failed to get token', details: errorText }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json({ token: data.token })
  } catch (error: any) {
    console.error('Token generation error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
