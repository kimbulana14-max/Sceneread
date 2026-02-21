'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore, useScriptPractice } from '@/store'
import { Card, Button } from './ui'
import { IconPlay } from './icons'
import { getAuthHeaders } from '@/lib/supabase'
import { WelcomeSplash } from './WelcomeSplash'

interface DailyStat {
  date: string
  practice_minutes: number
  lines_practiced: number
  sessions_count: number
}

interface HomeScreenProps {
  onCompleteOnboarding?: () => void
}

// Tutorial steps with element targeting
const TUTORIAL_STEPS = [
  {
    target: null, // Welcome - no target, centered
    title: 'Welcome to SceneRead',
    description: 'Practice your lines with AI scene partners. Let\'s take a quick tour!',
    position: 'center' as const,
  },
  {
    target: 'tab-library',
    title: 'Import Scripts',
    description: 'Upload PDFs, paste text, or import from your files.',
    position: 'top' as const,
  },
  {
    target: 'tab-practice',
    title: 'Practice',
    description: 'Run lines with AI reading your cues. Multiple modes available.',
    position: 'top' as const,
  },
  {
    target: 'tab-record',
    title: 'Self-Tape',
    description: 'Record audition tapes with AI scene partners.',
    position: 'top' as const,
  },
  {
    target: 'streak-card',
    title: 'Track Progress',
    description: 'Build a daily streak and watch your stats grow.',
    position: 'bottom' as const,
  },
]

