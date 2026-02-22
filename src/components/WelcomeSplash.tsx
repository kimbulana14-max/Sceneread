'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState, useMemo, useRef } from 'react'
import { useSettings } from '@/store'

interface WelcomeSplashProps {
  name?: string
  onComplete: () => void
}

export function WelcomeSplash({ name, onComplete }: WelcomeSplashProps) {
  const [phase, setPhase] = useState<'spotlight' | 'reveal' | 'greeting' | 'exit'>('spotlight')
  const colorTheme = useSettings((s) => s.settings.colorTheme)
  const isLight = colorTheme === 'light'

  const firstName = name?.split(' ')[0] || 'Actor'

  // Inspiring quotes about acting, theatre, and performance
  const quotes: { text: string; author: string }[] = [
    { text: "Acting is behaving truthfully under imaginary circumstances.", author: "Sanford Meisner" },
    { text: "The best acting is instinctive. It's not intellectual, it's not mechanical, it's instinctive.", author: "Craig MacDonald" },
    { text: "An actor is at most a poet and at least an entertainer.", author: "Marlon Brando" },
    { text: "Without wonder and insight, acting is just a trade.", author: "Bette Davis" },
    { text: "Create your own method. Don't depend slavishly on mine.", author: "Lee Strasberg" },
    { text: "Use what you know. Don't worry about what you don't know.", author: "Michael Shurtleff" },
    { text: "Find in yourself those human things which are universal.", author: "Sanford Meisner" },
    { text: "The actor has to develop his body. The actor has to work on his voice.", author: "Stella Adler" },
    { text: "Stop explaining yourself. Shut up and act.", author: "Craig MacDonald" },
    { text: "That's what makes acting so attractive. You get to break all your own rules.", author: "Robert De Niro" },
    { text: "Life beats down and crushes the soul and art reminds you that you have one.", author: "Stella Adler" },
    { text: "Acting is not about being someone different. It's finding the similarity in what is apparently different.", author: "Meryl Streep" },
    { text: "I regard the theatre as the greatest of all art forms.", author: "Oscar Wilde" },
    { text: "All the world's a stage, and all the men and women merely players.", author: "William Shakespeare" },
    { text: "Theatre is a form of knowledge; it should and can also be a means of transforming society.", author: "Augusto Boal" },
    { text: "The stage is not merely the meeting place of all the arts, but is also the return of art to life.", author: "Oscar Wilde" },
    { text: "Acting is the ability to live truthfully under given imaginary circumstances.", author: "Sanford Meisner" },
    { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
    { text: "Don't act. Be.", author: "Konstantin Stanislavski" },
    { text: "The word theatre comes from the Greeks. It means the seeing place.", author: "Arthur Miller" },
    { text: "In the theatre, every night is opening night.", author: "Unknown" },
    { text: "Your only limitation is the one you set up in your own mind.", author: "Napoleon Hill" },
    { text: "An ounce of behaviour is worth a pound of words.", author: "Sanford Meisner" },
    { text: "The theatre is so endlessly fascinating because it's so accidental. It's so much like life.", author: "Arthur Miller" },
    { text: "Talent is cheaper than table salt. What separates the talented from the successful is hard work.", author: "Stephen King" },
    { text: "You've got to be original, because if you're like someone else, what do they need you for?", author: "Bernadette Peters" },
    { text: "The art of acting consists in keeping people from coughing.", author: "Ralph Richardson" },
    { text: "Every act of creation is first an act of destruction.", author: "Pablo Picasso" },
    { text: "To practice any art, no matter how well or badly, is a way to make your soul grow.", author: "Kurt Vonnegut" },
    { text: "The best way to predict the future is to create it.", author: "Peter Drucker" },
    { text: "What we play is life.", author: "Louis Armstrong" },
    { text: "Put your heart, mind, and soul into even your smallest acts.", author: "Swami Sivananda" },
    { text: "Imagination is the beginning of creation.", author: "George Bernard Shaw" },
    { text: "It's not about standing still and being safe. It's about growth.", author: "Viola Davis" },
    { text: "I learned that courage was not the absence of fear, but the triumph over it.", author: "Nelson Mandela" },
    { text: "When you want something, all the universe conspires in helping you to achieve it.", author: "Paulo Coelho" },
    { text: "The purpose of art is washing the dust of daily life off our souls.", author: "Pablo Picasso" },
    { text: "Do not wait to strike till the iron is hot, but make it hot by striking.", author: "W.B. Yeats" },
    { text: "We are what we repeatedly do. Excellence, then, is not an act, but a habit.", author: "Aristotle" },
    { text: "Take the risk or lose the chance.", author: "Unknown" },
    { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
    { text: "Great things never came from comfort zones.", author: "Unknown" },
    { text: "A creative man is motivated by the desire to achieve, not by the desire to beat others.", author: "Ayn Rand" },
    { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
    { text: "If you hear a voice within you say 'you cannot paint,' then by all means paint.", author: "Vincent van Gogh" },
    { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
    { text: "The best time to plant a tree was twenty years ago. The second best time is now.", author: "Chinese Proverb" },
    { text: "Everything you can imagine is real.", author: "Pablo Picasso" },
    { text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
    { text: "Art is not what you see, but what you make others see.", author: "Edgar Degas" },
  ]

  const quote = useMemo(() => quotes[Math.floor(Math.random() * quotes.length)], [])

  // Generate floating particles
  const particles = useMemo(() =>
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      delay: Math.random() * 2,
      duration: Math.random() * 3 + 2,
    })), [])

  // Use ref to avoid effect re-running when onComplete identity changes
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('reveal'), 400)
    const t2 = setTimeout(() => setPhase('greeting'), 1000)
    const t3 = setTimeout(() => setPhase('exit'), 4800)
    const t4 = setTimeout(() => onCompleteRef.current(), 5400)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4) }
  }, [])

  const accentColor = isLight ? '#B87333' : '#E11D48'
  const accentGlow = isLight ? 'rgba(184,115,51,0.4)' : 'rgba(225,29,72,0.4)'
  const aiColor = isLight ? '#7a9e93' : '#6366F1'

  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: phase === 'exit' ? 0 : 1 }}
      transition={{ duration: 0.5 }}
      className="fixed inset-0 z-[100] bg-bg flex flex-col items-center justify-center overflow-hidden"
    >
      {/* Animated background gradient — two crossing beams */}
      <motion.div
        initial={{ opacity: 0, rotate: -15, scale: 0.5 }}
        animate={{
          opacity: phase === 'spotlight' ? 0.3 : 0.12,
          rotate: 0,
          scale: 1.5,
        }}
        transition={{ duration: 1.8, ease: 'easeOut' }}
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `conic-gradient(from 180deg at 50% 40%, transparent 0deg, ${accentGlow} 40deg, transparent 80deg, transparent 180deg, ${isLight ? 'rgba(122,158,147,0.25)' : 'rgba(99,102,241,0.2)'} 220deg, transparent 260deg)`,
        }}
      />

      {/* Radial spotlight from top */}
      <motion.div
        initial={{ opacity: 0, y: '-30%' }}
        animate={{ opacity: 0.5, y: '0%' }}
        transition={{ duration: 1, ease: 'easeOut' }}
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[200%] h-[60%] pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 40% 70% at 50% 0%, ${accentGlow} 0%, transparent 70%)`,
        }}
      />

      {/* Floating dust particles */}
      {particles.map((p) => (
        <motion.div
          key={p.id}
          initial={{ opacity: 0, y: `${p.y}vh`, x: `${p.x - 50}vw` }}
          animate={{
            opacity: [0, 0.6, 0],
            y: [`${p.y}vh`, `${p.y - 15}vh`],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="absolute rounded-full pointer-events-none"
          style={{
            width: p.size,
            height: p.size,
            background: p.id % 3 === 0 ? accentColor : p.id % 3 === 1 ? aiColor : (isLight ? '#c5a55a' : '#FAFAFA'),
          }}
        />
      ))}

      {/* Horizontal accent lines — stage floor marks */}
      <motion.div
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 1, opacity: 0.15 }}
        transition={{ delay: 0.6, duration: 0.8, ease: 'easeOut' }}
        className="absolute bottom-[35%] left-0 right-0 h-px origin-center"
        style={{ background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)` }}
      />
      <motion.div
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 1, opacity: 0.08 }}
        transition={{ delay: 0.8, duration: 0.8, ease: 'easeOut' }}
        className="absolute bottom-[33%] left-[10%] right-[10%] h-px origin-center"
        style={{ background: `linear-gradient(90deg, transparent, ${aiColor}, transparent)` }}
      />

      {/* Main content container */}
      <div className="relative flex flex-col items-center z-10">
        {/* Logo */}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{
            scale: phase === 'spotlight' ? 0.6 : 1,
            opacity: 1,
          }}
          transition={{
            type: 'spring',
            damping: 20,
            stiffness: 150,
            delay: 0.15,
          }}
          className="relative mb-10"
        >
          {/* Glow ring behind logo */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: [1, 1.3, 1.1], opacity: [0, 0.6, 0.3] }}
            transition={{ duration: 2, delay: 0.3, ease: 'easeOut' }}
            className="absolute inset-[-20px] rounded-full pointer-events-none"
            style={{
              background: `radial-gradient(circle, ${accentGlow} 0%, transparent 70%)`,
            }}
          />

          <div
            className="w-24 h-24 rounded-3xl flex items-center justify-center relative"
            style={{
              background: isLight
                ? 'linear-gradient(135deg, #f5f1eb 0%, #e8e2d9 100%)'
                : 'linear-gradient(135deg, #141418 0%, #1E1E24 100%)',
              boxShadow: `0 0 40px ${accentGlow}, 0 0 80px ${isLight ? 'rgba(184,115,51,0.15)' : 'rgba(225,29,72,0.15)'}`,
              border: `1px solid ${isLight ? 'rgba(184,115,51,0.2)' : 'rgba(255,255,255,0.08)'}`,
            }}
          >
            <svg className="w-14 h-14" viewBox="0 0 512 512" fill="none">
              <defs>
                <linearGradient id="splashAccentGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={accentColor} />
                  <stop offset="100%" stopColor={aiColor} />
                </linearGradient>
              </defs>
              <motion.path
                d="M 320 130 C 380 130, 380 195, 320 195 L 192 195 C 132 195, 132 260, 192 260 L 320 260 C 380 260, 380 325, 320 325 L 192 325 C 132 325, 132 390, 192 390"
                stroke="url(#splashAccentGrad)"
                strokeWidth="44"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.2, delay: 0.2, ease: 'easeInOut' }}
              />
              <motion.circle
                cx="192"
                cy="390"
                r="22"
                fill="url(#splashAccentGrad)"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 1.2, duration: 0.3 }}
              />
            </svg>
          </div>
        </motion.div>

        {/* Greeting text */}
        <motion.h1
          initial={{ opacity: 0, y: 30, filter: 'blur(10px)' }}
          animate={{
            opacity: phase === 'greeting' || phase === 'exit' ? 1 : 0,
            y: phase === 'greeting' || phase === 'exit' ? 0 : 30,
            filter: phase === 'greeting' || phase === 'exit' ? 'blur(0px)' : 'blur(10px)',
          }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="text-4xl font-display font-bold text-text mb-3 tracking-tight"
        >
          Hey, {firstName}
        </motion.h1>

        {/* Quote */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{
            opacity: phase === 'greeting' || phase === 'exit' ? 1 : 0,
            y: phase === 'greeting' || phase === 'exit' ? 0 : 20,
          }}
          transition={{ duration: 0.5, delay: 0.15, ease: 'easeOut' }}
          className="text-center max-w-[280px] px-4"
        >
          <p
            className="text-base italic leading-relaxed"
            style={{
              background: `linear-gradient(135deg, ${accentColor}, ${aiColor})`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            &ldquo;{quote.text}&rdquo;
          </p>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{
              opacity: phase === 'greeting' || phase === 'exit' ? 0.6 : 0,
            }}
            transition={{ duration: 0.4, delay: 0.5, ease: 'easeOut' }}
            className="text-xs text-text-muted mt-2"
          >
            &mdash; {quote.author}
          </motion.p>
        </motion.div>

        {/* Decorative line below */}
        <motion.div
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{
            scaleX: phase === 'greeting' || phase === 'exit' ? 1 : 0,
            opacity: phase === 'greeting' || phase === 'exit' ? 1 : 0,
          }}
          transition={{ duration: 0.6, delay: 0.3, ease: 'easeOut' }}
          className="mt-6 w-12 h-0.5 origin-center rounded-full"
          style={{
            background: `linear-gradient(90deg, ${accentColor}, ${aiColor})`,
          }}
        />
      </div>
    </motion.div>
  )
}
