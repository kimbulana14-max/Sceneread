import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: 'var(--bg)',
          elevated: 'var(--bg-elevated)',
          surface: 'var(--bg-surface)',
          'surface-hover': 'var(--bg-surface-hover)',
          subtle: 'var(--bg-subtle)',
        },
        border: {
          DEFAULT: 'var(--border)',
          hover: 'var(--border-hover)',
        },
        text: {
          DEFAULT: 'var(--text)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
          subtle: 'var(--text-subtle)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          muted: 'var(--accent-muted)',
          border: 'var(--accent-border)',
        },
        ai: {
          DEFAULT: 'var(--ai)',
          muted: 'var(--ai-muted)',
          highlight: 'var(--ai-highlight)',
          border: 'var(--ai-border)',
        },
        success: {
          DEFAULT: 'var(--success)',
          muted: 'var(--success-muted)',
          border: 'rgba(16,185,129,0.3)',
        },
        warning: {
          DEFAULT: 'var(--warning)',
          muted: 'var(--warning-muted)',
        },
        error: {
          DEFAULT: 'var(--error)',
          muted: 'var(--error-muted)',
          border: 'rgba(239,68,68,0.3)',
        },
        overlay: {
          2: 'var(--overlay-2)',
          5: 'var(--overlay-5)',
          10: 'var(--overlay-10)',
          20: 'var(--overlay-20)',
          40: 'var(--overlay-40)',
        },
      },
      fontFamily: {
        display: ['Playfair Display', 'Georgia', 'serif'],
        body: ['DM Sans', '-apple-system', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '14px',
        xl: '20px',
      },
      animation: {
        'wave': 'wave 0.5s ease-in-out infinite alternate',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
      },
      keyframes: {
        wave: {
          '0%': { height: '15%' },
          '100%': { height: '85%' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}

export default config
