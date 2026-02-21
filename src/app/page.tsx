'use client'

import { useEffect, useState, useRef, Component, ErrorInfo, ReactNode } from 'react'

// Error Boundary to catch crashes
class ErrorBoundary extends Component<{children: ReactNode, onError: (error: string) => void}, {hasError: boolean, error: string}> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    this.props.onError(error.message + ' | Stack: ' + (errorInfo.componentStack || '').slice(0, 500));
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

import { useStore } from '@/store'
import { supabase, getAuthHeaders } from '@/lib/supabase'
import { signIn, signUp, verifyOtp, resendVerificationEmail, getSession } from './actions'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { TabBar } from '@/components/TabBar'
import { HomeScreen } from '@/components/HomeScreen'
import { LibraryScreen } from '@/components/LibraryScreen'
import { PracticeScreen } from '@/components/PracticeScreen'
import RecordScreen from '@/components/RecordScreen'
import { InsightsScreen } from '@/components/InsightsScreen'
import { ProfileScreen } from '@/components/ProfileScreen'
import { WelcomeSplash } from '@/components/WelcomeSplash'
import { PWAInstallPrompt } from '@/components/PWAInstallPrompt'
import { AchievementNotification } from '@/components/AchievementNotification'
import { Button } from '@/components/ui'
import { motion, AnimatePresence } from 'framer-motion'

