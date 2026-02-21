'use client'

import { useEffect } from 'react'
import { useSettings } from '@/store'

export function ThemeProvider() {
  const colorTheme = useSettings((s) => s.settings.colorTheme)

  useEffect(() => {
    const theme = colorTheme || 'dark'
    document.documentElement.dataset.theme = theme
    localStorage.setItem('sceneread-theme', theme)

    // Update meta theme-color
    const metaThemeColor = document.querySelector('meta[name="theme-color"]')
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', theme === 'light' ? '#faf8f4' : '#08080A')
    }

    // Update favicon for theme
    const favicon32 = document.querySelector('link[rel="icon"][sizes="32x32"]') as HTMLLinkElement | null
    const favicon16 = document.querySelector('link[rel="icon"][sizes="16x16"]') as HTMLLinkElement | null
    const appleTouchIcon = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null

    if (theme === 'light') {
      if (favicon32) favicon32.href = '/favicon-light-32x32.png'
      if (favicon16) favicon16.href = '/favicon-light-16x16.png'
      if (appleTouchIcon) appleTouchIcon.href = '/apple-touch-icon-light.png'
    } else {
      if (favicon32) favicon32.href = '/favicon-32x32.png'
      if (favicon16) favicon16.href = '/favicon-16x16.png'
      if (appleTouchIcon) appleTouchIcon.href = '/apple-touch-icon.png'
    }
  }, [colorTheme])

  return null
}