export function HomeScreen({ onCompleteOnboarding }: HomeScreenProps) {
  const { user, scripts, setScripts, setActiveTab, setCurrentScript, setScenes, setLines, setCharacters } = useStore()
  const { scriptStates, getScriptState } = useScriptPractice()
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([])
  const [loading, setLoading] = useState(true)
  const [greeting, setGreeting] = useState('')
  
  // Tutorial state - controlled by user.onboarding_complete from Supabase
  const [showSplash, setShowSplash] = useState(false)
  const [showTutorial, setShowTutorial] = useState(false)
  const [tutorialStep, setTutorialStep] = useState(0)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const tutorialTriggered = useRef(false)

  // Get target element position
  const updateTargetPosition = useCallback(() => {
    if (!showTutorial) return
    const step = TUTORIAL_STEPS[tutorialStep]
    if (step?.target) {
      const el = document.querySelector(`[data-tutorial="${step.target}"]`)
      if (el) {
        setTargetRect(el.getBoundingClientRect())
      }
    }
  }, [showTutorial, tutorialStep])

  useEffect(() => {
    updateTargetPosition()
    window.addEventListener('resize', updateTargetPosition)
    return () => window.removeEventListener('resize', updateTargetPosition)
  }, [updateTargetPosition])

  // Check if tutorial should show - based on Supabase user.onboarding_complete
  useEffect(() => {
    // Only check once per component mount
    if (tutorialTriggered.current) return
    if (!user?.id) return
    
    // Check the onboarding_complete flag from Supabase profile
    const isOnboardingComplete = user.onboarding_complete === true
    
    if (isOnboardingComplete) {
      // User already completed onboarding - never show splash or tutorial
      setShowSplash(false)
      setShowTutorial(false)
      return
    }
    
    // First time user - show welcome splash first, then tutorial
    tutorialTriggered.current = true
    setShowSplash(true)
  }, [user?.id, user?.onboarding_complete])
  
  // When splash completes, show tutorial
  const handleSplashComplete = () => {
    setShowSplash(false)
    setShowTutorial(true)
  }

  const handleNextStep = () => {
    if (tutorialStep < TUTORIAL_STEPS.length - 1) {
      setTutorialStep(tutorialStep + 1)
    } else {
      completeTutorial()
    }
  }

  const handleSkipTutorial = () => {
    completeTutorial()
  }

  const completeTutorial = () => {
    setShowTutorial(false)
    setTutorialStep(0)
    // Mark onboarding complete in Supabase via parent callback
    if (onCompleteOnboarding) {
      onCompleteOnboarding()
    }
  }

  useEffect(() => {
    const hour = new Date().getHours()
    if (hour < 12) setGreeting('Good morning')
    else if (hour < 17) setGreeting('Good afternoon')
    else setGreeting('Good evening')
  }, [])

  useEffect(() => {
    if (user?.id) fetchUserData()
  }, [user?.id])

  const fetchUserData = async () => {
    if (!user?.id) return
    
    // Only show loading state if we don't have scripts already
    const hasExistingScripts = scripts && scripts.length > 0
    if (!hasExistingScripts) {
      setLoading(true)
    }
    
    try {
      // Use getAuthHeaders which properly gets the session token
      const headers = await getAuthHeaders()

      // Always fetch scripts to ensure we have latest
      const scriptsRes = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/scripts?user_id=eq.${user.id}&is_archived=eq.false&order=updated_at.desc`,
        { headers }
      )
      if (scriptsRes.ok) {
        const scriptsData = await scriptsRes.json()
        setScripts(scriptsData)
      }

      // Fetch daily stats (last 14 days)
      const fourteenDaysAgo = new Date()
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)
      const statsRes = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/daily_stats?user_id=eq.${user.id}&date=gte.${fourteenDaysAgo.toISOString().split('T')[0]}&order=date.desc`,
        { headers }
      )
      if (statsRes.ok) {
        const stats = await statsRes.json()
        setDailyStats(stats)
      }
    } catch (err) {
      console.error('Error fetching user data:', err)
    } finally {
      setLoading(false)
    }
  }

  // Load script data and go to practice
  const handleContinuePractice = async (script: any) => {
    try {
      const headers = await getAuthHeaders()

      // Fetch scenes, lines, characters
      const [scenesRes, linesRes, charsRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/scenes?script_id=eq.${script.id}&order=sort_order`, { headers }),
        fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/lines?script_id=eq.${script.id}&order=sort_order`, { headers }),
        fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/characters?script_id=eq.${script.id}`, { headers }),
      ])

      if (scenesRes.ok && linesRes.ok && charsRes.ok) {
        const [scenes, lines, characters] = await Promise.all([
          scenesRes.json(),
          linesRes.json(),
          charsRes.json(),
        ])
        
        setCurrentScript(script)
        setScenes(scenes)
        setLines(lines)
        setCharacters(characters)
        setActiveTab('practice')
      }
    } catch (err) {
      console.error('Error loading script:', err)
    }
  }

  // Calculate stats
  const totalMinutes = user?.total_practice_minutes || 0
  const totalLines = user?.total_lines_practiced || 0
  const streakDays = user?.streak_days || 0
  const totalScripts = scripts?.length || 0
  
  // Get most recent script (by updated_at)
  const lastScript = scripts?.length > 0 
    ? [...scripts].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0]
    : null

  // Generate mini heatmap (last 7 days)
  const generateMiniHeatmap = () => {
    const days: { date: Date; count: number }[] = []
    const today = new Date()
    
    for (let d = 6; d >= 0; d--) {
      const date = new Date(today)
      date.setDate(today.getDate() - d)
      // Use local date string to match database format (YYYY-MM-DD)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const dateStr = `${year}-${month}-${day}`
      const stat = dailyStats.find(s => s.date === dateStr)
      days.push({ date, count: stat?.lines_practiced || 0 })
    }
    return days
  }

  const miniHeatmap = generateMiniHeatmap()
  const todayPracticed = miniHeatmap[6]?.count > 0
  const daysWithPractice = miniHeatmap.filter(d => d.count > 0).length

  const getHeatmapColor = (count: number) => {
    if (count === 0) return 'bg-overlay-5'
    if (count < 5) return 'bg-accent/30'
    if (count < 15) return 'bg-accent/50'
    if (count < 30) return 'bg-accent/70'
    return 'bg-accent'
  }

  const firstName = user?.full_name?.split(' ')[0] || 'Actor'

  return (
    <div className="h-full flex flex-col pb-24 overflow-y-auto">
      {/* Welcome Splash for first-time users */}
      <AnimatePresence>
        {showSplash && (
          <WelcomeSplash 
            name={user?.full_name || undefined} 
            onComplete={handleSplashComplete} 
          />
        )}
      </AnimatePresence>
      
      {/* Header */}
      <div className="px-5 pt-8 pb-4">
        <div className="flex items-start justify-between mb-8">
          <div>
            <p className="text-text-muted text-sm mb-1">{greeting}</p>
            <h1 className="text-2xl font-display text-text">{firstName}</h1>
          </div>
          <button 
            onClick={() => setActiveTab('profile')}
            className="w-10 h-10 rounded-full bg-bg-surface border border-border flex items-center justify-center"
          >
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
            ) : (
              <span className="text-sm font-medium text-text">
                {firstName.charAt(0).toUpperCase()}
              </span>
            )}
          </button>
        </div>

        {/* Compact Streak Row */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-3 rounded-xl bg-bg-surface border border-border mt-5"
          data-tutorial="streak-card"
        >
          {/* Animated Flame */}
          <motion.div 
            className={`w-11 h-11 rounded-xl flex items-center justify-center ${streakDays > 0 ? 'bg-gradient-to-br from-accent to-rose-600' : 'bg-bg-elevated'}`}
            animate={streakDays > 0 ? { scale: [1, 1.05, 1] } : {}}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1A3.75 3.75 0 0012 18z" />
            </svg>
          </motion.div>
          
          {/* Streak Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-bold text-text">{streakDays}</span>
              <span className="text-sm text-text-muted">day streak</span>
            </div>
            <p className="text-[11px] text-text-subtle">
              {todayPracticed ? '✓ Practiced today' : 'Practice to continue'}
            </p>
          </div>
          
          {/* Mini Week Dots */}
          <div className="flex gap-1">
            {miniHeatmap.map((day, i) => (
              <motion.div
                key={i}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: i * 0.05 }}
                className={`w-2.5 h-2.5 rounded-full ${
                  day.count > 0 
                    ? 'bg-accent' 
                    : i === 6 
                      ? 'border border-dashed border-accent/50 bg-transparent' 
                      : 'bg-overlay-10'
                }`}
                title={`${day.date.toLocaleDateString('en', { weekday: 'short' })}: ${day.count} lines`}
              />
            ))}
          </div>
        </motion.div>
        
        {/* Quick Stats Row */}
        <div className="flex gap-2 mt-2">
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex-1 p-3 rounded-xl bg-bg-surface border border-border text-center"
          >
            <div className="text-lg font-bold text-text">{totalLines}</div>
            <div className="text-[10px] text-text-muted uppercase tracking-wide">Lines</div>
          </motion.div>
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="flex-1 p-3 rounded-xl bg-bg-surface border border-border text-center"
          >
            <div className="text-lg font-bold text-text">{Math.round(totalMinutes)}</div>
            <div className="text-[10px] text-text-muted uppercase tracking-wide">Minutes</div>
          </motion.div>
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex-1 p-3 rounded-xl bg-bg-surface border border-border text-center"
          >
            <div className="text-lg font-bold text-text">{totalScripts}</div>
            <div className="text-[10px] text-text-muted uppercase tracking-wide">Scripts</div>
          </motion.div>
        </div>
      </div>

      {/* Continue Practice - Only show if there's a last script */}
      {loading && (!scripts || scripts.length === 0) ? (
        <div className="px-5 mt-2">
          <h2 className="text-xs font-medium text-text-muted mb-2">Continue Practicing</h2>
          <div className="w-full p-4 bg-bg-surface rounded-xl border border-border animate-pulse">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-overlay-5" />
              <div className="flex-1">
                <div className="h-4 bg-overlay-5 rounded w-3/4 mb-2" />
                <div className="h-3 bg-overlay-5 rounded w-1/2" />
              </div>
            </div>
          </div>
        </div>
      ) : lastScript ? (
        <div className="px-5 mt-2">
          <h2 className="text-xs font-medium text-text-muted mb-2">Continue Practicing</h2>
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => handleContinuePractice(lastScript)}
            className="w-full p-4 bg-gradient-to-r from-accent/10 to-accent/5 rounded-xl border border-accent/20 hover:border-accent/40 transition-all text-left"
          >
            {(() => {
              const state = getScriptState(lastScript.id)
              const modeLabel = state.learningMode === 'practice' ? 'Practice' : state.learningMode === 'listen' ? 'Listen' : 'Repeat'
              const progress = state.completedLineIds.length
              return (
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-accent/20 flex items-center justify-center flex-shrink-0">
                    <IconPlay size={28} className="text-accent ml-1" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-base font-medium text-text truncate">{lastScript.title}</div>
                    <div className="text-sm text-text-muted truncate mt-0.5">
                      {lastScript.user_role} · {lastScript.total_lines || 0} lines
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent font-medium">{modeLabel}</span>
                      {progress > 0 && (
                        <span className="text-[10px] text-text-subtle">{progress} lines done</span>
                      )}
                    </div>
                  </div>
                  <svg className="w-5 h-5 text-accent flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              )
            })()}
          </motion.button>
        </div>
      ) : null}

      {/* Recent Scripts - sorted by most recent, show 3 */}
      {scripts && scripts.length > 0 && (
        <div className="px-5 mt-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-medium text-text-muted">Recent Scripts</h2>
            <button 
              onClick={() => setActiveTab('library')}
              className="text-xs text-accent"
            >
              View all
            </button>
          </div>
          <div className="space-y-2">
            {[...scripts]
              .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())
              .slice(0, 3)
              .map((script) => {
              const state = getScriptState(script.id)
              const hasProgress = state.completedLineIds.length > 0
              return (
                <motion.button
                  key={script.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleContinuePractice(script)}
                  className="w-full flex items-center gap-3 p-3 bg-bg-surface rounded-xl border border-border hover:border-accent/30 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-text truncate">{script.title}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-text-muted">{script.user_role}</span>
                      {hasProgress && (
                        <>
                          <span className="text-text-subtle">·</span>
                          <span className="text-[10px] px-1 py-0.5 rounded bg-accent/10 text-accent">{state.learningMode}</span>
                        </>
                      )}
                    </div>
                  </div>
                  {hasProgress ? (
                    <div className="text-xs text-accent font-medium">{state.completedLineIds.length}/{script.total_lines || '?'}</div>
                  ) : (
                    <svg className="w-4 h-4 text-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                </motion.button>
              )
            })}
          </div>
        </div>
      )}

      {/* Empty state for new users - only show when NOT loading and no scripts */}
      {!loading && (!scripts || scripts.length === 0) && (
        <div className="px-5 mt-6">
          <Card padding="p-6" className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent/10 flex items-center justify-center">
              <svg className="w-8 h-8 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-text mb-2">Ready to start rehearsing?</h3>
            <p className="text-sm text-text-muted mb-4">
              Upload your first script to begin practicing with AI scene partners.
            </p>
            <Button onClick={() => setActiveTab('library')} className="mx-auto">
              Go to Library
            </Button>
          </Card>
        </div>
      )}

      {/* Tip of the day */}
      <div className="px-5 mt-6 mb-4">
        <Card padding="p-4" className="bg-bg-surface/50">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-ai/10 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-ai" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div>
              <div className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1">Tip</div>
              <p className="text-sm text-text">
                Use Repeat mode to build long lines word by word. It's the most effective way to memorize difficult passages.
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Coach Marks Tutorial */}
      <AnimatePresence>
        {showTutorial && (
          <>
            {/* Welcome step - centered modal, no spotlight */}
            {TUTORIAL_STEPS[tutorialStep].target === null ? (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[100] bg-black/85"
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="fixed z-[102] inset-x-4 top-1/2 -translate-y-1/2 max-w-sm mx-auto"
                >
                  <div className="bg-bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden">
                    <div className="p-6 text-center">
                      <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" />
                        </svg>
                      </div>
                      <h3 className="text-xl font-semibold text-text mb-2">
                        {TUTORIAL_STEPS[tutorialStep].title}
                      </h3>
                      <p className="text-sm text-text-muted leading-relaxed">
                        {TUTORIAL_STEPS[tutorialStep].description}
                      </p>
                    </div>
                    <div className="px-6 py-4 bg-bg-subtle flex justify-center">
                      <button
                        onClick={handleNextStep}
                        className="px-8 py-2.5 bg-accent text-white rounded-xl text-sm font-medium hover:bg-accent/90"
                      >
                        Let's go
                      </button>
                    </div>
                  </div>
                </motion.div>
              </>
            ) : targetRect && (
              <>
                {/* Dark overlay with spotlight cutout */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-[100]"
                  style={{
                    background: `radial-gradient(ellipse ${targetRect.width + 32}px ${targetRect.height + 32}px at ${targetRect.left + targetRect.width / 2}px ${targetRect.top + targetRect.height / 2}px, transparent 0%, rgba(0,0,0,0.85) 100%)`
                  }}
                />
                
                {/* Spotlight ring */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="fixed z-[101] pointer-events-none"
                  style={{
                    left: targetRect.left - 6,
                    top: targetRect.top - 6,
                    width: targetRect.width + 12,
                    height: targetRect.height + 12,
                    borderRadius: 16,
                    border: '2px solid var(--accent-border)',
                    boxShadow: '0 0 0 4px var(--accent-muted)',
                  }}
                />

                {/* Tooltip - positioned based on step */}
                <motion.div
                  initial={{ opacity: 0, y: TUTORIAL_STEPS[tutorialStep].position === 'bottom' ? -10 : 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="fixed z-[102] w-72"
                  style={TUTORIAL_STEPS[tutorialStep].position === 'bottom' ? {
                    left: Math.min(Math.max(16, targetRect.left + targetRect.width / 2 - 144), window.innerWidth - 288 - 16),
                    top: targetRect.bottom + 16,
                  } : {
                    left: Math.min(Math.max(16, targetRect.left + targetRect.width / 2 - 144), window.innerWidth - 288 - 16),
                    bottom: window.innerHeight - targetRect.top + 16,
                  }}
                >
                  {/* Arrow pointing up (for bottom position) */}
                  {TUTORIAL_STEPS[tutorialStep].position === 'bottom' && (
                    <div className="flex justify-center mb-[-6px]">
                      <div className="w-3 h-3 bg-bg-surface rotate-45 shadow-lg" />
                    </div>
                  )}

                  {/* Tooltip content */}
                  <div className="bg-bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden">
                    <div className="p-4">
                      <h3 className="text-base font-semibold text-text mb-1">
                        {TUTORIAL_STEPS[tutorialStep].title}
                      </h3>
                      <p className="text-sm text-text-muted leading-relaxed">
                        {TUTORIAL_STEPS[tutorialStep].description}
                      </p>
                    </div>

                    {/* Footer */}
                    <div className="px-4 py-3 bg-bg-subtle flex items-center justify-between">
                      <div className="flex gap-1">
                        {TUTORIAL_STEPS.map((_, i) => (
                          <div
                            key={i}
                            className={`w-1.5 h-1.5 rounded-full ${i === tutorialStep ? 'bg-accent' : 'bg-text-subtle'}`}
                          />
                        ))}
                      </div>
                      <div className="flex gap-2">
                        {tutorialStep > 0 && (
                          <button
                            onClick={() => setTutorialStep(tutorialStep - 1)}
                            className="px-3 py-1.5 text-sm text-text-muted hover:text-text"
                          >
                            Back
                          </button>
                        )}
                        <button
                          onClick={handleNextStep}
                          className="px-4 py-1.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90"
                        >
                          {tutorialStep === TUTORIAL_STEPS.length - 1 ? 'Done' : 'Next'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Arrow pointing down (for top position) */}
                  {TUTORIAL_STEPS[tutorialStep].position === 'top' && (
                    <div className="flex justify-center">
                      <div className="w-3 h-3 bg-bg-surface rotate-45 -mt-1.5 shadow-lg" />
                    </div>
                  )}
                </motion.div>
              </>
            )}

            {/* Skip button - always visible */}
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleSkipTutorial}
              className="fixed top-4 right-4 z-[102] px-3 py-1.5 text-sm text-white/70 hover:text-white"
            >
              Skip
            </motion.button>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
