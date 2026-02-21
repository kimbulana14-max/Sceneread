'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState } from 'react'

interface WelcomeSplashProps {
  name?: string
  onComplete: () => void
}

export function WelcomeSplash({ name, onComplete }: WelcomeSplashProps) {
  const [phase, setPhase] = useState<'enter' | 'hold' | 'exit'>('enter')
  
  const firstName = name?.split(' ')[0] || 'Actor'
  
  // Motivational phrases
  const phrases = [
    "Time to shine",
    "Let's rehearse",
    "Break a leg",
    "Lights, camera, action",
    "The stage is yours",
    "Ready for your scene",
  ]
  
  const [phrase] = useState(() => phrases[Math.floor(Math.random() * phrases.length)])

  useEffect(() => {
    // Enter animation complete -> hold
    const holdTimer = setTimeout(() => setPhase('hold'), 600)
    // Hold complete -> exit
    const exitTimer = setTimeout(() => setPhase('exit'), 1400)
    // Exit complete -> callback
    const completeTimer = setTimeout(() => onComplete(), 2000)
    
    return () => {
      clearTimeout(holdTimer)
      clearTimeout(exitTimer)
      clearTimeout(completeTimer)
    }
  }, [onComplete])

  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: phase === 'exit' ? 0 : 1 }}
      transition={{ duration: 0.5 }}
      className="fixed inset-0 z-[100] bg-bg flex flex-col items-center justify-center overflow-hidden"
    >
      {/* Background gradient pulse */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 2.5, opacity: 0.15 }}
        transition={{ duration: 1.5, ease: 'easeOut' }}
        className="absolute w-[400px] h-[400px] rounded-full bg-gradient-radial from-accent to-transparent"
      />
      
      {/* Logo/Icon */}
      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ 
          type: 'spring', 
          damping: 15, 
          stiffness: 200,
          delay: 0.1 
        }}
        className="relative mb-8"
      >
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-bg-elevated to-bg flex items-center justify-center shadow-lg shadow-accent/30 border border-white/5">
          <svg className="w-12 h-12" viewBox="0 0 512 512" fill="none">
            <defs>
              <linearGradient id="splashAccent" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FB7185"/>
                <stop offset="50%" stopColor="#E11D48"/>
                <stop offset="100%" stopColor="#BE123C"/>
              </linearGradient>
            </defs>
            <path
              d="M 320 130 C 380 130, 380 195, 320 195 L 192 195 C 132 195, 132 260, 192 260 L 320 260 C 380 260, 380 325, 320 325 L 192 325 C 132 325, 132 390, 192 390"
              stroke="url(#splashAccent)"
              strokeWidth="44"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <circle cx="192" cy="390" r="22" fill="url(#splashAccent)"/>
          </svg>
        </div>
        
        {/* Sparkle effects */}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.3 }}
          className="absolute -top-1 -right-1 w-3 h-3 bg-accent rounded-full"
        />
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 0.6 }}
          transition={{ delay: 0.5, duration: 0.3 }}
          className="absolute -bottom-2 -left-2 w-2 h-2 bg-ai rounded-full"
        />
      </motion.div>

      {/* Greeting */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.4 }}
        className="text-center"
      >
        <h1 className="text-3xl font-display text-text mb-3">
          Hey, {firstName}
        </h1>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.3 }}
          className="text-xl text-accent font-medium"
        >
          {phrase}
        </motion.p>
      </motion.div>

      {/* Animated line underneath */}
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay: 0.8, duration: 0.6, ease: 'easeOut' }}
        className="mt-8 w-16 h-0.5 bg-gradient-to-r from-transparent via-accent to-transparent origin-center"
      />
    </motion.div>
  )
}
