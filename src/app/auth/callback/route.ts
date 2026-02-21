import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const token_hash = requestUrl.searchParams.get('token_hash')
  const type = requestUrl.searchParams.get('type') || 'signup'
  const error = requestUrl.searchParams.get('error')
  const errorDescription = requestUrl.searchParams.get('error_description')
  
  // Base URL for redirects
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://sceneread-app.vercel.app'
  
  // Handle errors
  if (error) {
    console.error('Auth callback error:', error, errorDescription)
    return NextResponse.redirect(`${baseUrl}?error=${error}&error_description=${encodeURIComponent(errorDescription || '')}`)
  }
  
  // If there's a token_hash, verify the OTP
  if (token_hash) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    
    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        token_hash,
        type: type as 'signup' | 'email' | 'recovery' | 'invite' | 'magiclink' | 'email_change'
      })
      
      if (verifyError) {
        console.error('OTP verification error:', verifyError)
        return NextResponse.redirect(`${baseUrl}?error=verification_failed&error_description=${encodeURIComponent(verifyError.message)}`)
      }
      
      // Successfully verified - redirect with tokens
      if (data.session) {
        const redirectUrl = new URL(baseUrl)
        redirectUrl.hash = `access_token=${data.session.access_token}&refresh_token=${data.session.refresh_token}&type=${type}`
        return NextResponse.redirect(redirectUrl.toString())
      }
    } catch (err) {
      console.error('Auth callback exception:', err)
      return NextResponse.redirect(`${baseUrl}?error=callback_failed`)
    }
  }
  
  // No token provided, just redirect to home
  return NextResponse.redirect(baseUrl)
}
