'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '@/store'
import { supabase, getAuthHeaders, Script, Character, ELEVENLABS_VOICES } from '@/lib/supabase'
import { api } from '@/lib/api'
import { getPDFInfo, extractPagesFromPDF, extractAllPagesFromPDF, getPDFPreview, extractScenesByIds, extractPagesAsPDF, PDFInfo, PDFPreview, DetectedScene } from '@/lib/pdfExtractor'
import PDFVisualPreview from './PDFVisualPreview'
import { Card, Badge, Button, EmptyState, Spinner } from './ui'
import { IconSearch, IconUpload, IconLibrary } from './icons'
import { triggerAchievementCheck } from '@/hooks/useAchievements'

// Extract character names from script text using regex
function extractCharactersFromText(text: string): string[] {
  if (!text) return []
  
  const lines = text.split('\n')
  const characters = new Set<string>()
  
  // Common non-character patterns to skip
  const skipPatterns = [
    'INT', 'EXT', 'INT.', 'EXT.', 'I/E',
    'FADE IN', 'FADE OUT', 'FADE TO', 'CUT TO', 'DISSOLVE TO',
    'CONTINUED', 'CONTINUOUS', 'LATER', 'MOMENTS LATER',
    'THE END', 'END', 'SCENE', 'ACT', 'COLD OPEN',
    'DAY', 'NIGHT', 'MORNING', 'EVENING', 'AFTERNOON', 'DAWN', 'DUSK',
    'FLASHBACK', 'DREAM', 'MONTAGE', 'INTERCUT', 'SUPER', 'TITLE',
    'V.O.', 'O.S.', 'O.C.', 'CONT', 'MORE', 'PRE-LAP',
    'TRACK', 'BOARD', 'ROOM', 'HALLWAY', 'OFFICE', 'HOSPITAL'
  ]
  
  // Words that indicate this is a parenthetical direction, not a character
  const directionWords = [
    'TO', 'AT', 'THE', 'INTO', 'FROM', 'WITH', 'THEN', 'BEAT', 'PAUSE',
    'LOOKING', 'TURNING', 'WALKING', 'MOVING', 'POINTING', 'GESTURING',
    'SOTTO', 'VOCE', 'QUIETLY', 'LOUDLY', 'ANGRILY', 'SOFTLY',
    'RE:', 'RE', 'REGARDING', 'ABOUT'
  ]
  
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    
    // Skip empty lines
    if (!trimmed) continue
    
    // Skip lines that start with ( - these are parentheticals/directions
    if (trimmed.startsWith('(')) continue
    
    // Skip lines that are clearly dialogue (lowercase or mixed case sentences)
    if (/^[a-z]/.test(trimmed)) continue
    
    // Character name pattern:
    // - Starts with uppercase letter
    // - Contains uppercase letters, spaces, periods, apostrophes, hyphens
    // - May end with (CONT'D), (V.O.), (O.S.), etc.
    // - Should NOT contain lowercase words (except in extensions)
    const match = trimmed.match(/^([A-Z][A-Z0-9\s.'''-]{0,35}?)(?:\s*\((?:CONT'D|CONT|V\.O\.|O\.S\.|O\.C\.|CONTINUING)\))?\s*$/)
    
    if (match) {
      let name = match[1].trim()
      
      // Clean up trailing periods or spaces
      name = name.replace(/\s+/g, ' ').replace(/\.+$/, '').trim()
      
      // Skip if too short or too long
      if (name.length < 2 || name.length > 35) continue
      
      // Skip if matches skip patterns
      if (skipPatterns.some(skip => name.toUpperCase().startsWith(skip))) continue
      
      // Skip pure numbers
      if (/^\d+$/.test(name)) continue
      
      // Skip SCENE 1, ACT 2, etc.
      if (/^(SCENE|ACT)\s+\d/i.test(name)) continue
      
      // Skip if contains direction words (likely a parenthetical that slipped through)
      const words = name.split(/\s+/)
      if (words.some(w => directionWords.includes(w.toUpperCase()))) continue
      
      // Skip if it's just one or two letters (likely a typo or abbreviation)
      if (name.replace(/[^A-Za-z]/g, '').length < 2) continue
      
      // Must be mostly uppercase (at least 80%)
      const upperCount = (name.match(/[A-Z]/g) || []).length
      const letterCount = (name.match(/[A-Za-z]/g) || []).length
      if (letterCount > 0 && upperCount / letterCount < 0.8) continue
      
      // Additional check: Look at the next line - if it's dialogue (starts with lowercase or is indented text), 
      // then this is likely a character name
      const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : ''
      const nextNextLine = i + 2 < lines.length ? lines[i + 2].trim() : ''
      
      // If next line is a parenthetical or dialogue, this is a character
      const hasDialogueFollowing = 
        nextLine.startsWith('(') || // Parenthetical
        (nextLine && /^[A-Za-z]/.test(nextLine) && !/^[A-Z]{2,}/.test(nextLine)) || // Dialogue (mixed case)
        (nextNextLine && /^[A-Za-z]/.test(nextNextLine) && !/^[A-Z]{2,}/.test(nextNextLine))
      
      // Only add if it looks like a real character (has dialogue following or is a common name format)
      if (hasDialogueFollowing || /^(DR\.|MR\.|MRS\.|MS\.|DETECTIVE|OFFICER|CAPTAIN|NURSE|AGENT)\s/.test(name) || /^[A-Z]{2,}$/.test(name)) {
        characters.add(name.toUpperCase())
      }
    }
  }
  
  // Sort alphabetically
  return Array.from(characters).sort()
}

export function LibraryScreen() {
  const { user, scripts, setScripts, setCurrentScript, setActiveTab, setScenes, setLines } = useStore()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  // Only show loading if scripts aren't already in store
  const scriptsArray = Array.isArray(scripts) ? scripts : []
  const [loading, setLoading] = useState(scriptsArray.length === 0)
  const [showImport, setShowImport] = useState(false)
  const [voiceSetupScript, setVoiceSetupScript] = useState<Script | null>(null)
  const [generatingScriptIds, setGeneratingScriptIds] = useState<Set<string>>(new Set())
  const [swipedScriptId, setSwipedScriptId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  useEffect(() => {
    fetchScripts()
  }, [user])

  const fetchScripts = async () => {
    if (!user) {
      setLoading(false)
      return
    }
    
    // Only show loading if we don't have scripts yet
    if (scriptsArray.length === 0) {
      setLoading(true)
    }
    
    try {
      // Get auth headers using session
      const headers = await getAuthHeaders()
      
      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/scripts?user_id=eq.${user.id}&is_archived=eq.false&order=updated_at.desc`
      
      // Use the user's access token for RLS
      const response = await fetch(url, { headers })
      
      if (!response.ok) throw new Error('Failed to fetch scripts')
      let data = await response.json()
      // Fetch actual line counts for scripts where total_lines is null or 0
      if (data && data.length > 0) {
        const scriptsNeedingCounts = data.filter((s: any) => !s.total_lines || s.total_lines === 0)
        if (scriptsNeedingCounts.length > 0) {
          // Fetch line counts for each script
          const countPromises = scriptsNeedingCounts.map(async (script: any) => {
            const countRes = await fetch(
              `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/lines?script_id=eq.${script.id}&select=id`,
              { headers }
            )
            if (countRes.ok) {
              const lines = await countRes.json()
              return { id: script.id, count: lines.length }
            }
            return { id: script.id, count: 0 }
          })
          
          const counts = await Promise.all(countPromises)
          const countMap = Object.fromEntries(counts.map(c => [c.id, c.count]))
          
          // Update scripts with actual counts
          data = data.map((script: any) => ({
            ...script,
            total_lines: script.total_lines || countMap[script.id] || 0,
            page_count: script.page_count || Math.max(1, Math.ceil((countMap[script.id] || 0) / 55))
          }))
        }
      }
      
      setScripts(data || [])
      
      // Check which scripts are still generating audio
      const generating = new Set<string>()
      data?.forEach((script: any) => {
        if (script.audio_status === 'processing' || (script.audio_progress > 0 && script.audio_progress < 100)) {
          generating.add(script.id)
        }
      })
      setGeneratingScriptIds(generating)
    } catch (err) {
      console.error('Error fetching scripts:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectScript = async (script: Script) => {
    setCurrentScript(script)
    
    try {
      // Get auth token for RLS
      const headers = await getAuthHeaders()
      
      const [scenesRes, linesRes, charsRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/scenes?script_id=eq.${script.id}&order=sort_order.asc`, { headers }),
        fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/lines?script_id=eq.${script.id}&order=sort_order.asc`, { headers }),
        fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/characters?script_id=eq.${script.id}`, { headers }),
      ])
      
      const scenes = scenesRes.ok ? await scenesRes.json() : []
      const lines = linesRes.ok ? await linesRes.json() : []
      const characters = charsRes.ok ? await charsRes.json() : []

      setScenes(scenes)
      setLines(lines)
      useStore.getState().setCharacters(characters)
    } catch (err) {
      console.error('Error fetching script details:', err)
    }

    setActiveTab('practice')
  }

  const handleDeleteScript = async (scriptId: string) => {
    // Store the script ID we're deleting
    const deletingId = scriptId
    
    // Close modals first
    setDeleteConfirmId(null)
    setSwipedScriptId(null)
    
    // Optimistically remove from UI immediately
    const currentScripts = Array.isArray(scripts) ? scripts : []
    const filteredScripts = currentScripts.filter(s => s.id !== deletingId)
    setScripts(filteredScripts)
    
    try {
      const headers = await getAuthHeaders()
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/scripts?id=eq.${deletingId}`, {
        method: 'DELETE',
        headers,
      })
      
      if (!response.ok) {
        console.error('Delete failed, refetching scripts')
        fetchScripts()
      }
    } catch (err) {
      console.error('Error deleting script:', err)
      fetchScripts()
    }
  }

  const handleArchiveScript = async (scriptId: string) => {
    // Optimistically remove from UI
    const currentScripts = Array.isArray(scripts) ? scripts : []
    const filteredScripts = currentScripts.filter(s => s.id !== scriptId)
    setScripts(filteredScripts)
    setSwipedScriptId(null)
    
    try {
      const headers = await getAuthHeaders()
      
      await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/scripts?id=eq.${scriptId}`, {
        method: 'PATCH',
        headers: {
          ...headers,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ is_archived: true })
      })
    } catch (err) {
      console.error('Error archiving script:', err)
      fetchScripts()
    }
  }

  const handleImportSuccess = (newScript: Script) => {
    console.log('=== handleImportSuccess called ===', newScript.id, newScript.title)
    
    // Add to scripts list immediately
    const currentScripts = Array.isArray(scripts) ? scripts : []
    const updatedScripts = [newScript, ...currentScripts.filter(s => s.id !== newScript.id)]
    setScripts(updatedScripts)
    
    // Trigger achievement check for script upload milestones
    setTimeout(() => triggerAchievementCheck(), 500)
    
    // Mark as generating audio
    setGeneratingScriptIds(prev => new Set(Array.from(prev).concat(newScript.id)))
    
    // Start polling for audio completion in background
    pollAudioCompletion(newScript.id)
  }

  const pollAudioCompletion = async (scriptId: string) => {
    try {
      await api.pollAudioStatus(
        scriptId,
        (progress, status) => {
          console.log(`[Audio] ${scriptId}: ${progress}% - ${status}`)
        },
        3000, // Poll every 3 seconds
        200   // Max ~10 minutes
      )
      
      // Audio complete - refresh and remove from generating
      setGeneratingScriptIds(prev => {
        const next = new Set(prev)
        next.delete(scriptId)
        return next
      })
      fetchScripts()
    } catch (err) {
      console.error('Audio polling failed:', err)
      setGeneratingScriptIds(prev => {
        const next = new Set(prev)
        next.delete(scriptId)
        return next
      })
    }
  }

  const filteredScripts = scriptsArray.filter(s => {
    const searchLower = search.toLowerCase()
    const matchesSearch = s.title.toLowerCase().includes(searchLower) || 
                          (s.show_name?.toLowerCase().includes(searchLower)) ||
                          (s.user_role?.toLowerCase().includes(searchLower))
    const matchesFilter = filter === 'all' || s.type === filter || s.script_type === filter
    return matchesSearch && matchesFilter
  })

  const totalLines = scriptsArray.reduce((sum, s) => sum + (s.total_lines || 0), 0)
  const totalPages = scriptsArray.reduce((sum, s) => sum + (s.page_count || 0), 0)

  // Get unique categories from scripts for dynamic filter - match scriptTypes in ImportModal
  const categories = ['all', 'tv_audition', 'film_audition', 'self_tape', 'scene_study', 'theatre', 'commercial', 'voiceover', 'monologue', 'other']
  
  // Better category display names
  const categoryLabels: Record<string, string> = {
    'all': 'All',
    'tv_audition': 'TV',
    'film_audition': 'Film',
    'self_tape': 'Self-Tape',
    'scene_study': 'Scene Study',
    'theatre': 'Theatre',
    'commercial': 'Commercial',
    'voiceover': 'VO',
    'monologue': 'Monologue',
    'other': 'Other'
  }

  return (
    <div className="pb-24 pt-safe">
      <div className="px-5 pt-6 pb-4">
        <h1 className="font-display text-3xl font-normal text-text mb-1">Library</h1>
        <p className="text-text-muted text-sm">{scripts.length} scripts · {totalPages} pages</p>
      </div>

      <div className="px-5 mb-4">
        <div className="relative">
          <IconSearch size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-subtle" />
          <input
            type="text"
            placeholder="Search by title, show, or role..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-bg-surface border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent transition-colors"
          />
          {search && (
            <button 
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-white/10 text-text-muted"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>
      </div>

      <div className="px-5 mb-5 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {categories.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
              filter === f 
                ? 'bg-accent-muted border border-accent-border text-accent' 
                : 'bg-bg-surface border border-border text-text-muted hover:text-text'
            }`}
          >
            {categoryLabels[f] || f}
          </button>
        ))}
      </div>

      <div className="px-5 mb-5">
        <Card padding="p-4" className="border-dashed border-accent-border cursor-pointer" onClick={() => setShowImport(true)}>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-accent-muted flex items-center justify-center">
              <IconUpload size={20} className="text-accent" />
            </div>
            <div>
              <div className="text-text font-medium">Import Script</div>
              <div className="text-text-muted text-xs">PDF, Image, Word, Final Draft, or paste text</div>
            </div>
          </div>
        </Card>
      </div>

      <div className="px-5">
        <div className="text-[11px] font-semibold text-text-subtle tracking-widest uppercase mb-3">Recent Scripts</div>

        {loading && scriptsArray.length === 0 ? (
          <div className="flex justify-center py-12"><Spinner size={32} className="text-accent" /></div>
        ) : filteredScripts.length === 0 ? (
          <EmptyState
            icon={<IconLibrary size={32} />}
            title={scriptsArray.length === 0 ? "No scripts yet" : "No scripts match your search"}
            description={scriptsArray.length === 0 ? "Import your first script to start practicing" : "Try a different search term or filter"}
            action={scriptsArray.length === 0 ? <Button onClick={() => setShowImport(true)}>Import Script</Button> : undefined}
          />
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {filteredScripts.map((script, i) => {
                const isGenerating = generatingScriptIds.has(script.id)
                const isSwiped = swipedScriptId === script.id
                return (
                  <motion.div
                    key={script.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -300 }}
                    transition={{ delay: i * 0.05 }}
                    className="relative overflow-hidden rounded-xl"
                  >
                    {/* Main card */}
                    <div
                      onClick={() => {
                        if (isSwiped) {
                          setSwipedScriptId(null)
                        } else {
                          handleSelectScript(script)
                        }
                      }}
                      className="relative bg-bg-elevated border border-white/5 rounded-xl p-4 cursor-pointer"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-text font-medium truncate">{script.title}</h3>
                            {(script.voices_ready || script.audio_status === 'completed') && (
                              <span className="w-2 h-2 rounded-full bg-success" title="Audio ready" />
                            )}
                            {isGenerating && (
                              <span className="w-2 h-2 rounded-full bg-ai animate-pulse" title="Generating audio" />
                            )}
                          </div>
                          <p className="text-text-muted text-xs">{script.episode || script.type}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="accent">{script.user_role}</Badge>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setSwipedScriptId(isSwiped ? null : script.id)
                            }}
                            className="w-8 h-8 rounded-full flex items-center justify-center text-text-muted hover:bg-white/5 transition-colors"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-text-subtle">
                        <div className="flex gap-3">
                          <span>{script.page_count || 0} pages</span>
                          <span>{script.total_lines || 0} lines</span>
                        </div>
                        <span>{new Date(script.updated_at).toLocaleDateString()}</span>
                      </div>
                      
                      {/* Expanded action buttons */}
                      <AnimatePresence>
                        {isSwiped && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="flex gap-2 mt-3 pt-3 border-t border-white/5">
                              <button
                                onClick={(e) => { e.stopPropagation(); setVoiceSetupScript(script); setSwipedScriptId(null); }}
                                className="flex-1 py-2.5 rounded-lg bg-bg-surface flex items-center justify-center gap-2 text-sm text-text-muted hover:text-accent transition-colors"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                </svg>
                                Voices
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleArchiveScript(script.id); setSwipedScriptId(null); }}
                                className="flex-1 py-2.5 rounded-lg bg-bg-surface flex items-center justify-center gap-2 text-sm text-text-muted hover:text-amber-400 transition-colors"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                                </svg>
                                Archive
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(script.id); setSwipedScriptId(null); }}
                                className="flex-1 py-2.5 rounded-lg bg-bg-surface flex items-center justify-center gap-2 text-sm text-text-muted hover:text-error transition-colors"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                Delete
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showImport && (
          <ImportModal 
            onClose={() => setShowImport(false)} 
            onSuccess={handleImportSuccess}
            onStartPractice={handleSelectScript}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {voiceSetupScript && (
          <VoiceSetupModal 
            script={voiceSetupScript} 
            onClose={() => { setVoiceSetupScript(null); fetchScripts() }} 
          />
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirmId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setDeleteConfirmId(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-bg-elevated rounded-xl p-6 border border-white/5"
            >
              <div className="w-12 h-12 rounded-full bg-error/20 flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-text text-center mb-2">Delete Script?</h3>
              <p className="text-text-muted text-sm text-center mb-6">
                This will permanently delete the script and all associated data. This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <Button 
                  variant="secondary" 
                  onClick={() => setDeleteConfirmId(null)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <button
                  onClick={() => handleDeleteScript(deleteConfirmId)}
                  className="flex-1 px-4 py-2.5 bg-error hover:bg-error/90 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// Premium Import Modal with beautiful success state
function ImportModal({ onClose, onSuccess, onStartPractice }: { 
  onClose: () => void
  onSuccess: (script: Script) => void
  onStartPractice: (script: Script) => void
}) {
  const { user } = useStore()
  const [step, setStep] = useState<'choose' | 'text' | 'role' | 'importing' | 'success'>('choose')
  const [rawText, setRawText] = useState('')
  const [userRole, setUserRole] = useState('')
  const [userGender, setUserGender] = useState<'male' | 'female' | ''>('')
  const [scriptType, setScriptType] = useState<string>('tv_audition')
  const [pageRange, setPageRange] = useState<{ start: number; end: number } | null>(null)
  const [scriptTitle, setScriptTitle] = useState('')
  const [accentHint, setAccentHint] = useState('')
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [filePreview, setFilePreview] = useState<string>('')
  const [pdfInfo, setPdfInfo] = useState<PDFInfo | null>(null)
  const [pdfPreview, setPdfPreview] = useState<PDFPreview | null>(null)
  const [extractingPdf, setExtractingPdf] = useState(false)
  const [selectionMode] = useState<'pages'>('pages')
  const [selectedSceneIds, setSelectedSceneIds] = useState<string[]>([])
  const [customSelectedText, setCustomSelectedText] = useState('')
  const [importedScript, setImportedScript] = useState<Script | null>(null)
  const [characterCount, setCharacterCount] = useState(0)
  const [debugInfo, setDebugInfo] = useState<string[]>([])
  const [detectedCharacters, setDetectedCharacters] = useState<string[]>([])
  const [detectingCharacters, setDetectingCharacters] = useState(false)
  const [roleInputMode, setRoleInputMode] = useState<'dropdown' | 'manual'>('dropdown')
  const [audioReady, setAudioReady] = useState(false)
  const [audioGenerating, setAudioGenerating] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const importStartTimeRef = useRef<number>(0)
  const existingScriptIdsRef = useRef<Set<string>>(new Set())

  const scriptTypes = [
    { value: 'tv_audition', label: 'TV Audition' },
    { value: 'film_audition', label: 'Film Audition' },
    { value: 'self_tape', label: 'Self-Tape' },
    { value: 'scene_study', label: 'Scene Study' },
    { value: 'theatre', label: 'Theatre' },
    { value: 'commercial', label: 'Commercial' },
    { value: 'voiceover', label: 'Voiceover' },
    { value: 'other', label: 'Other' },
  ]

  const addDebug = (msg: string) => {
    console.log('[Import Debug]', msg)
    setDebugInfo(prev => [...prev.slice(-9), msg])
  }

  // Detect characters when PDF preview is ready or when text is pasted
  useEffect(() => {
    if (pdfPreview?.fullText) {
      setDetectingCharacters(true)
      const chars = extractCharactersFromText(pdfPreview.fullText)
      setDetectedCharacters(chars)
      setDetectingCharacters(false)
      console.log('[Character Detection] Found:', chars)
    }
  }, [pdfPreview?.fullText])

  useEffect(() => {
    if (rawText) {
      const chars = extractCharactersFromText(rawText)
      setDetectedCharacters(chars)
      console.log('[Character Detection] Found from text:', chars)
    }
  }, [rawText])

  useEffect(() => {
    if (customSelectedText) {
      const chars = extractCharactersFromText(customSelectedText)
      setDetectedCharacters(chars)
      console.log('[Character Detection] Found from custom text:', chars)
    }
  }, [customSelectedText])

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 10 * 1024 * 1024) {
      setError('File too large. Maximum size is 10MB.')
      return
    }

    setSelectedFile(file)
    setError('')
    setPdfInfo(null)
    setPdfPreview(null)
    setSelectedSceneIds([])
    setCustomSelectedText('')
    setDetectedCharacters([])

    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (e) => setFilePreview(e.target?.result as string)
      reader.readAsDataURL(file)
    } else {
      setFilePreview('')
    }

    // Get PDF preview with scene detection
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      try {
        setExtractingPdf(true)
        const preview = await getPDFPreview(file)
        setPdfPreview(preview)
        setPdfInfo({ totalPages: preview.totalPages, title: preview.title })
        
        // Auto-set title from PDF metadata if available and not already set
        if (preview.title && !scriptTitle) {
          setScriptTitle(preview.title)
        }
        // Default page range to full document
        setPageRange({ start: 1, end: preview.totalPages })
        // Default to all scenes selected
        setSelectedSceneIds(preview.scenes.map(s => s.id))
      } catch (err) {
        console.error('Failed to read PDF:', err)
        setError('Could not read PDF. Please try another file.')
      } finally {
        setExtractingPdf(false)
      }
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) {
      const fakeEvent = { target: { files: [file] } } as any
      handleFileSelect(fakeEvent)
    }
  }

  const handleImport = async () => {
    if (!userRole.trim()) {
      setError('Please enter your character name')
      return
    }

    const userId = user?.id || 'temp-user-' + Date.now()
    
    setStep('importing')
    setError('')
    setProgress('Preparing your script...')
    setDebugInfo([])
    importStartTimeRef.current = Date.now()

    addDebug(`Starting import for user: ${userId}`)
    addDebug(`User from store: ${user?.id || 'NULL'}`)
    addDebug(`User role: ${userRole}`)
    addDebug(`Using temp ID: ${!user?.id}`)
    if (selectedFile) {
      addDebug(`File: ${selectedFile.name} (${selectedFile.size} bytes)`)
    }

    try {
      // If it's a PDF, extract pages client-side first
      let textToSend = rawText
      let fileToSend: File | undefined = selectedFile || undefined
      
      if (selectedFile && (selectedFile.type === 'application/pdf' || selectedFile.name.toLowerCase().endsWith('.pdf'))) {
        setProgress('Extracting from PDF...')
        
        try {
          if (pageRange && pageRange.start && pageRange.end) {
            // Extract selected pages as a NEW PDF file using pdf-lib
            // This preserves formatting and lets n8n handle text extraction
            addDebug(`Extracting pages ${pageRange.start} to ${pageRange.end} as PDF`)
            fileToSend = await extractPagesAsPDF(selectedFile, pageRange.start, pageRange.end)
            textToSend = '' // Let n8n extract the text from the PDF
            addDebug(`Created new PDF: ${fileToSend.name} (${fileToSend.size} bytes)`)
          } else if (pdfPreview) {
            // Full PDF - send the original file, let n8n extract
            addDebug(`Sending full PDF file`)
            fileToSend = selectedFile
            textToSend = ''
          } else {
            // Fallback - send original file
            addDebug(`Sending original PDF file`)
            fileToSend = selectedFile
            textToSend = ''
          }
        } catch (pdfErr: any) {
          addDebug(`PDF extraction failed: ${pdfErr.message}, falling back to file upload`)
          // Fall back to sending the file if extraction fails
          textToSend = ''
          fileToSend = selectedFile
        }
      }

      // Fire the import request and use returned scriptId
      console.log('[Import] Sending to n8n...', { userId, userRole, hasFile: !!fileToSend, hasText: !!textToSend })
      addDebug('Sending to n8n webhook...')
      
      // Store scriptId when we get it from n8n
      let importedScriptId: string | null = null
      
      api.importScript({
        userId,
        userRole: userRole.toUpperCase(),
        userGender: userGender || undefined,
        file: fileToSend,
        rawText: textToSend || undefined,
        title: scriptTitle || undefined,
        scriptType: scriptType,
        accentHint: accentHint || undefined,
      })
        .then(data => {
          console.log('[Import] n8n response:', data)
          addDebug(`n8n response: ${JSON.stringify(data).substring(0, 100)}`)
          if (data.scriptId) {
            importedScriptId = data.scriptId
            addDebug(`Got scriptId: ${importedScriptId}`)
          }
        })
        .catch(err => {
          console.error('[Import] n8n error:', err)
          addDebug(`n8n error: ${err.message}`)
        })

      // Poll for the script to be ready
      let attempts = 0
      const progressMessages = [
        'Analyzing script structure...',
        'Identifying characters...',
        'Parsing dialogue...',
        'Assigning AI voices...',
        'Finalizing import...'
      ]
      
      const checkInterval = setInterval(async () => {
        const headers = await getAuthHeaders()
        
        attempts++
        const elapsed = Math.round((Date.now() - importStartTimeRef.current) / 1000)
        
        // Cycle through progress messages
        const msgIndex = Math.min(Math.floor(elapsed / 8), progressMessages.length - 1)
        setProgress(progressMessages[msgIndex])
        
        if (attempts % 5 === 0) {
          addDebug(`Poll attempt ${attempts}, ${elapsed}s elapsed, scriptId=${importedScriptId || 'waiting'}`)
        }
        
        // Wait until we have the scriptId from n8n
        if (!importedScriptId) {
          if (attempts === 1) {
            addDebug('Waiting for n8n response with scriptId...')
          }
          return
        }
        
        try {
          // Fetch the specific script by ID
          const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/scripts?id=eq.${importedScriptId}`
          
          if (attempts === 1 || (attempts === 2 && importedScriptId)) {
            addDebug(`Fetching script: ${importedScriptId}`)
          }
          
          const response = await fetch(url, { headers })
          
          if (response.ok) {
            const scripts = await response.json()
            
            if (scripts && scripts.length > 0) {
              const script = scripts[0]
              addDebug(`Script "${script.title}": ${script.total_lines} lines, status=${script.audio_status}`)
              
              // Check if script has lines
              if (script.total_lines > 0) {
                clearInterval(checkInterval)
                addDebug(`SUCCESS! Script ready: ${script.id}`)
                
                // Get character count
                const charsResponse = await fetch(
                  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/characters?script_id=eq.${script.id}&select=id`,
                  { headers }
                )
                const chars = charsResponse.ok ? await charsResponse.json() : []
                
                setCharacterCount(chars?.length || 0)
                setImportedScript(script)
                setAudioGenerating(true)
                setAudioReady(false)
                setStep('success')
                onSuccess(script)
                
                // Start polling for audio completion in modal
                pollAudioInModal(script.id)
                return
              }
            }
          } else {
            addDebug(`Fetch error: ${response.status}`)
          }
        } catch (e: any) {
          addDebug(`Poll error: ${e.message}`)
        }
        
        if (attempts >= 90) {
          clearInterval(checkInterval)
          addDebug('TIMEOUT after 90 attempts')
          setError('Import timed out. Please refresh and check your library.')
          setStep('role')
        }
      }, 2000)
      
    } catch (e: any) {
      addDebug(`Import failed: ${e.message}`)
      setError('Failed to import script')
      setStep('role')
    }
  }

  const pollAudioInModal = async (scriptId: string) => {
    try {
      await api.pollAudioStatus(
        scriptId,
        (progress, status) => {
          console.log(`[Audio Modal] ${scriptId}: ${progress}% - ${status}`)
        },
        3000,
        200
      )
      setAudioReady(true)
      setAudioGenerating(false)
    } catch (err) {
      console.error('Audio polling failed:', err)
      setAudioGenerating(false)
    }
  }

  const handleStartPractice = () => {
    if (importedScript) {
      onStartPractice(importedScript)
      onClose()
    }
  }

  const handleViewInLibrary = () => {
    onClose()
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && step !== 'importing' && step !== 'success' && onClose()}
    >
      {/* Success State - Centered Card Popup */}
      {step === 'success' && importedScript && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="absolute inset-0 flex items-center justify-center p-6"
        >
          <div className="w-full max-w-sm bg-bg-elevated rounded-2xl border border-white/10 overflow-hidden">
            {/* Header with checkmark */}
            <div className="relative h-20 bg-gradient-to-br from-accent/20 to-transparent flex items-center justify-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', damping: 15, delay: 0.2 }}
                className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center"
              >
                <svg className="w-6 h-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </motion.div>
            </div>

            <div className="p-5">
              <h2 className="text-lg font-medium text-text text-center mb-1">Script Imported</h2>
              <p className="text-text-muted text-sm text-center mb-4">{importedScript.title}</p>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="text-center p-2 bg-bg-surface rounded-lg">
                  <div className="text-base font-semibold text-text">{importedScript.total_lines}</div>
                  <div className="text-[9px] text-text-muted uppercase">Lines</div>
                </div>
                <div className="text-center p-2 bg-bg-surface rounded-lg">
                  <div className="text-base font-semibold text-text">{characterCount}</div>
                  <div className="text-[9px] text-text-muted uppercase">Characters</div>
                </div>
                <div className="text-center p-2 bg-bg-surface rounded-lg">
                  <div className="text-base font-semibold text-accent truncate px-1">{importedScript.user_role}</div>
                  <div className="text-[9px] text-text-muted uppercase">Your Role</div>
                </div>
              </div>

              {/* Audio status */}
              <div className={`flex items-center justify-center gap-2 text-sm rounded-lg px-3 py-2.5 mb-4 ${audioReady ? 'bg-success-muted text-success' : 'bg-bg-surface text-text-muted'}`}>
                {audioReady ? (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>AI voices ready</span>
                  </>
                ) : (
                  <>
                    <Spinner size={14} />
                    <span>Generating AI voices...</span>
                  </>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex gap-3">
                <Button variant="secondary" onClick={handleViewInLibrary} className="flex-1">
                  Library
                </Button>
                <button 
                  onClick={handleStartPractice}
                  disabled={!audioReady}
                  className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    audioReady 
                      ? 'bg-accent hover:bg-accent/90 text-white' 
                      : 'bg-bg-surface text-text-muted cursor-not-allowed'
                  }`}
                >
                  Start Practice
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Importing State - Centered popup */}
      {step === 'importing' && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute inset-0 flex items-center justify-center p-6"
        >
          <div className="w-full max-w-sm bg-bg-elevated rounded-2xl border border-white/10 p-6">
            <div className="flex flex-col items-center">
              {/* Animated rings */}
              <div className="relative w-20 h-20 mb-5">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                  className="absolute inset-0 rounded-full border-2 border-accent/30 border-t-accent"
                />
                <motion.div
                  animate={{ rotate: -360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  className="absolute inset-2 rounded-full border-2 border-ai/30 border-t-ai"
                />
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                  className="absolute inset-4 rounded-full border-2 border-success/30 border-t-success"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <svg className="w-5 h-5 text-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
              </div>
              
              <h3 className="text-lg font-medium text-text mb-2">Importing Script</h3>
              <motion.p 
                key={progress}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-text-muted text-sm text-center"
              >
                {progress}
              </motion.p>
              
              <p className="text-text-subtle text-xs mt-4 text-center max-w-xs">
                Our AI is analyzing your script and assigning unique voices to each character
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Other steps use the slide-in modal */}
      {step !== 'success' && step !== 'importing' && (
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="absolute inset-0 bg-bg flex flex-col overflow-hidden"
      >
        {/* Choose input method */}
        {step === 'choose' && (
          <>
            <div className="flex items-center gap-3 px-4 py-4 border-b border-border">
              <button
                onClick={onClose}
                className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors"
              >
                <svg className="w-6 h-6 text-text" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h2 className="text-lg font-medium text-text">Import Script</h2>
                <p className="text-text-muted text-sm">{selectedFile ? 'Select content to import' : 'Upload a file or paste text'}</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.docx,.doc,.txt,.fdx,.fountain"
                onChange={handleFileSelect}
                className="hidden"
              />

              {/* NO FILE SELECTED - Show upload area */}
              {!selectedFile && (
                <>
                  {/* Drop zone */}
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:bg-white/5 transition-all hover:border-accent"
                  >
                    <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-accent/10 flex items-center justify-center">
                      <IconUpload size={24} className="text-accent" />
                    </div>
                    <p className="text-text font-medium mb-1">Drop file here or click to upload</p>
                    <p className="text-text-muted text-xs">PDF, Image, Word, Final Draft, Fountain</p>
                    <p className="text-text-subtle text-[10px] mt-2">Max 10MB</p>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-text-subtle text-xs">or</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>

                  <Button variant="secondary" className="w-full" onClick={() => setStep('text')}>
                    Paste Script Text
                  </Button>
                </>
              )}

              {/* FILE SELECTED - Show preview & selection options */}
              {selectedFile && (
                <>
                  {/* File header with change/remove options */}
                  <div className="flex items-center gap-3 p-3 bg-bg-surface rounded-lg border border-accent/30">
                    <div className="w-10 h-10 rounded bg-accent/10 flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-text text-sm font-medium truncate">{selectedFile.name}</p>
                      <p className="text-text-muted text-xs">
                        {pdfPreview ? `${pdfPreview.totalPages} pages` : `${(selectedFile.size / 1024).toFixed(1)} KB`}
                        {detectedCharacters.length > 0 && ` · ${detectedCharacters.length} characters found`}
                      </p>
                    </div>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs text-accent hover:text-accent/80 px-2 py-1"
                    >
                      Change
                    </button>
                    <button 
                      onClick={() => { setSelectedFile(null); setPageRange(null); setPdfInfo(null); setPdfPreview(null); setSelectedSceneIds([]); setCustomSelectedText(''); setDetectedCharacters([]); }}
                      className="text-text-subtle hover:text-error p-1"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* PDF Selection Options */}
                  {extractingPdf ? (
                    <div className="flex items-center justify-center gap-2 py-8 text-text-muted">
                      <Spinner size={20} />
                      <span>Analyzing PDF...</span>
                    </div>
                  ) : pdfPreview ? (
                    <>
                      {/* Page Selection - Visual Preview */}
                      {selectedFile && (
                        <PDFVisualPreview 
                          file={selectedFile}
                          mode="select-pages"
                          selectedPages={pageRange ? Array.from({ length: Math.max(0, pageRange.end - pageRange.start + 1) }, (_, i) => pageRange.start + i) : []}
                          onPagesSelect={(pages) => {
                            if (pages.length === 0) {
                              setPageRange({ start: 1, end: 1 })
                            } else {
                              setPageRange({ start: Math.min(...pages), end: Math.max(...pages) })
                            }
                          }}
                        />
                      )}
                    </>
                  ) : (
                    // Non-PDF file preview
                    <div className="text-center py-4">
                      {filePreview && <img src={filePreview} alt="Preview" className="rounded max-h-32 mx-auto mb-2" />}
                      <p className="text-text-muted text-xs">Ready to import</p>
                    </div>
                  )}
                </>
              )}

              {error && <p className="text-error text-sm text-center">{error}</p>}
            </div>

            {/* Fixed footer with Continue button when file is selected */}
            {selectedFile && (
              <div className="flex-shrink-0 px-5 pt-4 pb-8 border-t border-border bg-bg">
                <Button className="w-full" onClick={() => setStep('role')}>
                  Continue
                </Button>
              </div>
            )}
          </>
        )}

        {/* Paste text */}
        {step === 'text' && (
          <>
            <div className="flex items-center gap-3 px-4 py-4 border-b border-border">
              <button
                onClick={() => setStep('choose')}
                className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors"
              >
                <svg className="w-6 h-6 text-text" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h2 className="text-lg font-medium text-text">Paste Script</h2>
                <p className="text-text-muted text-sm">Paste your script text below</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <textarea
                placeholder="Paste your script here...

Example:
INT. COFFEE SHOP - DAY

MARCUS
Hey, have you seen Sarah today?

JESSICA
No, she hasn't been in yet."
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                className="w-full h-64 p-4 bg-bg-surface border border-border rounded-lg text-text text-sm resize-none focus:outline-none focus:border-accent font-mono"
                autoFocus
              />
            </div>
            
            {/* Fixed footer with buttons */}
            <div className="flex-shrink-0 px-5 pt-4 pb-8 border-t border-border bg-bg flex gap-3">
              <Button variant="secondary" onClick={() => setStep('choose')} className="flex-1">Back</Button>
              <Button onClick={() => setStep('role')} disabled={!rawText.trim()} className="flex-1">Continue</Button>
            </div>
          </>
        )}

        {/* Enter role */}
        {step === 'role' && (
          <>
            <div className="flex items-center gap-3 px-4 py-4 border-b border-border">
              <button
                onClick={() => setStep(selectedFile ? 'choose' : 'text')}
                className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors"
              >
                <svg className="w-6 h-6 text-text" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h2 className="text-lg font-medium text-text">Script Details</h2>
                <p className="text-text-muted text-sm">Tell us about your scene</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* File Summary */}
              {selectedFile && (
                <div className="p-3 bg-bg-surface rounded-lg border border-border flex items-center gap-3">
                  <div className="w-10 h-10 rounded bg-accent/10 flex items-center justify-center">
                    <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-text text-sm font-medium truncate">{selectedFile.name}</p>
                    <p className="text-text-muted text-xs">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                      {pdfPreview && (
                        <>
                          {' · '}
                          {pageRange?.start && pageRange?.end 
                            ? `Pages ${pageRange.start}-${pageRange.end} of ${pdfPreview.totalPages}`
                            : `All ${pdfPreview.totalPages} pages`
                          }
                        </>
                      )}
                    </p>
                  </div>
                </div>
              )}
              
              {!selectedFile && rawText && (
                <div className="p-3 bg-bg-surface rounded-lg border border-border">
                  <p className="text-text text-sm font-medium">Pasted Script</p>
                  <p className="text-text-muted text-xs">{rawText.length} characters</p>
                </div>
              )}

              {/* Script Title */}
              <div>
                <label className="block text-text text-sm mb-2">Script/Scene Title <span className="text-text-muted text-xs">(optional)</span></label>
                <input
                  type="text"
                  placeholder="e.g. Heartbreak High - Amerie Scene"
                  value={scriptTitle}
                  onChange={(e) => setScriptTitle(e.target.value)}
                  className="w-full px-4 py-2.5 bg-bg-surface border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent"
                />
              </div>

              {/* Script Type */}
              <div>
                <label className="block text-text text-sm mb-2">What's this for?</label>
                <div className="grid grid-cols-2 gap-2">
                  {scriptTypes.map(type => (
                    <button
                      key={type.value}
                      onClick={() => setScriptType(type.value)}
                      className={`px-3 py-2 rounded-lg border text-sm transition-all ${
                        scriptType === type.value
                          ? 'bg-accent/10 border-accent text-text'
                          : 'bg-bg-surface border-border text-text-muted hover:border-text-subtle hover:text-text'
                      }`}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Character Name - Dropdown or Manual */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-text text-sm">Your Character</label>
                  {detectedCharacters.length > 0 && (
                    <button
                      onClick={() => setRoleInputMode(roleInputMode === 'dropdown' ? 'manual' : 'dropdown')}
                      className="text-xs text-accent hover:text-accent/80"
                    >
                      {roleInputMode === 'dropdown' ? 'Type manually' : 'Choose from list'}
                    </button>
                  )}
                </div>

                {/* Dropdown mode - show when we have detected characters */}
                {roleInputMode === 'dropdown' && detectedCharacters.length > 0 ? (
                  <div className="space-y-2">
                    <select
                      value={userRole}
                      onChange={(e) => setUserRole(e.target.value)}
                      className="w-full px-4 py-3 bg-bg-surface border border-border rounded-lg text-text focus:outline-none focus:border-accent uppercase font-mono tracking-wide appearance-none cursor-pointer"
                    >
                      <option value="">Select your character...</option>
                      {detectedCharacters.map(char => (
                        <option key={char} value={char}>{char}</option>
                      ))}
                    </select>
                    <p className="text-text-subtle text-xs">
                      {detectedCharacters.length} character{detectedCharacters.length !== 1 ? 's' : ''} detected
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="e.g. MARCUS"
                      value={userRole}
                      onChange={(e) => setUserRole(e.target.value.toUpperCase())}
                      className="w-full px-4 py-3 bg-bg-surface border border-border rounded-lg text-text focus:outline-none focus:border-accent uppercase font-mono tracking-wide"
                      autoFocus
                    />
                    <p className="text-text-subtle text-xs">Enter exactly as it appears in the script</p>
                  </div>
                )}
              </div>

              {/* Your Gender */}
              <div>
                <label className="block text-text text-sm mb-2">Your Gender</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setUserGender('male')}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      userGender === 'male'
                        ? 'bg-accent text-white'
                        : 'bg-bg-surface text-text-muted hover:text-text border border-border'
                    }`}
                  >
                    Male
                  </button>
                  <button
                    onClick={() => setUserGender('female')}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      userGender === 'female'
                        ? 'bg-accent text-white'
                        : 'bg-bg-surface text-text-muted hover:text-text border border-border'
                    }`}
                  >
                    Female
                  </button>
                </div>
                <p className="text-text-subtle text-xs mt-1.5">Helps assign the right voices to other characters</p>
              </div>

              {/* Voice Context Section */}
              <div className="pt-2 border-t border-border">
                <p className="text-text-muted text-xs mb-3">Help us choose the right AI voices</p>
                
                {/* Accent/Region Hint */}
                <div className="mb-3">
                  <label className="block text-text text-sm mb-1.5">Accent / Region</label>
                  <select
                    value={accentHint}
                    onChange={(e) => setAccentHint(e.target.value)}
                    className="w-full px-4 py-2.5 bg-bg-surface border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent appearance-none cursor-pointer"
                  >
                    <option value="">Auto-detect</option>
                    <option value="australian">Australian</option>
                    <option value="british">British</option>
                    <option value="american">American</option>
                    <option value="irish">Irish</option>
                    <option value="scottish">Scottish</option>
                    <option value="indian">Indian</option>
                    <option value="african">African</option>
                    <option value="european">European</option>
                    <option value="asian">Asian</option>
                    <option value="latin">Latin American</option>
                  </select>
                </div>
              </div>

              {error && <p className="text-error text-sm">{error}</p>}
            </div>

            {/* Fixed footer with buttons */}
            <div className="flex-shrink-0 px-5 pt-4 pb-8 border-t border-border bg-bg flex gap-3">
              <Button variant="secondary" onClick={() => setStep('choose')} className="flex-1">Back</Button>
              <Button onClick={handleImport} disabled={!userRole.trim()} className="flex-1">
                Import Script
              </Button>
            </div>
          </>
        )}
      </motion.div>
      )}
    </motion.div>
  )
}

function VoiceSetupModal({ script, onClose }: { script: Script; onClose: () => void }) {
  const [characters, setCharacters] = useState<Character[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [audioStatus, setAudioStatus] = useState<'none' | 'generating' | 'ready'>('none')
  const [linesWithAudio, setLinesWithAudio] = useState(0)
  const [totalNonUserLines, setTotalNonUserLines] = useState(0)

  // Extract voice name from full ID (e.g., "en-AU-Chirp3-HD-Achernar" -> "Achernar")
  const extractVoiceName = (voiceId: string | null): string => {
    if (!voiceId) return ''
    // If it's a full ID like "en-AU-Chirp3-HD-Achernar", extract the name
    if (voiceId.includes('-Chirp3-HD-')) {
      return voiceId.split('-Chirp3-HD-')[1] || voiceId
    }
    // If it's already just the name, return as-is
    return voiceId
  }

  // Find matching voice in ELEVENLABS_VOICES list
  const findMatchingVoiceId = (voiceId: string | null): string => {
    if (!voiceId) return ELEVENLABS_VOICES[0]?.id || ''
    const voiceName = extractVoiceName(voiceId)
    const matchingVoice = ELEVENLABS_VOICES.find(v => 
      extractVoiceName(v.id) === voiceName || v.name === voiceName
    )
    return matchingVoice?.id || ELEVENLABS_VOICES[0]?.id || ''
  }

  useEffect(() => {
    loadCharacters()
    checkAudioStatus()
  }, [script.id])

  const checkAudioStatus = async () => {
    const { data: lines } = await supabase
      .from('lines')
      .select('id, audio_url, is_user_line')
      .eq('script_id', script.id)
    
    if (lines) {
      const nonUserLines = lines.filter((l: { is_user_line: boolean }) => !l.is_user_line)
      const withAudio = nonUserLines.filter((l: { audio_url: string | null }) => l.audio_url)
      setTotalNonUserLines(nonUserLines.length)
      setLinesWithAudio(withAudio.length)
      
      if (withAudio.length === nonUserLines.length && nonUserLines.length > 0) {
        setAudioStatus('ready')
      } else if (withAudio.length > 0 || script.audio_status === 'processing') {
        setAudioStatus('generating')
        if (script.audio_status === 'processing') {
          pollAudioProgress()
        }
      }
    }
  }

  const pollAudioProgress = async () => {
    setGenerating(true)
    try {
      await api.pollAudioStatus(
        script.id,
        (progress, status) => {
          const completed = Math.round((progress / 100) * totalNonUserLines)
          setLinesWithAudio(completed)
        },
        2000,
        150
      )
      setAudioStatus('ready')
      setGenerating(false)
      setLinesWithAudio(totalNonUserLines)
    } catch (err) {
      console.error('Audio polling failed:', err)
      setGenerating(false)
      checkAudioStatus()
    }
  }

  const loadCharacters = async () => {
    setLoading(true)
    const { data: existingChars } = await supabase
      .from('characters')
      .select('*')
      .eq('script_id', script.id)
    
    if (existingChars && existingChars.length > 0) {
      setCharacters(existingChars)
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

  const handleGenerateAudio = async () => {
    setGenerating(true)
    setAudioStatus('generating')
    
    try {
      await api.generateBatchAudio(script.id)
      
      api.pollAudioStatus(
        script.id,
        (progress, status) => {
          const completed = Math.round((progress / 100) * totalNonUserLines)
          setLinesWithAudio(completed)
        },
        2000,
        150
      ).then(() => {
        setAudioStatus('ready')
        setGenerating(false)
        setLinesWithAudio(totalNonUserLines)
      }).catch((err) => {
        console.error('Audio generation failed:', err)
        setGenerating(false)
        checkAudioStatus()
      })
      
    } catch (e) {
      console.error('Failed to generate audio:', e)
      setGenerating(false)
    }
  }

  const handleDone = () => {
    useStore.getState().setCharacters(characters)
    onClose()
  }

  const handlePractice = () => {
    useStore.getState().setCurrentScript(script)
    useStore.getState().setCharacters(characters)
    useStore.getState().setActiveTab('practice')
    onClose()
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="absolute inset-0 bg-bg flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-border">
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors"
          >
            <svg className="w-6 h-6 text-text" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h2 className="text-lg font-medium text-text">Voice Setup</h2>
            <p className="text-text-muted text-sm">{script.title}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="py-12 text-center"><Spinner size={32} className="text-accent mx-auto" /></div>
          ) : characters.length === 0 ? (
            <div className="py-8 text-center text-text-muted">
              <p>No characters found.</p>
              <p className="text-sm mt-2">Try re-importing the script.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {characters
                .sort((a, b) => (a.is_user_character === b.is_user_character ? 0 : a.is_user_character ? -1 : 1))
                .map(char => (
                <div key={char.id} className={`p-3 rounded-lg ${char.is_user_character ? 'bg-accent/10 border border-accent/30' : 'bg-bg-surface'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                        char.is_user_character ? 'bg-accent text-white' : 'bg-ai-muted text-ai'
                      }`}>
                        {char.name.charAt(0)}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-text">{char.name}</div>
                        <div className="text-xs text-text-muted">
                          {char.is_user_character ? 'Your character (you speak)' : `${char.gender} · ${char.voice_name || 'No voice'}`}
                        </div>
                      </div>
                    </div>
                    
                    {!char.is_user_character && (
                      <select
                        value={findMatchingVoiceId(char.voice_id)}
                        onChange={(e) => updateVoice(char.id, e.target.value)}
                        className="text-sm bg-bg border border-border rounded-lg px-3 py-2 text-text max-w-[140px]"
                      >
                        {ELEVENLABS_VOICES.map(voice => (
                          <option key={voice.id} value={voice.id}>
                            {voice.name} ({voice.gender === 'female' ? 'F' : 'M'})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-5 border-t border-border bg-bg-surface/50">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-medium text-text">Audio Generation</div>
              <div className="text-xs text-text-muted">
                {audioStatus === 'ready' 
                  ? `All ${totalNonUserLines} lines ready`
                  : audioStatus === 'generating'
                  ? `Generating... ${linesWithAudio}/${totalNonUserLines}`
                  : `Generates automatically or on-demand`
                }
              </div>
            </div>
            {audioStatus !== 'ready' && !generating && (
              <Button 
                size="sm" 
                variant="secondary"
                onClick={handleGenerateAudio}
                disabled={characters.length === 0}
              >
                Generate Now
              </Button>
            )}
            {audioStatus === 'ready' && (
              <span className="text-success text-sm font-medium">Ready</span>
            )}
          </div>
          
          {(generating || audioStatus === 'generating') && (
            <div className="w-full bg-bg-surface rounded-full h-2 overflow-hidden mb-3">
              <motion.div 
                className="h-full bg-gradient-to-r from-accent to-ai"
                initial={{ width: 0 }}
                animate={{ width: `${totalNonUserLines > 0 ? (linesWithAudio / totalNonUserLines) * 100 : 0}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          )}
        </div>

        <div className="flex-shrink-0 px-5 pt-4 pb-8 border-t border-border bg-bg flex gap-3">
          <Button variant="secondary" onClick={handleDone} className="flex-1">Done</Button>
          <Button onClick={handlePractice} className="flex-1">Start Practice</Button>
        </div>
      </motion.div>
    </motion.div>
  )
}
