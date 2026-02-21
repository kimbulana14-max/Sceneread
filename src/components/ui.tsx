'use client'

import { ReactNode, ButtonHTMLAttributes } from 'react'
import { motion } from 'framer-motion'

// Card component
interface CardProps {
  children: ReactNode
  className?: string
  selected?: boolean
  glowColor?: string
  onClick?: () => void
  padding?: string
  'data-tutorial'?: string
}

export function Card({ children, className = '', selected, glowColor, onClick, padding = 'p-4', 'data-tutorial': dataTutorial }: CardProps) {
  return (
    <motion.div
      whileTap={onClick ? { scale: 0.98 } : undefined}
      onClick={onClick}
      className={`
        bg-bg-surface border rounded-lg transition-all duration-200
        ${selected ? `border-[${glowColor || 'var(--accent)'}]` : 'border-border'}
        ${onClick ? 'cursor-pointer hover:bg-bg-surface-hover hover:border-border-hover' : ''}
        ${padding}
        ${className}
      `}
      style={selected ? { borderColor: glowColor || 'var(--accent)' } : undefined}
      data-tutorial={dataTutorial}
    >
      {children}
    </motion.div>
  )
}

// Badge component
type BadgeVariant = 'default' | 'accent' | 'ai' | 'success' | 'warning' | 'error'

interface BadgeProps {
  children: ReactNode
  variant?: BadgeVariant
  className?: string
}

const badgeStyles: Record<BadgeVariant, string> = {
  default: 'bg-bg-subtle text-text-muted',
  accent: 'bg-accent-muted text-accent',
  ai: 'bg-ai-muted text-ai',
  success: 'bg-success-muted text-success',
  warning: 'bg-warning-muted text-warning',
  error: 'bg-error-muted text-error',
}

export function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  return (
    <span className={`
      px-2 py-1 text-[10px] font-semibold font-mono tracking-wide uppercase rounded
      ${badgeStyles[variant]}
      ${className}
    `}>
      {children}
    </span>
  )
}

// Button component
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'ai'
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
}

export function Button({ variant = 'primary', size = 'md', children, className = '', type, ...props }: ButtonProps) {
  const variants = {
    primary: 'bg-accent hover:bg-accent/90 text-white shadow-lg shadow-accent/25',
    secondary: 'bg-bg-surface hover:bg-bg-surface-hover border border-border text-text',
    ghost: 'hover:bg-bg-surface text-text-secondary hover:text-text',
    ai: 'bg-ai hover:bg-ai/90 text-white shadow-lg shadow-ai/25',
  }

  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  }

  return (
    <button
      type={type}
      className={`
        font-medium rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97]
        ${variants[variant]}
        ${sizes[size]}
        ${className}
      `}
      {...props}
    >
      {children}
    </button>
  )
}

// Progress Bar
interface ProgressBarProps {
  value: number
  color?: string
  height?: number
  className?: string
}

export function ProgressBar({ value, color = 'var(--accent)', height = 4, className = '' }: ProgressBarProps) {
  return (
    <div 
      className={`bg-bg-subtle rounded-full overflow-hidden ${className}`}
      style={{ height }}
    >
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, value)}%` }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="h-full rounded-full"
        style={{ backgroundColor: color }}
      />
    </div>
  )
}

// Waveform Visualizer
interface WaveformProps {
  active?: boolean
  color?: string
  bars?: number
}

export function Waveform({ active = false, color = 'var(--ai)', bars = 24 }: WaveformProps) {
  return (
    <div className="flex items-center justify-center gap-[2px] h-8">
      {[...Array(bars)].map((_, i) => (
        <motion.div
          key={i}
          className="w-[2px] rounded-full"
          style={{ backgroundColor: color }}
          animate={active ? {
            height: ['15%', `${30 + Math.random() * 60}%`, '15%'],
            opacity: [0.5, 1, 0.5],
          } : { height: '20%', opacity: 0.3 }}
          transition={active ? {
            duration: 0.3 + Math.random() * 0.3,
            repeat: Infinity,
            repeatType: 'reverse',
            delay: i * 0.02,
          } : undefined}
        />
      ))}
    </div>
  )
}

// Toggle Switch
interface ToggleProps {
  value: boolean
  onChange: (value: boolean) => void
  label?: string
}

export function Toggle({ value, onChange, label }: ToggleProps) {
  return (
    <div 
      className="flex items-center justify-between cursor-pointer"
      onClick={() => onChange(!value)}
    >
      {label && <span className="text-text text-sm">{label}</span>}
      <div className={`
        w-11 h-6 rounded-full p-0.5 transition-colors duration-200
        ${value ? 'bg-accent' : 'bg-bg-subtle'}
      `}>
        <motion.div
          className="w-5 h-5 bg-white rounded-full"
          animate={{ x: value ? 20 : 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      </div>
    </div>
  )
}

// Slider
interface SliderProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  color?: string
  label?: string
  valueLabel?: string
}

export function Slider({ value, onChange, min = 0, max = 100, color = 'var(--ai)', label, valueLabel }: SliderProps) {
  const percentage = ((value - min) / (max - min)) * 100

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const newValue = Math.round((x / rect.width) * (max - min) + min)
    onChange(Math.max(min, Math.min(max, newValue)))
  }

  return (
    <div className="mb-4">
      {(label || valueLabel) && (
        <div className="flex justify-between mb-2">
          <span className="text-text text-sm">{label}</span>
          <span className="text-text-muted text-xs font-mono">{valueLabel}</span>
        </div>
      )}
      <div 
        className="relative h-5 flex items-center cursor-pointer"
        onClick={handleClick}
      >
        <div className="absolute left-0 right-0 h-1 bg-bg-subtle rounded-full">
          <div 
            className="h-full rounded-full"
            style={{ width: `${percentage}%`, backgroundColor: color }}
          />
        </div>
        <div 
          className="absolute w-3.5 h-3.5 bg-white rounded-full shadow-lg transform -translate-x-1/2"
          style={{ left: `${percentage}%` }}
        />
      </div>
    </div>
  )
}

// Empty State
interface EmptyStateProps {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-16 h-16 rounded-xl bg-bg-surface flex items-center justify-center mb-4 text-text-subtle">
        {icon}
      </div>
      <h3 className="text-text font-medium mb-2">{title}</h3>
      <p className="text-text-muted text-sm mb-4 max-w-xs">{description}</p>
      {action}
    </div>
  )
}

// Loading Spinner
export function Spinner({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}
