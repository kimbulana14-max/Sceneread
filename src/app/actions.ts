'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export type AuthResult = {
  success: boolean
  error?: string
  requiresEmailConfirmation?: boolean
  user?: {
    id: string
    email: string
  }
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return { success: false, error: error.message }
  }

  if (data.user) {
    return { 
      success: true, 
      user: { id: data.user.id, email: data.user.email || '' }
    }
  }

  return { success: false, error: 'Sign in failed' }
}

export async function signUp(email: string, password: string, fullName: string): Promise<AuthResult> {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName }
    }
  })

  if (error) {
    return { success: false, error: error.message }
  }

  // Check if email confirmation is required
  if (data.user && !data.session) {
    // Email confirmation required
    return { 
      success: true, 
      requiresEmailConfirmation: true,
      user: { id: data.user.id, email: data.user.email || '' }
    }
  }

  if (data.user && data.session) {
    // Immediate signup (no email confirmation)
    // Update profile with full name
    await supabase
      .from('profiles')
      .update({ full_name: fullName })
      .eq('id', data.user.id)

    return { 
      success: true, 
      user: { id: data.user.id, email: data.user.email || '' }
    }
  }

  return { success: false, error: 'Sign up failed' }
}

export async function verifyOtp(email: string, token: string, fullName: string): Promise<AuthResult> {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'signup'
  })

  if (error) {
    return { success: false, error: error.message }
  }

  if (data.user) {
    // Update/create profile with full name
    await supabase
      .from('profiles')
      .upsert({ id: data.user.id, full_name: fullName })

    return { 
      success: true, 
      user: { id: data.user.id, email: data.user.email || '' }
    }
  }

  return { success: false, error: 'Verification failed' }
}

export async function resendVerificationEmail(email: string): Promise<AuthResult> {
  const supabase = await createClient()

  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
  })

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
}

export async function getSession() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  
  if (error || !user) {
    return null
  }

  // Fetch profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return {
    user,
    profile: profile || { id: user.id, email: user.email, onboarding_complete: false }
  }
}
