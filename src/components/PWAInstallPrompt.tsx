'use client'

import { useEffect, useState } from 'react'

export function PWAInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState<any>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then((registration) => {
        console.log('SW registered:', registration.scope)
      }).catch((error) => {
        console.log('SW registration failed:', error)
      })
    }

    // Check if already installed (standalone mode)
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as any).standalone === true
    setIsStandalone(standalone)

    // Detect iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    setIsIOS(iOS)

    // Listen for install prompt (Android/Desktop)
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e)
      // Show prompt after a delay (don't be annoying)
      setTimeout(() => setShowPrompt(true), 3000)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
    }
  }, [])

  const handleInstall = async () => {
    if (!installPrompt) return
    
    installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    
    if (outcome === 'accepted') {
      setShowPrompt(false)
      setInstallPrompt(null)
    }
  }

  const handleDismiss = () => {
    setShowPrompt(false)
    // Don't show again for 7 days
    localStorage.setItem('pwa-prompt-dismissed', Date.now().toString())
  }

  // Check if recently dismissed - MUST be before any conditional returns!
  useEffect(() => {
    const dismissed = localStorage.getItem('pwa-prompt-dismissed')
    if (dismissed) {
      const daysSince = (Date.now() - parseInt(dismissed)) / (1000 * 60 * 60 * 24)
      if (daysSince < 7) {
        setShowPrompt(false)
      }
    }
  }, [])

  // Don't show if already installed
  if (isStandalone) return null

  if (!showPrompt) return null

  // iOS instructions (can't auto-prompt)
  if (isIOS) {
    return (
      <div className="fixed bottom-4 left-4 right-4 bg-bg-surface border border-border rounded-xl p-4 shadow-xl z-50 animate-slide-up">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-text">Install SceneRead</h3>
            <p className="text-sm text-text-secondary mt-1">
              Tap <span className="inline-flex items-center"><svg className="w-4 h-4 mx-1" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-5 5 5h-4v4h-2z"/></svg></span> then <strong>"Add to Home Screen"</strong>
            </p>
          </div>
          <button onClick={handleDismiss} className="text-text-secondary hover:text-text p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    )
  }

  // Android/Desktop install button
  return (
    <div className="fixed bottom-4 left-4 right-4 bg-bg-surface border border-border rounded-xl p-4 shadow-xl z-50 animate-slide-up">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center flex-shrink-0">
          <svg className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-text">Install SceneRead</h3>
          <p className="text-sm text-text-secondary">Add to your home screen for the best experience</p>
        </div>
        <button 
          onClick={handleInstall}
          className="px-4 py-2 bg-accent text-bg rounded-lg font-medium hover:bg-accent-hover transition-colors"
        >
          Install
        </button>
        <button onClick={handleDismiss} className="text-text-secondary hover:text-text p-1">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
