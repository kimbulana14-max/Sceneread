'use client'

import { useState } from 'react'
import { useOpenAIRealtime } from '@/hooks/useOpenAIRealtime'

export default function TestOpenAI() {
  const [transcript, setTranscript] = useState('')
  const [committed, setCommitted] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const openai = useOpenAIRealtime({
    onPartialTranscript: (data) => {
      console.log('Partial:', data.text)
      setTranscript(data.text)
    },
    onCommittedTranscript: (data) => {
      console.log('Committed:', data.text)
      setCommitted(prev => [...prev, data.text])
      setTranscript('')
    },
    onSessionStarted: () => {
      console.log('Session started!')
      setError(null)
    },
    onError: (err) => {
      console.error('Error:', err)
      setError(err.message)
    },
    onDisconnect: () => {
      console.log('Disconnected')
    },
  })

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-2xl font-bold mb-4">OpenAI Realtime Transcription Test</h1>
      <p className="text-gray-400 mb-4">
        Testing filler word preservation with prompt: "Umm, let me think like, hmm... mhm, uh-huh, mm-hmm"
      </p>
      
      <div className="flex gap-4 mb-6">
        <button
          onClick={() => openai.startSession()}
          disabled={openai.isConnected}
          className="px-4 py-2 bg-green-600 rounded disabled:opacity-50"
        >
          Start Recording
        </button>
        <button
          onClick={() => openai.stopSession()}
          disabled={!openai.isConnected}
          className="px-4 py-2 bg-red-600 rounded disabled:opacity-50"
        >
          Stop Recording
        </button>
      </div>

      <div className="mb-4">
        <span className={`inline-block px-2 py-1 rounded text-sm ${openai.isConnected ? 'bg-green-600' : 'bg-gray-600'}`}>
          {openai.isConnected ? '🎤 Connected & Listening' : 'Not Connected'}
        </span>
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-500 rounded p-4 mb-4">
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="bg-gray-800 rounded p-4 mb-4">
        <h2 className="text-lg font-semibold mb-2">Live Transcript:</h2>
        <p className="text-yellow-400 min-h-[2rem]">{transcript || '(speak to see transcript)'}</p>
      </div>

      <div className="bg-gray-800 rounded p-4">
        <h2 className="text-lg font-semibold mb-2">Committed Transcripts:</h2>
        {committed.length === 0 ? (
          <p className="text-gray-500">(completed utterances will appear here)</p>
        ) : (
          <ul className="space-y-2">
            {committed.map((text, i) => (
              <li key={i} className="text-green-400">✓ {text}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-8 text-gray-500 text-sm">
        <p>Try saying things like:</p>
        <ul className="list-disc list-inside mt-2">
          <li>"Mmm-hmm"</li>
          <li>"Uh-huh, I understand"</li>
          <li>"I don't know, um, maybe we should wait"</li>
          <li>"Hmm, let me think about that"</li>
        </ul>
      </div>
    </div>
  )
}
