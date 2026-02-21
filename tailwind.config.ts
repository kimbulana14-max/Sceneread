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
          DEFAULT: '#08080A',
          elevated: '#0F0F12',
          surface: '#141418',
          'surface-hover': '#1A1A1F',
          subtle: '#1E1E24',
        },
        border: {
          DEFAULT: 'rgba(255,255,255,0.06)',
          hover: 'rgba(255,255,255,0.1)',
        },
        text: {
          DEFAULT: '#FAFAFA',
          secondary: '#A1A1AA',
          muted: '#71717A',
          subtle: '#52525B',
        },
        accent: {
          DEFAULT: '#E11D48',
          muted: 'rgba(225,29,72,0.15)',
          border: 'rgba(225,29,72,0.3)',
        },
        ai: {
          DEFAULT: '#6366F1',
          muted: 'rgba(99,102,241,0.12)',
          border: 'rgba(99,102,241,0.25)',
        },
        success: {
          DEFAULT: '#10B981',
          muted: 'rgba(16,185,129,0.12)',
          border: 'rgba(16,185,129,0.3)',
        },
        warning: {
          DEFAULT: '#F59E0B',
          muted: 'rgba(245,158,11,0.12)',
        },
        error: {
          DEFAULT: '#EF4444',
          muted: 'rgba(239,68,68,0.12)',
          border: 'rgba(239,68,68,0.3)',
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