export default function Home() {
  const { activeTab, user, setUser } = useStore()
  
  // App state - simple state machine: 'initializing' -> 'ready'
  const [appState, setAppState] = useState<'initializing' | 'ready'>('initializing')
  const [crashError, setCrashError] = useState<string | null>(null)
  const [showWelcome, setShowWelcome] = useState(false)
  const initRef = useRef(false)
  
  // Use sessionStorage to prevent duplicate welcome animations across hot reloads
  const hasShownWelcome = useRef<boolean>(
    typeof window !== 'undefined' && sessionStorage.getItem('sceneread_welcome_shown') === 'true'
  )
  
  // Auth UI state
  const [showAuth, setShowAuth] = useState(false)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [activeFeature, setActiveFeature] = useState(0)
  const [showOtpScreen, setShowOtpScreen] = useState(false)
  const [otpCode, setOtpCode] = useState(['', '', '', '', '', ''])
  const [pendingEmail, setPendingEmail] = useState('')
  const [pendingName, setPendingName] = useState('')

  const features = [
    { icon: <MicIcon />, title: 'AI Scene Partners', desc: '30+ unique voices bring your scenes to life' },
    { icon: <ZapIcon />, title: 'Real-Time Feedback', desc: 'Instant analysis of timing & accuracy' },
    { icon: <FilmIcon />, title: 'Self-Tape Studio', desc: 'Record & export audition-ready tapes' },
    { icon: <ChartIcon />, title: 'Progress Tracking', desc: 'Track your growth with streaks & stats' },
  ]

  // ============================================================================
  // SINGLE SOURCE OF TRUTH: SUPABASE SESSION
  // Cookies handle persistence, visibility handler ensures fresh state on resume
  // ============================================================================
  
  // Handle app resume from background - this is critical for PWAs
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        console.log('[App] Visibility: visible - checking session')
        
        // Check session from server (cookies are authoritative)
        try {
          const sessionData = await getSession()
          
          if (sessionData?.user && sessionData?.profile) {
            setUser(sessionData.profile)
          } else if (!sessionData) {
            // No session - user was logged out
            setUser(null)
          }
          
          // Always set ready - never leave in loading state
          setAppState('ready')
        } catch (err) {
          console.error('[App] Visibility check error:', err)
          setAppState('ready') // Still set ready so user isn't stuck
        }
      }
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  // Initial auth setup - runs once on mount
  useEffect(() => {
    // Prevent double initialization in React StrictMode
    if (initRef.current) return
    initRef.current = true
    
    let mounted = true
    
    // Timeout failsafe - never stay in loading state more than 5 seconds
    const timeout = setTimeout(() => {
      if (mounted && appState === 'initializing') {
        console.warn('[App] Init timeout - forcing ready state')
        setAppState('ready')
      }
    }, 5000)
    
    const initialize = async () => {
      console.log('[App] Initializing...')
      
      // 1. Check for auth callback in URL first (email confirmation redirect)
      const handled = await handleAuthCallback()
      if (handled && !mounted) return
      
      // 2. Get session from server (cookies) - this is the authoritative source
      try {
        const sessionData = await getSession()
        
        if (!mounted) return
        
        if (sessionData?.user) {
          console.log('[App] Session found:', sessionData.user.id)
          // Use the profile from server
          if (mounted && sessionData.profile) {
            setUser(sessionData.profile)
            // Only show welcome once per session
            if (!hasShownWelcome.current) {
              hasShownWelcome.current = true
              sessionStorage.setItem('sceneread_welcome_shown', 'true')
              setShowWelcome(true)
            }
          }
        } else {
          console.log('[App] No session')
        }
        
        if (mounted) setAppState('ready')
      } catch (err) {
        console.error('[App] Init error:', err)
        if (mounted) setAppState('ready')
      }
    }
    
    initialize()
    
    // Subscribe to auth state changes - Supabase handles token refresh automatically
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
      console.log('[App] Auth event:', event)
      
      if (!mounted) return
      
      switch (event) {
        case 'SIGNED_IN':
          if (session?.user) {
            const profile = await fetchProfile(session.user.id, session.user.email || undefined)
            if (mounted && profile) {
              setUser(profile)
              if (!hasShownWelcome.current) {
                hasShownWelcome.current = true
                sessionStorage.setItem('sceneread_welcome_shown', 'true')
                setShowWelcome(true)
              }
            }
          }
          setAppState('ready')
          break
          
        case 'SIGNED_OUT':
          setUser(null)
          setAppState('ready')
          break
          
        case 'TOKEN_REFRESHED':
          // Session refreshed automatically - just update profile if needed
          if (session?.user) {
            const profile = await fetchProfile(session.user.id, session.user.email || undefined)
            if (mounted && profile) setUser(profile)
          }
          break
      }
    })
    
    return () => {
      mounted = false
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [])

  // Handle auth callback from URL (email confirmation)
  const handleAuthCallback = async (): Promise<boolean> => {
    // Check for error in URL
    const urlParams = new URLSearchParams(window.location.search)
    const errorDescription = urlParams.get('error_description')
    if (errorDescription) {
      console.error('[App] URL error:', errorDescription)
      setAuthError(errorDescription)
      setAppState('ready')
      window.history.replaceState(null, '', window.location.pathname)
      return true
    }

    // Check for auth tokens in URL hash
    const hashParams = new URLSearchParams(window.location.hash.substring(1))
    const accessToken = hashParams.get('access_token')
    const refreshToken = hashParams.get('refresh_token')
    const type = hashParams.get('type')
    
    if (accessToken && refreshToken) {
      console.log('[App] Processing auth callback, type:', type)
      
      try {
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        })
        
        if (error) {
          console.error('[App] Callback error:', error)
          setAuthError('Email confirmation failed. Please try again.')
        } else if (data.user) {
          console.log('[App] Callback success:', data.user.id)
          const profile = await fetchProfile(data.user.id, data.user.email || undefined)
          if (profile) {
            setUser(profile)
            setShowWelcome(true)
          }
        }
      } catch (err) {
        console.error('[App] Callback exception:', err)
      }
      
      setAppState('ready')
      window.history.replaceState(null, '', window.location.pathname)
      return true
    }
    
    return false
  }

  // Auto-rotate features on landing page
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveFeature(prev => (prev + 1) % features.length)
    }, 3000)
    return () => clearInterval(interval)
  }, [features.length])

  // ============================================================================
  // PROFILE FETCHING - Returns profile with onboarding_complete flag
  // ============================================================================
  
  const fetchProfile = async (userId: string, userEmail?: string): Promise<any | null> => {
    try {
      const headers = await getAuthHeaders()
      
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=*`,
        { headers }
      )
      
      if (res.ok) {
        const profiles = await res.json()
        if (profiles.length > 0) {
          return profiles[0]
        }
      }
      
      // No profile found - return basic info
      return { id: userId, email: userEmail || '', onboarding_complete: false }
    } catch (err) {
      console.error('[App] Profile fetch error:', err)
      return { id: userId, email: userEmail || '', onboarding_complete: false }
    }
  }

  // Mark onboarding as complete in Supabase
  const completeOnboarding = async () => {
    if (!user?.id) return
    
    try {
      const headers = await getAuthHeaders()
      
      await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`,
        {
          method: 'PATCH',
          headers: {
            ...headers,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({ onboarding_complete: true })
        }
      )
      
      // Update local state
      setUser({ ...user, onboarding_complete: true })
    } catch (err) {
      console.error('[App] Failed to update onboarding:', err)
    }
  }

  // ============================================================================
  // AUTH HANDLERS - Using Server Actions for cookie-based auth
  // ============================================================================

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError('')
    setAuthLoading(true)

    try {
      if (authMode === 'signup') {
        // Server action handles signup and sets cookies
        const result = await signUp(email, password, fullName)
        
        if (!result.success) {
          throw new Error(result.error || 'Sign up failed')
        }
        
        if (result.requiresEmailConfirmation) {
          // Email confirmation required
          setPendingEmail(email)
          setPendingName(fullName)
          setShowAuth(false)
          setShowOtpScreen(true)
        } else if (result.user) {
          // Immediate signup (no email confirmation required)
          const profile = await fetchProfile(result.user.id, result.user.email)
          if (profile) {
            setUser({ ...profile, full_name: fullName })
            setShowAuth(false)
            hasShownWelcome.current = true
            setShowWelcome(true)
          }
        }
      } else {
        // Server action handles sign in and sets cookies
        const result = await signIn(email, password)
        
        if (!result.success) {
          throw new Error(result.error || 'Sign in failed')
        }
        
        if (result.user) {
          const profile = await fetchProfile(result.user.id, result.user.email)
          if (profile) {
            setUser(profile)
            setShowAuth(false)
            hasShownWelcome.current = true
            setShowWelcome(true)
          }
        }
      }
    } catch (err: any) {
      console.error('[App] Auth error:', err)
      setAuthError(err.message || 'Authentication failed')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleOtpVerify = async () => {
    setAuthError('')
    setAuthLoading(true)
    
    const code = otpCode.join('')
    if (code.length !== 6) {
      setAuthError('Please enter the full 6-digit code')
      setAuthLoading(false)
      return
    }

    try {
      // Server action handles OTP verification and sets cookies
      const result = await verifyOtp(pendingEmail, code, pendingName)

      if (!result.success) {
        throw new Error(result.error || 'Verification failed')
      }

      if (result.user) {
        const profile = await fetchProfile(result.user.id, result.user.email)
        if (profile) {
          setUser({ ...profile, full_name: pendingName })
          setShowOtpScreen(false)
          setShowWelcome(true)
        }
        
        setOtpCode(['', '', '', '', '', ''])
        setPendingEmail('')
        setPendingName('')
      }
    } catch (err: any) {
      console.error('[App] OTP error:', err)
      setAuthError(err.message || 'Invalid code. Please try again.')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleOtpInput = (index: number, value: string) => {
    if (value.length > 1) {
      const digits = value.replace(/\D/g, '').slice(0, 6).split('')
      const newOtp = [...otpCode]
      digits.forEach((digit, i) => {
        if (index + i < 6) newOtp[index + i] = digit
      })
      setOtpCode(newOtp)
      const nextIndex = Math.min(index + digits.length, 5)
      document.getElementById(`otp-${nextIndex}`)?.focus()
      return
    }
    
    if (!/^\d*$/.test(value)) return
    
    const newOtp = [...otpCode]
    newOtp[index] = value
    setOtpCode(newOtp)
    
    if (value && index < 5) {
      document.getElementById(`otp-${index + 1}`)?.focus()
    }
  }

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otpCode[index] && index > 0) {
      document.getElementById(`otp-${index - 1}`)?.focus()
    }
  }

  const resendOtp = async () => {
    setAuthError('')
    setAuthLoading(true)
    try {
      const result = await resendVerificationEmail(pendingEmail)
      if (!result.success) {
        throw new Error(result.error || 'Failed to resend code')
      }
      setAuthError('New code sent! Check your email.')
    } catch (err: any) {
      setAuthError(err.message || 'Failed to resend code')
    } finally {
      setAuthLoading(false)
    }
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  const renderScreen = () => {
    switch (activeTab) {
      case 'home': return <HomeScreen onCompleteOnboarding={completeOnboarding} />
      case 'library': return <LibraryScreen />
      case 'practice': return <PracticeScreen />
      case 'record': return <RecordScreen />
      case 'insights': return <InsightsScreen />
      case 'profile': return <ProfileScreen />
      default: return <HomeScreen onCompleteOnboarding={completeOnboarding} />
    }
  }

  // Crash error screen
  if (crashError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg p-6">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-error-muted flex items-center justify-center">
            <svg className="w-8 h-8 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-text mb-2">App Crashed</h2>
          <p className="text-error text-sm mb-4 break-all font-mono bg-bg-subtle p-3 rounded-lg">{crashError}</p>
          <button 
            onClick={() => { setCrashError(null); window.location.reload(); }}
            className="px-6 py-2 bg-accent text-white rounded-lg"
          >
            Reload App
          </button>
        </div>
      </div>
    )
  }

  // Initializing state - brief loading
  if (appState === 'initializing') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="text-center">
          <div className="relative w-12 h-12 mx-auto mb-4">
            <div className="absolute inset-0 rounded-full border-2 border-accent/20" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-accent animate-spin" />
          </div>
          <p className="text-text-muted text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  // Landing page (not logged in)
  if (!user && !showAuth && !showOtpScreen) {
    return (
      <div className="min-h-screen bg-bg flex flex-col items-center justify-center p-6 relative overflow-hidden">
        {/* Static background glow */}
        <div className="absolute inset-0 bg-gradient-to-b from-accent/5 via-transparent to-transparent" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-accent/8 rounded-full blur-3xl" />
        
        {/* Spark/glow effects */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {/* Central glow pulse */}
          <motion.div
            animate={{ opacity: [0.3, 0.6, 0.3], scale: [1, 1.1, 1] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute top-[30%] left-1/2 -translate-x-1/2 w-32 h-32 bg-accent/20 rounded-full blur-3xl"
          />
          
          {/* Floating sparks - rising through entire screen */}
          <motion.div
            animate={{ opacity: [0, 1, 1, 0], y: ['0vh', '-30vh', '-70vh', '-100vh'] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeOut', delay: 0 }}
            className="absolute top-[100%] left-[10%] w-1 h-1 bg-accent rounded-full shadow-[0_0_8px_2px_rgba(232,121,149,0.6)]"
          />
          <motion.div
            animate={{ opacity: [0, 1, 1, 0], y: ['0vh', '-25vh', '-60vh', '-100vh'] }}
            transition={{ duration: 10, repeat: Infinity, ease: 'easeOut', delay: 1 }}
            className="absolute top-[100%] left-[85%] w-1.5 h-1.5 bg-accent rounded-full shadow-[0_0_10px_3px_rgba(232,121,149,0.5)]"
          />
          <motion.div
            animate={{ opacity: [0, 0.8, 0.8, 0], y: ['0vh', '-35vh', '-75vh', '-100vh'] }}
            transition={{ duration: 9, repeat: Infinity, ease: 'easeOut', delay: 2 }}
            className="absolute top-[100%] left-[45%] w-0.5 h-0.5 bg-text rounded-full opacity-80"
          />
          <motion.div
            animate={{ opacity: [0, 1, 1, 0], y: ['0vh', '-40vh', '-80vh', '-100vh'] }}
            transition={{ duration: 11, repeat: Infinity, ease: 'easeOut', delay: 0.5 }}
            className="absolute top-[100%] left-[55%] w-1 h-1 bg-accent/80 rounded-full shadow-[0_0_8px_2px_rgba(232,121,149,0.4)]"
          />
          <motion.div
            animate={{ opacity: [0, 0.6, 0.6, 0], y: ['0vh', '-30vh', '-65vh', '-100vh'] }}
            transition={{ duration: 7, repeat: Infinity, ease: 'easeOut', delay: 1.5 }}
            className="absolute top-[100%] left-[25%] w-0.5 h-0.5 bg-text rounded-full opacity-60"
          />
          <motion.div
            animate={{ opacity: [0, 0.9, 0.9, 0], y: ['0vh', '-45vh', '-85vh', '-100vh'] }}
            transition={{ duration: 12, repeat: Infinity, ease: 'easeOut', delay: 0.3 }}
            className="absolute top-[100%] left-[70%] w-1 h-1 bg-accent rounded-full shadow-[0_0_8px_2px_rgba(232,121,149,0.5)]"
          />
          <motion.div
            animate={{ opacity: [0, 0.7, 0.7, 0], y: ['0vh', '-35vh', '-70vh', '-100vh'] }}
            transition={{ duration: 8.5, repeat: Infinity, ease: 'easeOut', delay: 2.5 }}
            className="absolute top-[100%] left-[15%] w-1 h-1 bg-text rounded-full opacity-50"
          />
          <motion.div
            animate={{ opacity: [0, 1, 1, 0], y: ['0vh', '-50vh', '-90vh', '-100vh'] }}
            transition={{ duration: 10.5, repeat: Infinity, ease: 'easeOut', delay: 1.8 }}
            className="absolute top-[100%] left-[35%] w-1.5 h-1.5 bg-accent rounded-full shadow-[0_0_10px_3px_rgba(232,121,149,0.6)]"
          />
          <motion.div
            animate={{ opacity: [0, 0.8, 0.8, 0], y: ['0vh', '-40vh', '-75vh', '-100vh'] }}
            transition={{ duration: 7.5, repeat: Infinity, ease: 'easeOut', delay: 0.8 }}
            className="absolute top-[100%] left-[60%] w-0.5 h-0.5 bg-text rounded-full opacity-80"
          />
          <motion.div
            animate={{ opacity: [0, 0.9, 0.9, 0], y: ['0vh', '-45vh', '-80vh', '-100vh'] }}
            transition={{ duration: 11.5, repeat: Infinity, ease: 'easeOut', delay: 3 }}
            className="absolute top-[100%] left-[5%] w-1 h-1 bg-accent/90 rounded-full shadow-[0_0_8px_2px_rgba(232,121,149,0.5)]"
          />
          <motion.div
            animate={{ opacity: [0, 0.6, 0.6, 0], y: ['0vh', '-30vh', '-60vh', '-100vh'] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeOut', delay: 1.2 }}
            className="absolute top-[100%] left-[92%] w-0.5 h-0.5 bg-text rounded-full opacity-60"
          />
          <motion.div
            animate={{ opacity: [0, 1, 1, 0], y: ['0vh', '-55vh', '-95vh', '-100vh'] }}
            transition={{ duration: 13, repeat: Infinity, ease: 'easeOut', delay: 2.2 }}
            className="absolute top-[100%] left-[50%] w-1.5 h-1.5 bg-accent rounded-full shadow-[0_0_12px_4px_rgba(232,121,149,0.5)]"
          />
          <motion.div
            animate={{ opacity: [0, 0.7, 0.7, 0], y: ['0vh', '-35vh', '-70vh', '-100vh'] }}
            transition={{ duration: 9.5, repeat: Infinity, ease: 'easeOut', delay: 0.6 }}
            className="absolute top-[100%] left-[78%] w-1 h-1 bg-accent/70 rounded-full shadow-[0_0_6px_2px_rgba(232,121,149,0.4)]"
          />
          <motion.div
            animate={{ opacity: [0, 0.8, 0.8, 0], y: ['0vh', '-40vh', '-78vh', '-100vh'] }}
            transition={{ duration: 10, repeat: Infinity, ease: 'easeOut', delay: 1.9 }}
            className="absolute top-[100%] left-[20%] w-1 h-1 bg-text rounded-full opacity-40"
          />
          <motion.div
            animate={{ opacity: [0, 0.9, 0.9, 0], y: ['0vh', '-42vh', '-82vh', '-100vh'] }}
            transition={{ duration: 11, repeat: Infinity, ease: 'easeOut', delay: 2.8 }}
            className="absolute top-[100%] left-[65%] w-1 h-1 bg-accent rounded-full shadow-[0_0_8px_2px_rgba(232,121,149,0.5)]"
          />
          <motion.div
            animate={{ opacity: [0, 0.5, 0.5, 0], y: ['0vh', '-25vh', '-55vh', '-100vh'] }}
            transition={{ duration: 6.5, repeat: Infinity, ease: 'easeOut', delay: 3.2 }}
            className="absolute top-[100%] left-[40%] w-0.5 h-0.5 bg-text rounded-full opacity-70"
          />
          <motion.div
            animate={{ opacity: [0, 1, 1, 0], y: ['0vh', '-48vh', '-88vh', '-100vh'] }}
            transition={{ duration: 12.5, repeat: Infinity, ease: 'easeOut', delay: 0.9 }}
            className="absolute top-[100%] left-[8%] w-1.5 h-1.5 bg-accent rounded-full shadow-[0_0_10px_3px_rgba(232,121,149,0.6)]"
          />
          <motion.div
            animate={{ opacity: [0, 0.7, 0.7, 0], y: ['0vh', '-38vh', '-72vh', '-100vh'] }}
            transition={{ duration: 9, repeat: Infinity, ease: 'easeOut', delay: 2.1 }}
            className="absolute top-[100%] left-[95%] w-1 h-1 bg-accent/80 rounded-full shadow-[0_0_7px_2px_rgba(232,121,149,0.4)]"
          />
          <motion.div
            animate={{ opacity: [0, 0.85, 0.85, 0], y: ['0vh', '-33vh', '-68vh', '-100vh'] }}
            transition={{ duration: 8.2, repeat: Infinity, ease: 'easeOut', delay: 3.5 }}
            className="absolute top-[100%] left-[30%] w-1 h-1 bg-accent rounded-full shadow-[0_0_8px_2px_rgba(232,121,149,0.5)]"
          />
          <motion.div
            animate={{ opacity: [0, 0.6, 0.6, 0], y: ['0vh', '-28vh', '-62vh', '-100vh'] }}
            transition={{ duration: 7.8, repeat: Infinity, ease: 'easeOut', delay: 4 }}
            className="absolute top-[100%] left-[82%] w-0.5 h-0.5 bg-text rounded-full opacity-50"
          />
        </div>
        
        <div className="relative z-10 text-center max-w-md">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-bg-surface/80 backdrop-blur rounded-full border border-border mb-8">
            <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            <span className="text-text-muted text-xs font-medium tracking-wide uppercase">
              Professional Actor's Toolkit
            </span>
          </div>

          <h1 className="font-display text-5xl sm:text-6xl text-text mb-4 tracking-tight">
            Scene<span className="text-accent">Read</span>
          </h1>
          <p className="text-text-muted text-lg leading-relaxed mb-10 max-w-sm mx-auto">
            Master your lines with AI scene partners, real-time feedback, and professional self-tape tools.
          </p>

          <div className="space-y-3 mb-10">
            <Button 
              onClick={() => { setShowAuth(true); setAuthMode('signup'); }} 
              className="w-full max-w-xs mx-auto"
            >
              Get Started Free
            </Button>
            <button 
              onClick={() => { setShowAuth(true); setAuthMode('signin'); }}
              className="w-full max-w-xs mx-auto block text-text-muted text-sm hover:text-text transition-colors py-2"
            >
              Already have an account? <span className="text-accent">Sign in</span>
            </button>
          </div>

          <div className="w-full max-w-sm mx-auto mb-8">
            <div className="relative h-32 overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeFeature}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.4 }}
                  className="absolute inset-0 px-5 py-5 rounded-2xl bg-bg-surface/60 backdrop-blur-xl border border-border"
                >
                  <div className="flex flex-col items-center text-center gap-3 h-full justify-center">
                    <div className="w-9 h-9 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
                      {features[activeFeature].icon}
                    </div>
                    <div>
                      <h3 className="text-text font-medium text-sm">
                        {features[activeFeature].title}
                      </h3>
                      <p className="text-text-muted text-xs mt-1">
                        {features[activeFeature].desc}
                      </p>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
            
            <div className="flex justify-center gap-1.5 mt-4">
              {features.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActiveFeature(i)}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    i === activeFeature ? 'bg-accent' : 'bg-overlay-20'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Auth form
  if (showAuth) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <button 
            onClick={() => { setShowAuth(false); setAuthError(''); }}
            className="flex items-center gap-1.5 text-text-muted text-sm mb-8 hover:text-text transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>

          <div className="mb-8">
            <h2 className="font-display text-3xl text-text mb-2">
              {authMode === 'signin' ? 'Welcome back' : 'Create your account'}
            </h2>
            <p className="text-text-muted">
              {authMode === 'signin' 
                ? 'Sign in to continue practicing' 
                : 'Start mastering your lines today'}
            </p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            {authMode === 'signup' && (
              <div>
                <label className="block text-text text-sm font-medium mb-2">Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your name"
                  className="w-full px-4 py-3 bg-bg-surface border border-border rounded-xl text-text placeholder:text-text-muted/50 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-all"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-text text-sm font-medium mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="actor@example.com"
                className="w-full px-4 py-3 bg-bg-surface border border-border rounded-xl text-text placeholder:text-text-muted/50 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-text text-sm font-medium mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 6 characters"
                className="w-full px-4 py-3 bg-bg-surface border border-border rounded-xl text-text placeholder:text-text-muted/50 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-all"
                required
                minLength={6}
              />
            </div>

            {authError && (
              <div className={`p-3 rounded-lg text-sm ${
                authError.includes('Check your email') 
                  ? 'bg-success-muted text-success border border-success-border' 
                  : 'bg-error-muted text-error border border-error-border'
              }`}>
                {authError}
              </div>
            )}

            <button 
              type="submit" 
              disabled={authLoading} 
              className="w-full py-3 bg-accent hover:bg-accent/90 text-white font-medium rounded-xl disabled:opacity-50 transition-colors mt-2"
            >
              {authLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
              ) : (
                authMode === 'signin' ? 'Sign In' : 'Create Account'
              )}
            </button>
          </form>

          <p className="text-text-muted text-sm text-center mt-8">
            {authMode === 'signin' ? "Don't have an account? " : "Already have an account? "}
            <button
              onClick={() => { setAuthMode(authMode === 'signin' ? 'signup' : 'signin'); setAuthError(''); }}
              className="text-accent font-medium hover:underline"
            >
              {authMode === 'signin' ? 'Create one' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    )
  }

  // OTP screen
  if (showOtpScreen) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <button 
            onClick={() => { 
              setShowOtpScreen(false)
              setShowAuth(true)
              setAuthMode('signup')
              setAuthError('')
              setOtpCode(['', '', '', '', '', ''])
            }}
            className="flex items-center gap-1.5 text-text-muted text-sm mb-8 hover:text-text transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>

          <div className="mb-8 text-center">
            <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="font-display text-3xl text-text mb-2">Check your email</h2>
            <p className="text-text-muted">
              We sent a 6-digit code to<br />
              <span className="text-text font-medium">{pendingEmail}</span>
            </p>
          </div>

          <div className="flex justify-center gap-2 mb-6">
            {otpCode.map((digit, index) => (
              <input
                key={index}
                id={`otp-${index}`}
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={digit}
                onChange={(e) => handleOtpInput(index, e.target.value)}
                onKeyDown={(e) => handleOtpKeyDown(index, e)}
                className="w-12 h-14 text-center text-2xl font-bold bg-bg-surface border-2 border-border rounded-xl text-text focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
                autoFocus={index === 0}
              />
            ))}
          </div>

          {authError && (
            <div className={`p-3 rounded-lg text-sm text-center mb-6 ${
              authError.includes('New code sent') 
                ? 'bg-success-muted text-success border border-success-border' 
                : 'bg-error-muted text-error border border-error-border'
            }`}>
              {authError}
            </div>
          )}

          <button 
            onClick={handleOtpVerify}
            disabled={authLoading || otpCode.join('').length !== 6} 
            className="w-full py-3.5 bg-accent hover:bg-accent/90 text-white font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {authLoading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
            ) : (
              'Verify Email'
            )}
          </button>

          <p className="text-text-muted text-sm text-center mt-6">
            Didn't receive the code?{' '}
            <button
              onClick={resendOtp}
              disabled={authLoading}
              className="text-accent font-medium hover:underline disabled:opacity-50"
            >
              Resend
            </button>
          </p>
        </div>
      </div>
    )
  }

  // Main app (logged in)
  return (
    <ErrorBoundary onError={setCrashError}>
      <main className="h-screen flex flex-col bg-bg overflow-hidden">
        <AnimatePresence>
          {showWelcome && (
            <WelcomeSplash 
              name={user?.full_name || undefined} 
              onComplete={() => setShowWelcome(false)} 
            />
          )}
        </AnimatePresence>
        <div className="flex-1 overflow-hidden pb-20">
          {renderScreen()}
        </div>
        <TabBar />
        <PWAInstallPrompt />
        <AchievementNotification />
      </main>
    </ErrorBoundary>
  )
}

// Icon components
const MicIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
  </svg>
)

const ZapIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
)

const FilmIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
  </svg>
)

const ChartIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
)
