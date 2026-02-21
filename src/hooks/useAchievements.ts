import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/store'

export interface Achievement {
  id: string
  name: string
  description: string
  icon: string
  difficulty: 'easy' | 'medium' | 'hard'
  requirement_type: string
  requirement_value: number
  points: number
}

export interface UserAchievement {
  id: string
  user_id: string
  achievement_id: string
  unlocked_at: string
  achievement?: Achievement
}

export interface AchievementNotification {
  achievement: Achievement
  id: string
}

// Global notification state (outside hook for persistence)
let notificationQueue: AchievementNotification[] = []
let notificationListeners: ((notifications: AchievementNotification[]) => void)[] = []

const notifyListeners = () => {
  notificationListeners.forEach(listener => listener([...notificationQueue]))
}

export const addAchievementNotification = (achievement: Achievement) => {
  const notification: AchievementNotification = {
    achievement,
    id: `${achievement.id}-${Date.now()}`
  }
  notificationQueue.push(notification)
  notifyListeners()
}

export const removeAchievementNotification = (id: string) => {
  notificationQueue = notificationQueue.filter(n => n.id !== id)
  notifyListeners()
}

// Global function to trigger achievement check from anywhere
let globalRefreshStats: (() => Promise<void>) | null = null
export const triggerAchievementCheck = () => {
  if (globalRefreshStats) {
    globalRefreshStats()
  }
}

export function useAchievementNotifications() {
  const [notifications, setNotifications] = useState<AchievementNotification[]>([])
  
  useEffect(() => {
    const listener = (newNotifications: AchievementNotification[]) => {
      setNotifications(newNotifications)
    }
    notificationListeners.push(listener)
    return () => {
      notificationListeners = notificationListeners.filter(l => l !== listener)
    }
  }, [])
  
  return { notifications, removeNotification: removeAchievementNotification }
}

