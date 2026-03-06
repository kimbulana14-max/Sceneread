import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const key = process.env.AZURE_SPEECH_KEY
    const region = process.env.AZURE_SPEECH_REGION

    if (!key || !region) {
      return NextResponse.json(
        { error: 'AZURE_SPEECH_KEY and AZURE_SPEECH_REGION must be set in .env.local' },
        { status: 500 }
      )
    }

    const formData = await request.formData()
    const audio = formData.get('audio') as Blob | null
    const referenceText = formData.get('referenceText') as string | null

    if (!audio) {
      return NextResponse.json({ error: 'No audio provided' }, { status: 400 })
    }
    if (!referenceText) {
      return NextResponse.json({ error: 'No referenceText provided' }, { status: 400 })
    }

    // Build pronunciation assessment config (base64-encoded JSON in header)
    const pronConfig = {
      ReferenceText: referenceText,
      GradingSystem: 'HundredMark',
      Granularity: 'Word',
      Dimension: 'Comprehensive',
      EnableMiscue: true,
    }
    const pronHeaderValue = Buffer.from(JSON.stringify(pronConfig)).toString('base64')

    // Convert audio blob to ArrayBuffer for the request body
    const audioBuffer = await audio.arrayBuffer()

    // Client sends WAV (converted from webm for full pronunciation assessment support)
    const mimeType = audio.type || 'audio/wav'
    let contentType = 'audio/wav'
    if (mimeType.includes('webm')) {
      contentType = 'audio/webm; codecs=opus'
    } else if (mimeType.includes('mp4') || mimeType.includes('m4a') || mimeType.includes('aac')) {
      contentType = 'audio/mp4'
    } else if (mimeType.includes('ogg')) {
      contentType = 'audio/ogg; codecs=opus'
    }

    // Call Azure Speech SDK REST endpoint for pronunciation assessment
    const url = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US&format=detailed`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Pronunciation-Assessment': pronHeaderValue,
        'Content-Type': contentType,
        'Accept': 'application/json',
      },
      body: audioBuffer,
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Azure PA] Failed:', response.status, errorText)
      return NextResponse.json(
        { error: 'Azure PA failed', status: response.status, details: errorText },
        { status: response.status }
      )
    }

    const result = await response.json()

    // Extract the pronunciation assessment from the NBest results
    const nBest = result.NBest?.[0]
    const words = nBest?.Words?.map((w: any) => ({
      word: w.Word,
      accuracyScore: w.PronunciationAssessment?.AccuracyScore ?? null,
      errorType: w.PronunciationAssessment?.ErrorType ?? 'None',
    })) || []

    return NextResponse.json({
      recognitionStatus: result.RecognitionStatus,
      displayText: result.DisplayText,
      overall: {
        accuracyScore: nBest?.PronunciationAssessment?.AccuracyScore ?? null,
        fluencyScore: nBest?.PronunciationAssessment?.FluencyScore ?? null,
        completenessScore: nBest?.PronunciationAssessment?.CompletenessScore ?? null,
        pronScore: nBest?.PronunciationAssessment?.PronScore ?? null,
      },
      words,
      // Include raw response for debugging
      raw: result,
    })
  } catch (error) {
    console.error('[Azure PA] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
