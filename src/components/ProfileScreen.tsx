
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore, useSettings } from '@/store'
import { Card, Button } from './ui'
import { IconLogout } from './icons'
import { supabase, getAuthHeaders } from '@/lib/supabase'
import { useAchievements, Achievement } from '@/hooks/useAchievements'
import { AchievementIcon } from './AchievementNotification'

export function ProfileScreen() {
  const { user, setUser, setActiveTab } = useStore()
  const { settings, updateSettings } = useSettings()
  const [loggingOut, setLoggingOut] = useState(false)
  const [activeModal, setActiveModal] = useState<'edit-profile' | 'achievements' | 'voice' | null>(null)
  
  // Achievements
  const { 
    achievements, 
    userAchievements, 
    loading: achievementsLoading, 
    getProgress, 
    isUnlocked, 
    totalPoints, 
    unlockedCount, 
    totalCount 
  } = useAchievements()
  
  // Edit profile form state
  const [editName, setEditName] = useState(user?.full_name || '')
  const [editEmail, setEditEmail] = useState(user?.email || '')
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  useEffect(() => {
    setEditName(user?.full_name || '')
    setEditEmail(user?.email || '')
  }, [user?.full_name, user?.email])

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await supabase.auth.signOut()
      setUser(null)
      if (typeof window !== 'undefined') {
        window.location.href = window.location.origin
      }
    } catch (err) {
      console.error('Logout error:', err)
      setLoggingOut(false)
    }
  }

  const handleSaveProfile = async () => {
    if (!user?.id) return
    setSaving(true)
    setSaveMessage(null)
    
    try {
      if (editName.trim() !== user.full_name) {
        const headers = await getAuthHeaders()
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`,
          {
            method: 'PATCH',
            headers: { ...headers, 'Prefer': 'return=representation' },
            body: JSON.stringify({ full_name: editName.trim() })
          }
        )
        
        if (res.ok) {
          const updated = await res.json()
          if (updated.length > 0) {
            setUser({ ...user, ...updated[0] })
          }
        } else {
          throw new Error('Failed to update name')
        }
      }
      
      if (editEmail.trim() !== user.email && editEmail.trim()) {
        const { error } = await supabase.auth.updateUser({ email: editEmail.trim() })
        if (error) throw new Error(error.message)
        setSaveMessage({ type: 'success', text: 'Check your new email for a confirmation link!' })
        return
      }
      
      setSaveMessage({ type: 'success', text: 'Profile updated!' })
      setTimeout(() => setActiveModal(null), 1000)
    } catch (err: any) {
      console.error('Error updating profile:', err)
      setSaveMessage({ type: 'error', text: err.message || 'Failed to update profile' })
    } finally {
      setSaving(false)
    }
  }

  const firstName = user?.full_name?.split(' ')[0] || 'Actor'
  
  // Group achievements by difficulty
  const easyAchievements = achievements.filter(a => a.difficulty === 'easy')
  const mediumAchievements = achievements.filter(a => a.difficulty === 'medium')
  const hardAchievements = achievements.filter(a => a.difficulty === 'hard')

  return (
    <div className="h-full flex flex-col pb-24 overflow-y-auto">
      {/* Header */}
      <div className="px-5 pt-8 pb-6">
        <h1 className="text-2xl font-display text-text mb-6">Profile</h1>
        
        {/* User Card */}
        <Card padding="p-5">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-accent to-accent/50 flex items-center justify-center">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
              ) : (
                <span className="text-2xl font-bold text-white">
                  {firstName.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-medium text-text truncate">{user?.full_name || 'Actor'}</h2>
              <p className="text-sm text-text-muted truncate">{user?.email}</p>
              <span className="inline-block mt-1.5 px-2 py-0.5 bg-accent/10 text-accent text-xs rounded-full font-medium">
                {user?.subscription_tier === 'pro' ? 'Pro' : 'Free Plan'}
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Settings Sections */}
      <div className="px-5 space-y-4">
        {/* Account Section */}
        <Card padding="p-0">
          <div className="px-4 py-3 border-b border-border/50">
            <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide">Account</h3>
          </div>
          <div className="divide-y divide-border/30">
            <button 
              onClick={() => { setSaveMessage(null); setActiveModal('edit-profile'); }}
              className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-bg-surface flex items-center justify-center">
                  <svg className="w-4 h-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                </div>
                <div className="text-left">
                  <span className="text-sm text-text block">Edit Profile</span>
                  <span className="text-xs text-text-muted">Name, email</span>
                </div>
              </div>
              <svg className="w-4 h-4 text-text-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </Card>

        {/* Achievements Section */}
        <Card padding="p-0">
          <button 
            onClick={() => setActiveModal('achievements')}
            className="w-full text-left"
          >
            <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
              <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide">Achievements</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-accent">{totalPoints} pts</span>
                <span className="text-xs text-text-muted">{unlockedCount}/{totalCount}</span>
              </div>
            </div>
            
            {/* Achievement Icons Grid */}
            <div className="p-4 space-y-4">
              {/* Easy Row */}
              <div>
                <p className="text-[10px] text-text-subtle uppercase tracking-wider mb-2">Beginner</p>
                <div className="flex flex-wrap gap-2">
                  {easyAchievements.map((achievement) => (
                    <div 
                      key={achievement.id}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                        isUnlocked(achievement.id) 
                          ? 'bg-green-500/20 border border-green-500/30' 
                          : 'bg-bg-elevated border border-border/30 opacity-40'
                      }`}
                    >
                      <AchievementIcon 
                        icon={achievement.icon} 
                        className={`w-4 h-4 ${isUnlocked(achievement.id) ? 'text-green-400' : 'text-text-subtle'}`}
                      />
                    </div>
                  ))}
                  {/* Mystery achievement */}
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-bg-elevated border border-border/30 opacity-40">
                    <svg className="w-4 h-4 text-text-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                    </svg>
                  </div>
                </div>
              </div>
              
              {/* Medium Row */}
              <div>
                <p className="text-[10px] text-text-subtle uppercase tracking-wider mb-2">Intermediate</p>
                <div className="flex flex-wrap gap-2">
                  {mediumAchievements.map((achievement) => (
                    <div 
                      key={achievement.id}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                        isUnlocked(achievement.id) 
                          ? 'bg-accent/20 border border-accent/30' 
                          : 'bg-bg-elevated border border-border/30 opacity-40'
                      }`}
                    >
                      <AchievementIcon 
                        icon={achievement.icon} 
                        className={`w-4 h-4 ${isUnlocked(achievement.id) ? 'text-accent' : 'text-text-subtle'}`}
                      />
                    </div>
                  ))}
                  {/* Mystery achievement */}
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-bg-elevated border border-border/30 opacity-40">
                    <svg className="w-4 h-4 text-text-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                    </svg>
                  </div>
                </div>
              </div>
              
              {/* Hard Row */}
              <div>
                <p className="text-[10px] text-text-subtle uppercase tracking-wider mb-2">Expert</p>
                <div className="flex flex-wrap gap-2">
                  {hardAchievements.map((achievement) => (
                    <div 
                      key={achievement.id}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                        isUnlocked(achievement.id) 
                          ? 'bg-yellow-500/20 border border-yellow-500/30' 
                          : 'bg-bg-elevated border border-border/30 opacity-40'
                      }`}
                    >
                      <AchievementIcon 
                        icon={achievement.icon} 
                        className={`w-4 h-4 ${isUnlocked(achievement.id) ? 'text-yellow-400' : 'text-text-subtle'}`}
                      />
                    </div>
                  ))}
                  {/* Mystery achievement */}
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-bg-elevated border border-border/30 opacity-40">
                    <svg className="w-4 h-4 text-text-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Tap to view more hint */}
            <div className="px-4 pb-3 flex items-center justify-center gap-1 text-text-subtle">
              <span className="text-[10px]">Tap to view details</span>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>
        </Card>

        {/* Practice Settings Section */}
        <Card padding="p-0">
          <div className="px-4 py-3 border-b border-border/50">
            <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide">Practice Settings</h3>
          </div>
          <div className="divide-y divide-border/30">
            <button 
              onClick={() => setActiveModal('voice')}
              className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-bg-surface flex items-center justify-center">
                  <svg className="w-4 h-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                  </svg>
                </div>
                <div className="text-left">
                  <span className="text-sm text-text block">Voice & Playback</span>
                  <span className="text-xs text-text-muted">Speed, text visibility</span>
                </div>
              </div>
              <svg className="w-4 h-4 text-text-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </Card>

        {/* Support Section */}
        <Card padding="p-0">
          <div className="px-4 py-3 border-b border-border/50">
            <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide">Support</h3>
          </div>
          <div className="divide-y divide-border/30">
            <a 
              href="mailto:support@sceneread.app"
              className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-bg-surface flex items-center justify-center">
                  <svg className="w-4 h-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                </div>
                <div className="text-left">
                  <span className="text-sm text-text block">Contact Support</span>
                  <span className="text-xs text-text-muted">Get help via email</span>
                </div>
              </div>
              <svg className="w-4 h-4 text-text-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </a>
          </div>
        </Card>
      </div>

      {/* Actions */}
      <div className="px-5 mt-6 mb-4 space-y-3">
        <button 
          onClick={() => {
            if (typeof window !== 'undefined') {
              localStorage.removeItem('sceneread-tutorial-complete')
            }
            setActiveTab('home')
          }}
          className="w-full py-3 px-4 bg-bg-surface rounded-xl text-sm text-text-muted hover:text-text hover:bg-bg-surface/80 transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Replay Tutorial
        </button>
        
        <Button 
          onClick={handleLogout}
          disabled={loggingOut}
          variant="secondary"
          className="w-full flex items-center justify-center gap-2"
        >
          <IconLogout size={18} />
          {loggingOut ? 'Logging out...' : 'Log Out'}
        </Button>
        
        <p className="text-center text-xs text-text-subtle">
          SceneRead v1.0.0
        </p>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {activeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
            onClick={() => setActiveModal(null)}
          >
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="absolute inset-0 bg-bg flex flex-col"
            >
              {/* Modal Header */}
              <div className="flex items-center gap-3 px-4 py-4 border-b border-border">
                <button
                  onClick={() => setActiveModal(null)}
                  className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors"
                >
                  <svg className="w-6 h-6 text-text" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <h2 className="text-lg font-medium text-text">
                  {activeModal === 'edit-profile' && 'Edit Profile'}
                  {activeModal === 'achievements' && 'Achievements'}
                  {activeModal === 'voice' && 'Voice & Playback'}
                </h2>
                {activeModal === 'achievements' && (
                  <div className="ml-auto flex items-center gap-1.5 px-3 py-1 bg-accent/10 rounded-full">
                    <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                    </svg>
                    <span className="text-sm font-semibold text-accent">{totalPoints}</span>
                  </div>
                )}
              </div>

              {/* Modal Content */}
              <div className="flex-1 overflow-y-auto p-5">
                {/* Edit Profile Modal */}
                {activeModal === 'edit-profile' && (
                  <div className="space-y-4">
                    {saveMessage && (
                      <div className={`p-3 rounded-lg text-sm ${
                        saveMessage.type === 'success' 
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                          : 'bg-red-500/20 text-red-400 border border-red-500/30'
                      }`}>
                        {saveMessage.text}
                      </div>
                    )}
                    
                    <div>
                      <label className="block text-sm font-medium text-text mb-2">Display Name</label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Your name"
                        className="w-full px-4 py-3 bg-bg-surface border border-border rounded-xl text-text placeholder:text-text-muted/50 focus:outline-none focus:border-accent"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-text mb-2">Email</label>
                      <input
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        placeholder="your@email.com"
                        className="w-full px-4 py-3 bg-bg-surface border border-border rounded-xl text-text placeholder:text-text-muted/50 focus:outline-none focus:border-accent"
                      />
                      <p className="text-xs text-text-muted mt-1">
                        Changing email will send a confirmation link to your new address
                      </p>
                    </div>
                    
                    <Button
                      onClick={handleSaveProfile}
                      disabled={saving}
                      className="w-full mt-4"
                    >
                      {saving ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </div>
                )}

                {/* Achievements Modal */}
                {activeModal === 'achievements' && (
                  <div className="space-y-6">
                    {/* Progress Overview */}
                    <div className="bg-bg-surface rounded-xl p-4 border border-border">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm text-text-muted">Overall Progress</span>
                        <span className="text-sm font-medium text-text">{unlockedCount} / {totalCount}</span>
                      </div>
                      <div className="h-2 bg-bg-elevated rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-accent to-rose-500 rounded-full transition-all duration-500"
                          style={{ width: `${(unlockedCount / totalCount) * 100}%` }}
                        />
                      </div>
                    </div>

                    {/* Easy Achievements */}
                    <div>
                      <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-3">Beginner</h3>
                      <div className="space-y-2">
                        {easyAchievements.map((achievement) => (
                          <AchievementCard 
                            key={achievement.id} 
                            achievement={achievement} 
                            unlocked={isUnlocked(achievement.id)}
                            progress={getProgress(achievement)}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Medium Achievements */}
                    <div>
                      <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-3">Intermediate</h3>
                      <div className="space-y-2">
                        {mediumAchievements.map((achievement) => (
                          <AchievementCard 
                            key={achievement.id} 
                            achievement={achievement} 
                            unlocked={isUnlocked(achievement.id)}
                            progress={getProgress(achievement)}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Hard Achievements */}
                    <div>
                      <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-3">Expert</h3>
                      <div className="space-y-2">
                        {hardAchievements.map((achievement) => (
                          <AchievementCard 
                            key={achievement.id} 
                            achievement={achievement} 
                            unlocked={isUnlocked(achievement.id)}
                            progress={getProgress(achievement)}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Voice & Playback Modal */}
                {activeModal === 'voice' && (
                  <div className="space-y-6">
                    {/* Sound Settings */}
                    <div className="space-y-4">
                      <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide">Sound & Feedback</h3>
                      <ToggleSetting
                        label="Sound on Correct"
                        description="Play a sound when you say a line correctly"
                        value={settings.playSoundOnCorrect}
                        onChange={(v) => updateSettings({ playSoundOnCorrect: v })}
                      />
                      <ToggleSetting
                        label="Sound on Wrong"
                        description="Play a sound when you make a mistake"
                        value={settings.playSoundOnWrong}
                        onChange={(v) => updateSettings({ playSoundOnWrong: v })}
                      />
                      <ToggleSetting
                        label="Auto-Advance"
                        description="Automatically move to the next line after correct answer"
                        value={settings.autoAdvanceOnCorrect}
                        onChange={(v) => updateSettings({ autoAdvanceOnCorrect: v })}
                      />
                      <ToggleSetting
                        label="Show Live Transcript"
                        description="Show what you're saying in real-time"
                        value={settings.showLiveTranscript}
                        onChange={(v) => updateSettings({ showLiveTranscript: v })}
                      />
                    </div>

                    <div className="border-t border-border pt-6">
                      <h3 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-4">Playback</h3>
                      
                      {/* Playback Speed */}
                      <div className="mb-6">
                        <label className="block text-sm font-medium text-text mb-3">Playback Speed</label>
                        <div className="flex gap-2">
                          {[0.5, 0.75, 1, 1.25, 1.5].map((speed) => (
                            <button
                              key={speed}
                              onClick={() => updateSettings({ playbackSpeed: speed })}
                              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                                settings.playbackSpeed === speed
                                  ? 'bg-accent text-white'
                                  : 'bg-bg-surface text-text-muted hover:text-text'
                              }`}
                            >
                              {speed}x
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Text Visibility */}
                      <div className="mb-6">
                        <label className="block text-sm font-medium text-text mb-3">Text Visibility (Your Lines)</label>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { value: 'full', label: 'Full Text' },
                            { value: 'first-letter', label: 'First Letter' },
                            { value: 'blurred', label: 'Blurred' },
                            { value: 'hidden', label: 'Hidden' },
                          ].map((option) => (
                            <button
                              key={option.value}
                              onClick={() => updateSettings({ textVisibility: option.value as any })}
                              className={`py-2.5 px-3 rounded-lg text-sm font-medium transition-colors ${
                                settings.textVisibility === option.value
                                  ? 'bg-accent text-white'
                                  : 'bg-bg-surface text-text-muted hover:text-text'
                              }`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Silence Duration */}
                      <div>
                        <label className="block text-sm font-medium text-text mb-3">
                          Silence Detection: {(settings.silenceDuration / 1000).toFixed(1)}s
                        </label>
                        <input
                          type="range"
                          min="500"
                          max="3000"
                          step="100"
                          value={settings.silenceDuration}
                          onChange={(e) => updateSettings({ silenceDuration: parseInt(e.target.value) })}
                          className="w-full accent-accent"
                        />
                        <p className="text-xs text-text-muted mt-1">
                          How long to wait after you stop speaking before processing
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Sticky Footer */}
              <div className="flex-shrink-0 px-5 pt-4 pb-8 border-t border-border bg-bg">
                {activeModal === 'edit-profile' ? (
                  <Button
                    onClick={handleSaveProfile}
                    disabled={saving || !editName.trim()}
                    className="w-full"
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </Button>
                ) : (
                  <Button onClick={() => setActiveModal(null)} className="w-full">Done</Button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// Achievement Card Component
function AchievementCard({ 
  achievement, 
  unlocked,
  progress
}: { 
  achievement: Achievement
  unlocked: boolean
  progress: { current: number; target: number; percentage: number }
}) {
  const difficultyColors = {
    easy: 'border-green-500/30 bg-green-500/5',
    medium: 'border-accent/30 bg-accent/5',
    hard: 'border-yellow-500/30 bg-yellow-500/5'
  }
  
  const iconColors = {
    easy: 'text-green-400',
    medium: 'text-accent',
    hard: 'text-yellow-400'
  }

  return (
    <div className={`rounded-xl border p-4 transition-all ${
      unlocked 
        ? difficultyColors[achievement.difficulty]
        : 'border-border/50 bg-bg-surface opacity-60'
    }`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
          unlocked ? 'bg-white/10' : 'bg-bg-elevated'
        }`}>
          <AchievementIcon 
            icon={achievement.icon} 
            className={`w-5 h-5 ${unlocked ? iconColors[achievement.difficulty] : 'text-text-subtle'}`}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className={`text-sm font-medium truncate ${unlocked ? 'text-text' : 'text-text-muted'}`}>
              {achievement.name}
            </h4>
            <span className={`text-xs font-medium ${unlocked ? 'text-accent' : 'text-text-subtle'}`}>
              +{achievement.points}
            </span>
          </div>
          <p className="text-xs text-text-muted mt-0.5">{achievement.description}</p>
          
          {!unlocked && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-[10px] text-text-subtle mb-1">
                <span>{progress.current} / {progress.target}</span>
                <span>{progress.percentage}%</span>
              </div>
              <div className="h-1 bg-bg-elevated rounded-full overflow-hidden">
                <div 
                  className="h-full bg-text-subtle rounded-full transition-all"
                  style={{ width: `${progress.percentage}%` }}
                />
              </div>
            </div>
          )}
          
          {unlocked && (
            <div className="flex items-center gap-1 mt-1.5">
              <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-[10px] text-green-400 font-medium">Unlocked</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Toggle Setting Component
function ToggleSetting({ 
  label, 
  description, 
  value, 
  onChange 
}: { 
  label: string
  description: string
  value: boolean
  onChange: (value: boolean) => void 
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex-1 pr-4">
        <div className="text-sm font-medium text-text">{label}</div>
        <div className="text-xs text-text-muted">{description}</div>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-11 h-6 rounded-full transition-colors ${
          value ? 'bg-accent' : 'bg-bg-surface'
        }`}
      >
        <div
          className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
            value ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  )
}