export function useAchievements() {
  const { user } = useStore()
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [userAchievements, setUserAchievements] = useState<UserAchievement[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    lines_practiced: 0,
    scripts_uploaded: 0,
    recordings_made: 0,
    streak_days: 0,
    practice_minutes: 0,
    listen_completions: 0,
    repeat_completions: 0,
    practice_completions: 0,
    perfect_scenes: 0
  })

  // Load all achievements
  const loadAchievements = useCallback(async () => {
    const { data, error } = await supabase
      .from('achievements')
      .select('*')
      .order('difficulty', { ascending: true })
    
    if (!error && data) {
      setAchievements(data)
    }
  }, [])

  // Load user's unlocked achievements
  const loadUserAchievements = useCallback(async () => {
    if (!user?.id) return
    
    const { data, error } = await supabase
      .from('user_achievements')
      .select('*, achievement:achievements(*)')
      .eq('user_id', user.id)
    
    if (!error && data) {
      setUserAchievements(data.map((ua: any) => ({
        ...ua,
        achievement: ua.achievement
      })))
    }
  }, [user?.id])

  // Load user stats for progress tracking
  const loadUserStats = useCallback(async () => {
    if (!user?.id) return
    
    try {
      // Get profile stats
      const { data: profile } = await supabase
        .from('profiles')
        .select('streak_days, total_practice_minutes, total_lines_practiced')
        .eq('id', user.id)
        .single()
      
      // Get script count
      const { count: scriptCount } = await supabase
        .from('scripts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
      
      // Get recording count
      const { count: recordingCount } = await supabase
        .from('recordings')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
      
      setStats({
        lines_practiced: profile?.total_lines_practiced || 0,
        scripts_uploaded: scriptCount || 0,
        recordings_made: recordingCount || 0,
        streak_days: profile?.streak_days || 0,
        practice_minutes: profile?.total_practice_minutes || 0,
        listen_completions: 0, // TODO: Track these
        repeat_completions: 0,
        practice_completions: 0,
        perfect_scenes: 0
      })
    } catch (err) {
      console.error('Error loading user stats:', err)
    }
  }, [user?.id])

  // Check and unlock achievements
  const checkAndUnlockAchievements = useCallback(async () => {
    if (!user?.id || achievements.length === 0) return
    
    const unlockedIds = new Set(userAchievements.map(ua => ua.achievement_id))
    const newlyUnlocked: Achievement[] = []
    
    for (const achievement of achievements) {
      if (unlockedIds.has(achievement.id)) continue
      
      let currentValue = 0
      switch (achievement.requirement_type) {
        case 'lines_practiced':
          currentValue = stats.lines_practiced
          break
        case 'scripts_uploaded':
          currentValue = stats.scripts_uploaded
          break
        case 'recordings_made':
          currentValue = stats.recordings_made
          break
        case 'streak_days':
          currentValue = stats.streak_days
          break
        case 'practice_minutes':
          currentValue = stats.practice_minutes
          break
        case 'listen_completions':
          currentValue = stats.listen_completions
          break
        case 'repeat_completions':
          currentValue = stats.repeat_completions
          break
        case 'practice_completions':
          currentValue = stats.practice_completions
          break
        case 'perfect_scenes':
          currentValue = stats.perfect_scenes
          break
      }
      
      if (currentValue >= achievement.requirement_value) {
        // Unlock achievement
        const { error } = await supabase
          .from('user_achievements')
          .insert({
            user_id: user.id,
            achievement_id: achievement.id
          })
        
        if (!error) {
          newlyUnlocked.push(achievement)
          unlockedIds.add(achievement.id)
        }
      }
    }
    
    // Show notifications for newly unlocked achievements
    newlyUnlocked.forEach(achievement => {
      addAchievementNotification(achievement)
    })
    
    // Reload user achievements if any were unlocked
    if (newlyUnlocked.length > 0) {
      loadUserAchievements()
    }
  }, [user?.id, achievements, userAchievements, stats, loadUserAchievements])

  // Initial load
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      await loadAchievements()
      await loadUserAchievements()
      await loadUserStats()
      setLoading(false)
    }
    load()
  }, [loadAchievements, loadUserAchievements, loadUserStats])

  // Check achievements when stats change
  useEffect(() => {
    if (!loading && achievements.length > 0) {
      checkAndUnlockAchievements()
    }
  }, [stats, loading, achievements.length])

  // Refresh stats (call this after actions that might unlock achievements)
  const refreshStats = useCallback(async () => {
    await loadUserStats()
  }, [loadUserStats])

  // Register global refresh function
  useEffect(() => {
    globalRefreshStats = refreshStats
    return () => { globalRefreshStats = null }
  }, [refreshStats])

  const getProgress = useCallback((achievement: Achievement) => {
    let current = 0
    switch (achievement.requirement_type) {
      case 'lines_practiced':
        current = stats.lines_practiced
        break
      case 'scripts_uploaded':
        current = stats.scripts_uploaded
        break
      case 'recordings_made':
        current = stats.recordings_made
        break
      case 'streak_days':
        current = stats.streak_days
        break
      case 'practice_minutes':
        current = stats.practice_minutes
        break
      case 'listen_completions':
        current = stats.listen_completions
        break
      case 'repeat_completions':
        current = stats.repeat_completions
        break
      case 'practice_completions':
        current = stats.practice_completions
        break
      case 'perfect_scenes':
        current = stats.perfect_scenes
        break
    }
    return {
      current: Math.min(current, achievement.requirement_value),
      target: achievement.requirement_value,
      percentage: Math.min(100, Math.round((current / achievement.requirement_value) * 100))
    }
  }, [stats])

  const isUnlocked = useCallback((achievementId: string) => {
    return userAchievements.some(ua => ua.achievement_id === achievementId)
  }, [userAchievements])

  const totalPoints = userAchievements.reduce((sum, ua) => {
    const achievement = achievements.find(a => a.id === ua.achievement_id)
    return sum + (achievement?.points || 0)
  }, 0)

  return {
    achievements,
    userAchievements,
    loading,
    stats,
    refreshStats,
    getProgress,
    isUnlocked,
    totalPoints,
    unlockedCount: userAchievements.length,
    totalCount: achievements.length
  }
}
