/**
 * Audio Manager - Handles mobile autoplay restrictions
 *
 * Mobile browsers require user interaction to play audio.
 * This manager unlocks audio on first interaction and keeps it unlocked.
 *
 * CRITICAL: unlock() must never hang. On iOS, .play() can return a Promise
 * that never settles, so all play calls are wrapped with a timeout race.
 */

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([
    promise,
    new Promise<undefined>(resolve => setTimeout(() => resolve(undefined), ms)),
  ])
}

class AudioManager {
  private audioContext: AudioContext | null = null
  private unlocked: boolean = false
  private audioElement: HTMLAudioElement | null = null

  /**
   * Initialize the audio manager. Call this on first user interaction.
   * Creates an AudioContext and plays a silent sound to unlock audio.
   * Never blocks for more than 500ms.
   */
  async unlock(): Promise<boolean> {
    if (this.unlocked) {
      return true
    }

    try {
      // Create or resume AudioContext
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      }

      if (this.audioContext.state === 'suspended') {
        await withTimeout(this.audioContext.resume(), 500)
      }

      // Play a silent buffer to fully unlock
      const buffer = this.audioContext.createBuffer(1, 1, 22050)
      const source = this.audioContext.createBufferSource()
      source.buffer = buffer
      source.connect(this.audioContext.destination)
      source.start(0)

      // Also create and "touch" an audio element (with timeout — iOS can hang here)
      if (!this.audioElement) {
        this.audioElement = new Audio()
        this.audioElement.setAttribute('playsinline', '')
        this.audioElement.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'
      }

      try {
        await withTimeout(this.audioElement.play(), 300)
        this.audioElement.pause()
      } catch (e) {
        // Ignore - the AudioContext unlock is the important part
      }

      this.unlocked = true
      return true
    } catch (error) {
      console.error('[AudioManager] Failed to unlock audio:', error)
      // Mark as unlocked anyway — don't block future attempts
      this.unlocked = true
      return false
    }
  }

  /**
   * Non-blocking unlock — fires and forgets, never awaited.
   * Use this when you need to ensure the gesture is captured but
   * can't afford to wait.
   */
  unlockSync(): void {
    if (this.unlocked) return
    this.unlock().catch(() => {})
  }

  isUnlocked(): boolean {
    return this.unlocked
  }

  getContext(): AudioContext | null {
    if (!this.audioContext) {
      try {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      } catch (e) {
        console.error('[AudioManager] Failed to create AudioContext:', e)
      }
    }
    return this.audioContext
  }

  async playThroughElement(audioElement: HTMLAudioElement, src: string): Promise<void> {
    if (!this.unlocked) {
      await this.unlock()
    }

    if (this.audioContext?.state === 'suspended') {
      await withTimeout(this.audioContext.resume(), 500)
    }

    audioElement.src = src
    await audioElement.load()
    await audioElement.play()
  }

  playTone(frequency: number, duration: number, type: OscillatorType = 'sine', volume: number = 0.15): void {
    const ctx = this.getContext()
    if (!ctx) return

    try {
      if (ctx.state === 'suspended') {
        ctx.resume()
      }

      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = frequency
      osc.type = type
      gain.gain.value = volume
      osc.start()
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration)
      osc.stop(ctx.currentTime + duration)
    } catch (e) {
      console.warn('[AudioManager] Tone playback error:', e)
    }
  }
}

// Singleton instance
export const audioManager = new AudioManager()

// Convenience functions
export const unlockAudio = () => audioManager.unlock()
export const isAudioUnlocked = () => audioManager.isUnlocked()
export const playTone = (freq: number, dur: number, type?: OscillatorType, vol?: number) =>
  audioManager.playTone(freq, dur, type, vol)
