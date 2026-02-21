import type { Metadata, Viewport } from 'next'
import './globals.css'
import { ThemeProvider } from '@/components/ThemeProvider'

export const metadata: Metadata = {
  title: 'SceneRead - Master Your Lines',
  description: 'AI-powered script practice for actors. Practice lines with realistic AI scene partners, get instant feedback, and record professional self-tapes.',
  keywords: ['acting', 'script', 'lines', 'practice', 'self-tape', 'audition', 'actor'],
  authors: [{ name: 'SceneRead' }],
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SceneRead',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#08080A',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('sceneread-theme');if(t==='light'){document.documentElement.dataset.theme='light'}}catch(e){}})()`,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600&family=DM+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />

        {/* App Icons */}
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />

        {/* PWA */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="SceneRead" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="application-name" content="SceneRead" />
        <meta name="msapplication-TileColor" content="#08080A" />
        <meta name="msapplication-TileImage" content="/icon-144.png" />
      </head>
      <body className="bg-bg text-text min-h-screen">
        <ThemeProvider />
        {children}
      </body>
    </html>
  )
}
