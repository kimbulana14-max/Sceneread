'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '@/store'
import { Button } from './ui'
import { GOOGLE_TTS_VOICES, EMOTION_TAGS, CHARACTER_ARCHETYPES, AGE_RANGES, VOCAL_TONES, ACCENTS, buildVoiceId, getAuthHeaders } from '@/lib/supabase'

interface EditModalProps {
  isOpen: boolean
  onClose: () => void
  type: 'line' | 'character' | 'script'
  data: any
  onSave: (updatedData: any) => Promise<void>
  onDelete?: (id: string) => Promise<void>
  onAddLine?: (afterLineId: string | null, lineData: any) => Promise<void>
  mode?: 'edit' | 'add'
}

export function EditModal({ isOpen, onClose, type, data, onSave, onDelete, onAddLine, mode = 'edit' }: EditModalProps) {
  const [formData, setFormData] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [activeTab, setActiveTab] = useState<'details' | 'notes' | 'metadata'>('details')

  useEffect(() => {
    if (data) {
      if (mode === 'add') {
        setFormData({
          script_id: data.script_id,
          scene_id: data.scene_id,
          character_name: '',
          content: '',
          is_user_line: false,
          line_type: 'dialogue',
          emotion: 'neutral',
          sort_order: data.sort_order || 0,
          afterLineId: data.afterLineId || null
        })
      } else {
        setFormData({ ...data })
      }
    }
  }, [data, mode])

  const handleSave = async () => {
    setSaving(true)
    try {
      if (mode === 'add' && onAddLine) {
        await onAddLine(formData.afterLineId, formData)
      } else {
        await onSave(formData)
      }
      onClose()
    } catch (e) {
      console.error('Save failed:', e)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!onDelete || !formData.id) return
    setDeleting(true)
    try {
      await onDelete(formData.id)
      onClose()
    } catch (e) {
      console.error('Delete failed:', e)
    } finally {
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  if (!isOpen) return null

  const tabs = type === 'line' && mode === 'edit' 
    ? ['details', 'notes', 'metadata'] 
    : ['details']

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="absolute inset-0 bg-bg flex flex-col"
          onClick={(e) => e.stopPropagation()}
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
            <h2 className="text-xl font-semibold text-text flex-1">
              {mode === 'add' 
                ? 'Add New Line' 
                : type === 'line' 
                  ? 'Edit Line' 
                  : type === 'character' 
                    ? 'Edit Character' 
                    : 'Edit Script'
              }
            </h2>
          </div>

          {/* Tabs */}
          {tabs.length > 1 && (
            <div className="px-4 pt-3 flex gap-1 border-b border-border bg-bg-surface/30">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab as any)}
                  className={`px-3 py-2 text-sm font-medium transition-colors relative capitalize ${
                    activeTab === tab ? 'text-accent' : 'text-text-muted hover:text-text'
                  }`}
                >
                  {tab}
                  {tab === 'notes' && formData.notes && (
                    <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-accent inline-block" />
                  )}
                  {activeTab === tab && (
                    <motion.div layoutId="edit-tab-indicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24">
            {type === 'line' && activeTab === 'details' && (
              <LineEditForm formData={formData} setFormData={setFormData} mode={mode} />
            )}
            {type === 'line' && activeTab === 'notes' && mode === 'edit' && (
              <NotesEditForm formData={formData} setFormData={setFormData} />
            )}
            {type === 'line' && activeTab === 'metadata' && mode === 'edit' && (
              <LineMetadataView formData={formData} />
            )}
            {type === 'character' && (
              <CharacterEditForm formData={formData} setFormData={setFormData} />
            )}
            {type === 'script' && (
              <ScriptEditForm formData={formData} setFormData={setFormData} />
            )}
          </div>

          {/* Delete Confirmation */}
          <AnimatePresence>
            {showDeleteConfirm && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-t border-error/20 bg-error/5"
              >
                <div className="p-4">
                  <p className="text-sm text-text mb-3">Delete this line? This cannot be undone.</p>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setShowDeleteConfirm(false)} className="flex-1">
                      Cancel
                    </Button>
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="flex-1 px-3 py-2 bg-error hover:bg-error/90 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {deleting ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Footer - Fixed at bottom */}
          <div className="flex-shrink-0 p-4 pb-20 border-t border-border bg-bg">
            <div className="flex gap-3">
              {mode === 'edit' && type === 'line' && onDelete && !showDeleteConfirm && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-4 py-3 text-error hover:bg-error/10 rounded-xl transition-colors"
                  title="Delete line"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
              <Button variant="secondary" onClick={onClose} className="flex-1 py-3">
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving || !formData.content?.trim()} className="flex-1 py-3">
                {saving ? 'Saving...' : mode === 'add' ? 'Add Line' : 'Save'}
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

function LineEditForm({ formData, setFormData, mode }: { formData: any; setFormData: (d: any) => void; mode?: 'edit' | 'add' }) {
  const { characters } = useStore()
  
  return (
    <div className="space-y-4">
      {/* Character Name */}
      <div>
        <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wide">Character</label>
        {mode === 'add' && characters.length > 0 ? (
          <div className="space-y-2">
            <select
              value={formData.character_name || ''}
              onChange={(e) => {
                const char = characters.find(c => c.name === e.target.value)
                setFormData({ 
                  ...formData, 
                  character_name: e.target.value,
                  is_user_line: char?.is_user_character || false
                })
              }}
              className="w-full px-3 py-2.5 bg-bg-surface border border-border rounded-lg text-text font-mono uppercase focus:outline-none focus:border-accent"
            >
              <option value="">Select character...</option>
              {characters.map(c => (
                <option key={c.id} value={c.name}>
                  {c.name} {c.is_user_character ? '(You)' : ''}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={formData.character_name || ''}
              onChange={(e) => setFormData({ ...formData, character_name: e.target.value.toUpperCase() })}
              placeholder="Or type new character..."
              className="w-full px-3 py-2.5 bg-bg-surface border border-border rounded-lg text-text font-mono uppercase focus:outline-none focus:border-accent"
            />
          </div>
        ) : (
          <input
            type="text"
            value={formData.character_name || ''}
            onChange={(e) => setFormData({ ...formData, character_name: e.target.value.toUpperCase() })}
            className="w-full px-3 py-2.5 bg-bg-surface border border-border rounded-lg text-text font-mono uppercase focus:outline-none focus:border-accent"
          />
        )}
      </div>

      {/* Content */}
      <div>
        <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wide">Dialogue</label>
        <textarea
          value={formData.content || ''}
          onChange={(e) => setFormData({ ...formData, content: e.target.value })}
          rows={4}
          placeholder="Enter the dialogue..."
          autoFocus={mode === 'add'}
          className="w-full px-3 py-2.5 bg-bg-surface border border-border rounded-lg text-text resize-none focus:outline-none focus:border-accent"
        />
      </div>

      {/* Is User Line */}
      <label className="flex items-center gap-3 p-3 bg-bg-surface rounded-lg cursor-pointer hover:bg-bg-surface/80 transition-colors">
        <input
          type="checkbox"
          checked={formData.is_user_line || false}
          onChange={(e) => setFormData({ ...formData, is_user_line: e.target.checked })}
          className="w-4 h-4 rounded accent-accent"
        />
        <div>
          <div className="text-sm text-text">This is my line</div>
          <div className="text-xs text-text-muted">Mark as your character's dialogue</div>
        </div>
      </label>

      {/* Line Type & Emotion Row */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wide">Type</label>
          <select
            value={formData.line_type || 'dialogue'}
            onChange={(e) => setFormData({ ...formData, line_type: e.target.value })}
            className="w-full px-3 py-2.5 bg-bg-surface border border-border rounded-lg text-text focus:outline-none focus:border-accent"
          >
            <option value="dialogue">Dialogue</option>
            <option value="action">Action</option>
            <option value="transition">Transition</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wide">Emotion</label>
          <select
            value={formData.emotion || 'neutral'}
            onChange={(e) => setFormData({ ...formData, emotion: e.target.value })}
            className="w-full px-3 py-2.5 bg-bg-surface border border-border rounded-lg text-text focus:outline-none focus:border-accent"
          >
            {EMOTION_TAGS.map(emotion => (
              <option key={emotion} value={emotion}>
                {emotion.charAt(0).toUpperCase() + emotion.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Delivery Note */}
      <div>
        <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wide">Delivery Note</label>
        <input
          type="text"
          value={formData.parenthetical || formData.delivery_note || ''}
          onChange={(e) => setFormData({ ...formData, parenthetical: e.target.value, delivery_note: e.target.value })}
          placeholder="angrily, whispers, beat, etc."
          className="w-full px-3 py-2.5 bg-bg-surface border border-border rounded-lg text-text italic focus:outline-none focus:border-accent"
        />
      </div>

      {mode === 'edit' && (
        <>
          <div>
            <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wide">Stage Direction</label>
            <input
              type="text"
              value={formData.stage_direction || ''}
              onChange={(e) => setFormData({ ...formData, stage_direction: e.target.value })}
              placeholder="Crosses to window, sits down, etc."
              className="w-full px-3 py-2.5 bg-bg-surface border border-border rounded-lg text-text focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wide">Cue</label>
            <input
              type="text"
              value={formData.cue || ''}
              onChange={(e) => setFormData({ ...formData, cue: e.target.value })}
              placeholder="Previous line ending..."
              className="w-full px-3 py-2.5 bg-bg-surface border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent"
            />
          </div>
        </>
      )}
    </div>
  )
}

function NotesEditForm({ formData, setFormData }: { formData: any; setFormData: (d: any) => void }) {
  const quickTags = ['Blocking', 'Emotion', 'Cue', 'Prop', 'Subtext', 'Camera', 'Pause', 'Beat']
  
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wide">Your Notes</label>
        <textarea
          value={formData.notes || ''}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          rows={10}
          placeholder="Add your personal notes for this line...

Examples:
- Blocking: Cross to window on 'why'
- Emotion: Start frustrated, soften by end
- Cue: Watch for John's hand gesture
- Technical: Pick up prop before line
- Subtext: She knows more than she's saying"
          className="w-full px-3 py-2.5 bg-bg-surface border border-border rounded-lg text-text resize-none focus:outline-none focus:border-accent placeholder:text-text-subtle"
        />
      </div>

      <div className="p-3 bg-bg-surface rounded-lg border border-border">
        <div className="text-xs text-text-muted mb-2">Quick Tags</div>
        <div className="flex flex-wrap gap-2">
          {quickTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setFormData({ ...formData, notes: (formData.notes || '') + `\n- ${tag}: ` })}
              className="px-2.5 py-1 text-xs bg-bg rounded border border-border text-text-muted hover:text-text hover:border-accent transition-colors"
            >
              + {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Line Preview */}
      <div className="p-3 bg-bg rounded-lg border border-border/50">
        <div className="text-[10px] text-text-subtle uppercase tracking-wide mb-1">Line Preview</div>
        <div className="text-xs text-accent font-mono mb-1">{formData.character_name}</div>
        <div className="text-sm text-text">{formData.content}</div>
      </div>
    </div>
  )
}

function LineMetadataView({ formData }: { formData: any }) {
  return (
    <div className="space-y-4">
      <div className="p-3 bg-bg-surface rounded-lg border border-border">
        <div className="text-xs text-text-muted uppercase tracking-wide mb-3">Line Information</div>
        <div className="space-y-2 text-sm">
          <MetadataRow label="Line ID" value={formData.id} mono />
          <MetadataRow label="Line Number" value={formData.line_number} />
          <MetadataRow label="Word Count" value={formData.word_count} />
          <MetadataRow label="Sort Order" value={formData.sort_order} />
          <MetadataRow label="Line Type" value={formData.line_type} />
        </div>
      </div>

      <div className="p-3 bg-bg-surface rounded-lg border border-border">
        <div className="text-xs text-text-muted uppercase tracking-wide mb-3">Voice Settings</div>
        <div className="space-y-2 text-sm">
          <MetadataRow label="Emotion Tag" value={formData.emotion || formData.emotion_tag || 'neutral'} />
          <MetadataRow label="Delivery Note" value={formData.parenthetical || formData.delivery_note || '-'} />
        </div>
      </div>

      <div className="p-3 bg-bg-surface rounded-lg border border-border">
        <div className="text-xs text-text-muted uppercase tracking-wide mb-3">Audio Status</div>
        <div className="space-y-2 text-sm">
          <MetadataRow 
            label="Audio Generated" 
            value={formData.audio_url ? 'Yes' : 'No'} 
            highlight={!!formData.audio_url}
          />
          {formData.audio_generated_at && (
            <MetadataRow 
              label="Generated At" 
              value={new Date(formData.audio_generated_at).toLocaleString()} 
            />
          )}
        </div>
      </div>

      {/* Audio Preview */}
      {formData.audio_url && (
        <div className="p-3 bg-bg-surface rounded-lg border border-border">
          <div className="text-xs text-text-muted uppercase tracking-wide mb-2">Audio Preview</div>
          <audio controls className="w-full h-10" src={formData.audio_url}>
            Your browser does not support audio playback.
          </audio>
        </div>
      )}
    </div>
  )
}

function MetadataRow({ label, value, mono, highlight }: { label: string; value: any; mono?: boolean; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-text-muted">{label}</span>
      <span className={`${mono ? 'font-mono text-xs' : ''} ${highlight ? 'text-green-400' : 'text-text'}`}>
        {value ?? '-'}
      </span>
    </div>
  )
}

function CharacterEditForm({ formData, setFormData }: { formData: any; setFormData: (d: any) => void }) {
  const filteredVoices = GOOGLE_TTS_VOICES.filter(v => 
    !formData.gender || formData.gender === 'unknown' || v.gender === formData.gender
  )

  return (
    <div className="space-y-4">
      {/* Character Name */}
      <div>
        <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wide">Character Name</label>
        <input
          type="text"
          value={formData.name || ''}
          onChange={(e) => setFormData({ ...formData, name: e.target.value.toUpperCase() })}
          className="w-full px-3 py-2.5 bg-bg-surface border border-border rounded-lg text-text font-mono uppercase focus:outline-none focus:border-accent"
        />
      </div>

      {/* Is User Character */}
      <label className="flex items-center gap-3 p-3 bg-bg-surface rounded-lg cursor-pointer hover:bg-bg-surface/80 transition-colors">
        <input
          type="checkbox"
          checked={formData.is_user_character || false}
          onChange={(e) => setFormData({ ...formData, is_user_character: e.target.checked })}
          className="w-4 h-4 rounded accent-accent"
        />
        <div>
          <div className="text-sm text-text">This is my character</div>
          <div className="text-xs text-text-muted">You'll speak this character's lines</div>
        </div>
      </label>

      {/* Gender */}
      <div>
        <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wide">Gender</label>
        <div className="flex gap-2">
          {['male', 'female', 'unknown'].map((g) => (
            <button
              key={g}
              onClick={() => setFormData({ ...formData, gender: g })}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                formData.gender === g
                  ? 'bg-accent text-white'
                  : 'bg-bg-surface text-text-muted hover:text-text border border-border'
              }`}
            >
              {g.charAt(0).toUpperCase() + g.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Age Range & Archetype Row */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wide">Age Range</label>
          <select
            value={formData.age_range || 'adult'}
            onChange={(e) => setFormData({ ...formData, age_range: e.target.value })}
            className="w-full px-3 py-2.5 bg-bg-surface border border-border rounded-lg text-text focus:outline-none focus:border-accent"
          >
            {AGE_RANGES.map(age => (
              <option key={age} value={age}>{age.charAt(0).toUpperCase() + age.slice(1)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wide">Archetype</label>
          <select
            value={formData.archetype || 'friend'}
            onChange={(e) => setFormData({ ...formData, archetype: e.target.value })}
            className="w-full px-3 py-2.5 bg-bg-surface border border-border rounded-lg text-text focus:outline-none focus:border-accent"
          >
            {CHARACTER_ARCHETYPES.map(arch => (
              <option key={arch} value={arch}>
                {arch.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Vocal Tone & Accent Row */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wide">Vocal Tone</label>
          <select
            value={formData.vocal_tone || 'natural'}
            onChange={(e) => setFormData({ ...formData, vocal_tone: e.target.value })}
            className="w-full px-3 py-2.5 bg-bg-surface border border-border rounded-lg text-text focus:outline-none focus:border-accent"
          >
            <option value="natural">Natural</option>
            {VOCAL_TONES.map(tone => (
              <option key={tone} value={tone}>{tone.charAt(0).toUpperCase() + tone.slice(1)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wide">Accent</label>
          <select
            value={formData.accent_hint || 'en-AU'}
            onChange={(e) => setFormData({ ...formData, accent_hint: e.target.value })}
            className="w-full px-3 py-2.5 bg-bg-surface border border-border rounded-lg text-text focus:outline-none focus:border-accent"
          >
            {ACCENTS.map(accent => (
              <option key={accent.code} value={accent.code}>{accent.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Voice Selection */}
      {!formData.is_user_character && (
        <div>
          <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wide">AI Voice</label>
          <select
            value={formData.voice_name || ''}
            onChange={(e) => {
              const voice = GOOGLE_TTS_VOICES.find(v => v.name === e.target.value)
              const locale = formData.accent_hint || 'en-AU'
              setFormData({ 
                ...formData, 
                voice_name: e.target.value,
                voice_id: voice ? buildVoiceId(voice.id, locale) : ''
              })
            }}
            className="w-full px-3 py-2.5 bg-bg-surface border border-border rounded-lg text-text focus:outline-none focus:border-accent"
          >
            <option value="">Auto-select based on character</option>
            <optgroup label="Female Voices">
              {filteredVoices.filter(v => v.gender === 'female').map(v => (
                <option key={v.id} value={v.name}>{v.name} - {v.archetype} ({v.tone})</option>
              ))}
            </optgroup>
            <optgroup label="Male Voices">
              {filteredVoices.filter(v => v.gender === 'male').map(v => (
                <option key={v.id} value={v.name}>{v.name} - {v.archetype} ({v.tone})</option>
              ))}
            </optgroup>
          </select>
        </div>
      )}

      {/* Description */}
      <div>
        <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wide">Description</label>
        <textarea
          value={formData.description || ''}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows={2}
          placeholder="Brief character description..."
          className="w-full px-3 py-2.5 bg-bg-surface border border-border rounded-lg text-text resize-none focus:outline-none focus:border-accent"
        />
      </div>

      {/* Default Emotion */}
      <div>
        <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wide">Default Emotion</label>
        <select
          value={formData.default_emotion || 'neutral'}
          onChange={(e) => setFormData({ ...formData, default_emotion: e.target.value })}
          className="w-full px-3 py-2.5 bg-bg-surface border border-border rounded-lg text-text focus:outline-none focus:border-accent"
        >
          {EMOTION_TAGS.slice(0, 12).map(emotion => (
            <option key={emotion} value={emotion}>
              {emotion.charAt(0).toUpperCase() + emotion.slice(1)}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

function ScriptEditForm({ formData, setFormData }: { formData: any; setFormData: (d: any) => void }) {
  return (
    <div className="space-y-4">
      {/* Title */}
      <div>
        <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wide">Title</label>
        <input
          type="text"
          value={formData.title || ''}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          className="w-full px-3 py-2.5 bg-bg-surface border border-border rounded-lg text-text focus:outline-none focus:border-accent"
        />
      </div>

      {/* Show Name */}
      <div>
        <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wide">Show / Series</label>
        <input
          type="text"
          value={formData.show_name || ''}
          onChange={(e) => setFormData({ ...formData, show_name: e.target.value })}
          placeholder="The Crown, Breaking Bad, etc."
          className="w-full px-3 py-2.5 bg-bg-surface border border-border rounded-lg text-text focus:outline-none focus:border-accent"
        />
      </div>

      {/* Season & Episode */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wide">Season</label>
          <input
            type="number"
            value={formData.season || ''}
            onChange={(e) => setFormData({ ...formData, season: e.target.value ? parseInt(e.target.value) : null })}
            placeholder="1"
            className="w-full px-3 py-2.5 bg-bg-surface border border-border rounded-lg text-text focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wide">Episode</label>
          <input
            type="number"
            value={formData.episode_number || ''}
            onChange={(e) => setFormData({ ...formData, episode_number: e.target.value ? parseInt(e.target.value) : null })}
            placeholder="1"
            className="w-full px-3 py-2.5 bg-bg-surface border border-border rounded-lg text-text focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      {/* User Role */}
      <div>
        <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wide">Your Character</label>
        <input
          type="text"
          value={formData.user_role || ''}
          onChange={(e) => setFormData({ ...formData, user_role: e.target.value.toUpperCase() })}
          className="w-full px-3 py-2.5 bg-bg-surface border border-border rounded-lg text-text font-mono uppercase focus:outline-none focus:border-accent"
        />
      </div>

      {/* Script Type & Format */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wide">Type</label>
          <select
            value={formData.script_type || formData.type || 'tv_audition'}
            onChange={(e) => setFormData({ ...formData, script_type: e.target.value, type: e.target.value })}
            className="w-full px-3 py-2.5 bg-bg-surface border border-border rounded-lg text-text focus:outline-none focus:border-accent"
          >
            <option value="tv_audition">TV Audition</option>
            <option value="film_audition">Film Audition</option>
            <option value="self_tape">Self Tape</option>
            <option value="scene_study">Scene Study</option>
            <option value="theatre">Theatre</option>
            <option value="commercial">Commercial</option>
            <option value="voiceover">Voiceover</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wide">Format</label>
          <select
            value={formData.format_type || ''}
            onChange={(e) => setFormData({ ...formData, format_type: e.target.value })}
            className="w-full px-3 py-2.5 bg-bg-surface border border-border rounded-lg text-text focus:outline-none focus:border-accent"
          >
            <option value="">Auto-detected</option>
            <option value="screenplay">Screenplay</option>
            <option value="teleplay">Teleplay</option>
            <option value="stageplay">Stage Play</option>
            <option value="commercial">Commercial</option>
            <option value="monologue">Monologue</option>
          </select>
        </div>
      </div>

      {/* Accent */}
      <div>
        <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wide">Default Accent</label>
        <select
          value={formData.accent_hint || 'australian'}
          onChange={(e) => setFormData({ ...formData, accent_hint: e.target.value })}
          className="w-full px-3 py-2.5 bg-bg-surface border border-border rounded-lg text-text focus:outline-none focus:border-accent"
        >
          <option value="australian">Australian</option>
          <option value="british">British</option>
          <option value="american">American</option>
          <option value="indian">Indian</option>
        </select>
      </div>

      {/* Writer & Draft */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wide">Writer</label>
          <input
            type="text"
            value={formData.writer || ''}
            onChange={(e) => setFormData({ ...formData, writer: e.target.value })}
            placeholder="Writer name"
            className="w-full px-3 py-2.5 bg-bg-surface border border-border rounded-lg text-text focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wide">Draft</label>
          <input
            type="text"
            value={formData.draft || ''}
            onChange={(e) => setFormData({ ...formData, draft: e.target.value })}
            placeholder="First, Final, etc."
            className="w-full px-3 py-2.5 bg-bg-surface border border-border rounded-lg text-text focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      {/* Scene Description */}
      <div>
        <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wide">Scene Description</label>
        <textarea
          value={formData.scene_description || ''}
          onChange={(e) => setFormData({ ...formData, scene_description: e.target.value })}
          rows={2}
          placeholder="Brief description of the scene..."
          className="w-full px-3 py-2.5 bg-bg-surface border border-border rounded-lg text-text resize-none focus:outline-none focus:border-accent"
        />
      </div>
    </div>
  )
}

// Export the edit helpers
export async function updateLine(lineId: string, updates: any): Promise<boolean> {
  const headers = await getAuthHeaders()
  
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/lines?id=eq.${lineId}`,
    {
      method: 'PATCH',
      headers: { ...headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify(updates)
    }
  )
  return response.ok
}

export async function deleteLine(lineId: string): Promise<boolean> {
  const headers = await getAuthHeaders()
  
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/lines?id=eq.${lineId}`,
    {
      method: 'DELETE',
      headers
    }
  )
  return response.ok
}

export async function addLine(lineData: any): Promise<any> {
  const headers = await getAuthHeaders()
  
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/lines`,
    {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'return=representation' },
      body: JSON.stringify(lineData)
    }
  )
  
  if (response.ok) {
    const data = await response.json()
    return Array.isArray(data) ? data[0] : data
  }
  return null
}

export async function updateCharacter(characterId: string, updates: any): Promise<boolean> {
  const headers = await getAuthHeaders()
  
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/characters?id=eq.${characterId}`,
    {
      method: 'PATCH',
      headers: { ...headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify(updates)
    }
  )
  return response.ok
}

export async function updateScript(scriptId: string, updates: any): Promise<boolean> {
  const headers = await getAuthHeaders()
  
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/scripts?id=eq.${scriptId}`,
    {
      method: 'PATCH',
      headers: { ...headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify(updates)
    }
  )
  return response.ok
}
