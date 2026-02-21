/**
 * Audio Manager - Handles mobile autoplay restrictions
 * 
 * Mobile browsers require user interaction to play audio.
 * This manager unlocks audio on first interaction and keeps it unlocked.
 */

class AudioManager {
  private audioContext: AudioContext | null = null
  private unlocked: boolean = false
  private audioElement: HTMLAudioElement | null = null
  
  /**
   * Initialize the audio manager. Call this on first user interaction.
   * Creates an AudioContext and plays a silent sound to unlock audio.
   */
  async unlock(): Promise<boolean> {
    if (this.unlocked) {
      console.log('[AudioManager] Already unlocked')
      return true
    }
    
    try {
      console.log('[AudioManager] Unlocking audio...')
      
      // Create or resume AudioContext
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      }
      
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume()
      }
      
      // Play a silent buffer to fully unlock
      const buffer = this.audioContext.createBuffer(1, 1, 22050)
      const source = this.audioContext.createBufferSource()
      source.buffer = buffer
      source.connect(this.audioContext.destination)
      source.start(0)
      
      // Also create and "touch" an audio element
      if (!this.audioElement) {
        this.audioElement = new Audio()
        this.audioElement.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'
      }
      
      try {
        await this.audioElement.play()
        this.audioElement.pause()
      } catch (e) {
        // Ignore - the AudioContext unlock is the important part
      }
      
      this.unlocked = true
      console.log('[AudioManager] Audio unlocked successfully')
      return true
    } catch (error) {
      console.error('[AudioManager] Failed to unlock audio:', error)
      return false
    }
  }
  
  /**
   * Check if audio is unlocked
   */
  isUnlocked(): boolean {
    return this.unlocked
  }
  
  /**
   * Get the AudioContext (creates one if needed)
   */
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
  
  /**
   * Play audio through an existing audio element, ensuring it's unlocked first
   */
  async playThroughElement(audioElement: HTMLAudioElement, src: string): Promise<void> {
    // Ensure unlocked
    if (!this.unlocked) {
      await this.unlock()
    }
    
    // Resume context if suspended
    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume()
    }
    
    audioElement.src = src
    await audioElement.load()
    await audioElement.play()
  }
  
  /**
   * Play a tone using Web Audio API
   */
  playTone(frequency: number, duration: number, type: OscillatorType = 'sine', volume: number = 0.15): void {
    const ctx = this.getContext()
    if (!ctx) return
    
    try {
      // Resume if suspended
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
