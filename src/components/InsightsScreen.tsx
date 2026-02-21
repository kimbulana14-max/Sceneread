'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useStore } from '@/store'
import { supabase } from '@/lib/supabase'
import { Card, Badge, ProgressBar, Spinner } from './ui'

interface DailyStat {
  date: string
  practice_minutes: number
  average_accuracy: number
}

export function InsightsScreen() {
  const { user } = useStore()
  const [weeklyStats, setWeeklyStats] = useState<DailyStat[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
  }, [user])

  const fetchStats = async () => {
    if (!user) {
      setLoading(false)
      return
    }

    try {
      // Get last 7 days of stats
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

      const { data } = await supabase
        .from('daily_stats')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', sevenDaysAgo.toISOString().split('T')[0])
        .order('date', { ascending: true })

      setWeeklyStats(data || [])
    } catch (err) {
      console.error('Error fetching stats:', err)
    } finally {
      setLoading(false)
    }
  }

  // Calculate totals
  const totalMinutes = weeklyStats.reduce((sum, s) => sum + (s.practice_minutes || 0), 0)
  const avgAccuracy = weeklyStats.length > 0
    ? Math.round(weeklyStats.reduce((sum, s) => sum + (s.average_accuracy || 0), 0) / weeklyStats.length)
    : 0
  const maxMinutes = Math.max(...weeklyStats.map(s => s.practice_minutes || 0), 1)

  // Days of week for chart
  const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  const today = new Date().getDay()

  // Sample achievements
  const achievements = [
    { name: 'First Script', icon: '📜', unlocked: true },
    { name: 'Week Warrior', icon: '🔥', unlocked: user?.streak_days ? user.streak_days >= 7 : false, progress: user?.streak_days ? (user.streak_days / 7) * 100 : 0 },
    { name: 'Perfect Scene', icon: '🎯', unlocked: false, progress: 68 },
    { name: 'Century Club', icon: '💯', unlocked: false, progress: user?.total_practice_minutes ? (user.total_practice_minutes / 6000) * 100 : 0 },
    { name: 'Line Master', icon: '⭐', unlocked: false, progress: user?.total_lines_practiced ? (user.total_lines_practiced / 500) * 100 : 0 },
  ]

  // Improvement areas
  const improvementAreas = [
    { issue: 'Pacing consistency', progress: 72, tip: 'Try slower breathing between lines', trend: '+5%' },
    { issue: 'Word accuracy', progress: 88, tip: 'Review script before each take', trend: '+12%' },
    { issue: 'Line endings', progress: 65, tip: 'Commit fully to final words', trend: '-2%' },
  ]

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Spinner size={32} className="text-accent" />
      </div>
    )
  }

  return (
    <div className="pb-24 pt-safe">
      {/* Header */}
      <div className="px-5 pt-6 pb-4">
        <h1 className="font-display text-3xl font-normal text-text mb-1">Insights</h1>
        <p className="text-text-muted text-sm">This week's performance</p>
      </div>

      {/* Main Stats */}
      <div className="px-5 mb-5">
        <div className="grid grid-cols-2 gap-3">
          <Card padding="p-5">
            <div className="text-text-muted text-[11px] font-semibold tracking-wide uppercase mb-2">
              Accuracy
            </div>
            <div className="text-3xl font-semibold text-success font-mono">
              {avgAccuracy || '—'}%
            </div>
            {avgAccuracy > 0 && (
              <div className="text-success text-[11px] mt-1">↑ Great job!</div>
            )}
          </Card>

          <Card padding="p-5">
            <div className="text-text-muted text-[11px] font-semibold tracking-wide uppercase mb-2">
              Practice Time
            </div>
            <div className="text-3xl font-semibold text-text font-mono">
              {totalMinutes > 60 
                ? `${(totalMinutes / 60).toFixed(1)}h`
                : `${totalMinutes}m`
              }
            </div>
            <div className="text-text-muted text-[11px] mt-1">This week</div>
          </Card>

          <Card padding="p-5">
            <div className="text-text-muted text-[11px] font-semibold tracking-wide uppercase mb-2">
              Lines Practiced
            </div>
            <div className="text-3xl font-semibold text-text font-mono">
              {user?.total_lines_practiced || 0}
            </div>
          </Card>

          <Card padding="p-5">
            <div className="text-text-muted text-[11px] font-semibold tracking-wide uppercase mb-2">
              Streak
            </div>
            <div className="text-3xl font-semibold text-warning font-mono">
              {user?.streak_days || 0}
              <span className="text-sm text-text-muted ml-1">days</span>
            </div>
          </Card>
        </div>
      </div>

      {/* Weekly Activity Chart */}
      <div className="px-5 mb-5">
        <Card padding="p-5">
          <div className="text-[11px] font-semibold text-text-subtle tracking-widest uppercase mb-5">
            Weekly Activity
          </div>
          <div className="flex items-end justify-between h-28">
            {dayLabels.map((day, i) => {
              const isToday = i === (today === 0 ? 6 : today - 1)
              const stat = weeklyStats[i]
              const height = stat 
                ? Math.max(8, (stat.practice_minutes / maxMinutes) * 100)
                : 8

              return (
                <div key={i} className="flex flex-col items-center gap-2">
                  <motion.div
                    initial={{ height: 8 }}
                    animate={{ height: `${height}%` }}
                    transition={{ delay: i * 0.05, duration: 0.4 }}
                    className={`
                      w-8 rounded-md
                      ${isToday 
                        ? 'bg-gradient-to-t from-accent/50 to-accent' 
                        : 'bg-bg-subtle'}
                    `}
                    style={{ minHeight: 8 }}
                  />
                  <span className={`
                    text-[11px] font-medium
                    ${isToday ? 'text-accent' : 'text-text-subtle'}
                  `}>
                    {day}
                  </span>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      {/* Achievements */}
      <div className="px-5 mb-5">
        <Card padding="p-4">
          <div className="text-[11px] font-semibold text-text-subtle tracking-widest uppercase mb-3">
            Achievements
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {achievements.map((achievement, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
                className={`
                  min-w-[80px] text-center p-3 rounded-xl
                  ${achievement.unlocked 
                    ? 'bg-accent-muted border border-accent-border' 
                    : 'bg-bg-subtle border border-border opacity-50'}
                `}
              >
                <div className="text-2xl mb-1">{achievement.icon}</div>
                <div className="text-text text-[10px] font-medium">
                  {achievement.name}
                </div>
                {!achievement.unlocked && achievement.progress !== undefined && (
                  <div className="mt-2">
                    <ProgressBar value={achievement.progress} height={2} />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </Card>
      </div>

      {/* Areas to Improve */}
      <div className="px-5">
        <Card padding="p-4">
          <div className="text-[11px] font-semibold text-text-subtle tracking-widest uppercase mb-4">
            Areas to Improve
          </div>
          <div className="space-y-4">
            {improvementAreas.map((item, i) => (
              <div key={i}>
                <div className="flex justify-between mb-1.5">
                  <span className="text-text text-sm font-medium">{item.issue}</span>
                  <span className={`
                    text-xs font-mono font-semibold
                    ${item.progress >= 80 ? 'text-success' : 'text-warning'}
                  `}>
                    {item.progress}%
                  </span>
                </div>
                <div className="mb-1.5">
                  <ProgressBar 
                    value={item.progress} 
                    color={item.progress >= 80 ? 'var(--success)' : 'var(--warning)'} 
                    height={4} 
                  />
                </div>
                <div className="flex justify-between">
                  <span className="text-text-subtle text-[11px]">💡 {item.tip}</span>
                  <span className={`
                    text-[10px] font-mono
                    ${item.trend.startsWith('+') ? 'text-success' : 'text-error'}
                  `}>
                    {item.trend}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
