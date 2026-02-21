'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { supabase, Script, Character, Line, ELEVENLABS_VOICES, suggestVoice } from '@/lib/supabase'
import { Card, Button, Spinner } from './ui'

interface VoiceSetupProps {
  script: Script
  onComplete: () => void
  onCancel: () => void
}

export function VoiceSetup({ script, onComplete, onCancel }: VoiceSetupProps) {
  const [characters, setCharacters] = useState<Character[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [error, setError] = useState('')

  useEffect(() => {
    loadCharacters()
  }, [script.id])

  const loadCharacters = async () => {
    setLoading(true)
    
    // Get all unique character names from lines
    const { data: lines } = await supabase
      .from('lines')
      .select('character_name, is_user_line')
      .eq('script_id', script.id)
    
    if (!lines) {
      setLoading(false)
      return
    }
    
    // Get unique characters
    const uniqueChars = new Map<string, boolean>()
    lines.forEach((line: Line) => {
      if (!uniqueChars.has(line.character_name)) {
        uniqueChars.set(line.character_name, line.is_user_line)
      }
    })
    
    // Check if characters already exist in DB
    const { data: existingChars } = await supabase
      .from('characters')
      .select('*')
      .eq('script_id', script.id)
    
    if (existingChars && existingChars.length > 0) {
      setCharacters(existingChars)
    } else {
      // Create new character entries with suggested voices
      const newChars: Partial<Character>[] = []
      uniqueChars.forEach((isUser, name) => {
        const suggested = suggestVoice(name)
        newChars.push({
          script_id: script.id,
          name,
          voice_id: isUser ? null : suggested.id,
          voice_name: isUser ? null : suggested.name,
          gender: suggested.gender,
          suggested_voice_id: suggested.id,
          is_user_character: isUser,
        })
      })
      
      // Insert into DB
      const { data: inserted } = await supabase
        .from('characters')
        .insert(newChars)
        .select()
      
      if (inserted) {
        setCharacters(inserted)
      }
    }
    
    setLoading(false)
  }

  const updateVoice = async (characterId: string, voiceId: string) => {
    const voice = ELEVENLABS_VOICES.find(v => v.id === voiceId)
    if (!voice) return
    
    await supabase
      .from('characters')
      .update({ voice_id: voiceId, voice_name: voice.name })
      .eq('id', characterId)
    
    setCharacters(prev => prev.map(c => 
      c.id === characterId ? { ...c, voice_id: voiceId, voice_name: voice.name } : c
    ))
  }

  const updateGender = async (characterId: string, gender: 'male' | 'female') => {
    // Update in database
    await supabase
      .from('characters')
      .update({ gender })
      .eq('id', characterId)
    
    // Update local state and auto-suggest a matching voice
    setCharacters(prev => prev.map(c => {
      if (c.id !== characterId) return c
      
      // Get a voice suggestion for the new gender
      const suggested = suggestVoice(c.name, gender)
      
      // Also update voice if current voice doesn't match new gender
      const currentVoice = ELEVENLABS_VOICES.find(v => v.id === c.voice_id)
      const needsNewVoice = !currentVoice || currentVoice.gender !== gender
      
      if (needsNewVoice && !c.is_user_character) {
        // Update voice in DB too
        supabase
          .from('characters')
          .update({ voice_id: suggested.id, voice_name: suggested.name })
          .eq('id', characterId)
        
        return { ...c, gender, voice_id: suggested.id, voice_name: suggested.name }
      }
      
      return { ...c, gender }
    }))
  }

  const generateAllAudio = async () => {
    setGenerating(true)
    setError('')
    
    try {
      // Get all non-user lines that need audio
      const { data: lines } = await supabase
        .from('lines')
        .select('id, character_name, content')
        .eq('script_id', script.id)
        .eq('is_user_line', false)
        .is('audio_url', null)
      
      if (!lines || lines.length === 0) {
        // Already generated
        await supabase.from('scripts').update({ voices_ready: true }).eq('id', script.id)
        onComplete()
        return
      }
      
      setProgress({ current: 0, total: lines.length })
      
      // Create character -> voice map
      const voiceMap = new Map<string, string>()
      characters.forEach(c => {
        if (c.voice_id) voiceMap.set(c.name, c.voice_id)
      })
      
      // Generate audio for each line
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const voiceId = voiceMap.get(line.character_name) || ELEVENLABS_VOICES[0].id
        
        setProgress({ current: i + 1, total: lines.length })
        
        try {
          // Call n8n workflow to generate and store audio
          const response = await fetch('https://n8n.textflow.com.au/webhook/sceneread-generate-audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              lineId: line.id,
              text: line.content,
              voiceId: voiceId,
              scriptId: script.id,
            })
          })
          
          if (!response.ok) {
            console.error('Failed to generate audio for line:', line.id)
          }
        } catch (e) {
          console.error('Error generating audio:', e)
        }
        
        // Small delay to avoid rate limits
        await new Promise(r => setTimeout(r, 200))
      }
      
      // Mark script as ready
      await supabase.from('scripts').update({ voices_ready: true }).eq('id', script.id)
      
      onComplete()
    } catch (e) {
      console.error('Generation error:', e)
      setError('Failed to generate audio. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Spinner size={32} />
      </div>
    )
  }

  const nonUserCharacters = characters.filter(c => !c.is_user_character)
  const userCharacter = characters.find(c => c.is_user_character)

  return (
    <div className="h-full flex flex-col p-4 pb-24">
      {/* Header */}
      <div className="mb-4">
        <button onClick={onCancel} className="text-text-muted text-sm mb-2">← Back</button>
        <h1 className="font-display text-xl text-text">Voice Setup</h1>
        <p className="text-text-muted text-sm">{script.title}</p>
      </div>

      {/* User Character */}
      {userCharacter && (
        <Card padding="p-3" className="mb-4 bg-accent/10 border-accent/30">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-white text-sm font-bold">
              You
            </div>
            <div>
              <div className="text-sm font-medium text-text">{userCharacter.name}</div>
              <div className="text-xs text-text-muted">Your character (no voice needed)</div>
            </div>
          </div>
        </Card>
      )}

      {/* Other Characters */}
      <div className="text-xs text-text-muted uppercase tracking-wide mb-2">Scene Partners</div>
      <div className="flex-1 overflow-y-auto space-y-2 mb-4">
        {nonUserCharacters.map(char => (
          <Card key={char.id} padding="p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-ai-muted flex items-center justify-center text-ai font-bold">
                  {char.name.charAt(0)}
                </div>
                <div>
                  <div className="text-sm font-medium text-text">{char.name}</div>
                </div>
              </div>
            </div>
            
            {/* Gender Toggle */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-text-muted">Gender:</span>
              <div className="flex gap-1">
                <button
                  onClick={() => updateGender(char.id, 'male')}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                    char.gender === 'male'
                      ? 'bg-accent text-white'
                      : 'bg-bg-surface text-text-muted hover:text-text border border-border'
                  }`}
                >
                  Male
                </button>
                <button
                  onClick={() => updateGender(char.id, 'female')}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                    char.gender === 'female'
                      ? 'bg-accent text-white'
                      : 'bg-bg-surface text-text-muted hover:text-text border border-border'
                  }`}
                >
                  Female
                </button>
              </div>
            </div>
            
            {/* Voice Selection */}
            <select
              value={char.voice_id || ''}
              onChange={(e) => updateVoice(char.id, e.target.value)}
              className="w-full text-sm bg-bg-surface border border-border rounded-lg px-3 py-1.5 text-text"
            >
              <optgroup label={char.gender === 'female' ? 'Female Voices' : 'Male Voices'}>
                {ELEVENLABS_VOICES.filter(v => v.gender === char.gender).map(voice => (
                  <option key={voice.id} value={voice.id}>
                    {voice.name} ({voice.accent})
                  </option>
                ))}
              </optgroup>
              <optgroup label={char.gender === 'female' ? 'Male Voices' : 'Female Voices'}>
                {ELEVENLABS_VOICES.filter(v => v.gender !== char.gender).map(voice => (
                  <option key={voice.id} value={voice.id}>
                    {voice.name} ({voice.accent})
                  </option>
                ))}
              </optgroup>
            </select>
          </Card>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="text-red-400 text-sm mb-4">{error}</div>
      )}

      {/* Generate Button */}
      {generating ? (
        <Card padding="p-4" className="text-center">
          <Spinner size={24} className="mx-auto mb-2" />
          <div className="text-sm text-text">Generating voices...</div>
          <div className="text-xs text-text-muted mt-1">
            {progress.current} / {progress.total} lines
          </div>
          <div className="w-full bg-bg-surface rounded-full h-2 mt-2">
            <div 
              className="bg-accent h-2 rounded-full transition-all" 
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          <Button onClick={generateAllAudio} className="w-full">
            Generate All Voices
          </Button>
          <Button variant="secondary" onClick={onComplete} className="w-full">
            Skip (Generate on-the-fly)
          </Button>
        </div>
      )}
    </div>
  )
}
