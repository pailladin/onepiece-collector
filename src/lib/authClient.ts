import type { Provider } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'

export const OAUTH_PROVIDERS = ['google', 'discord'] as const

export type OAuthProviderName = (typeof OAUTH_PROVIDERS)[number]

export function getProviderLabel(provider: OAuthProviderName) {
  if (provider === 'google') return 'Google'
  if (provider === 'discord') return 'Discord'
  return provider
}

export async function signInWithPassword(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password })
}

export async function signUpWithPassword(params: {
  email: string
  password: string
  username: string
  emailRedirectTo: string
}) {
  return supabase.auth.signUp({
    email: params.email,
    password: params.password,
    options: {
      data: {
        username: params.username
      },
      emailRedirectTo: params.emailRedirectTo
    }
  })
}

export async function sendPasswordResetEmail(email: string, redirectTo: string) {
  return supabase.auth.resetPasswordForEmail(email, { redirectTo })
}

export async function updatePassword(password: string) {
  return supabase.auth.updateUser({ password })
}

export async function signInWithOAuthProvider(provider: OAuthProviderName, redirectTo: string) {
  return supabase.auth.signInWithOAuth({
    provider: provider as Provider,
    options: {
      redirectTo
    }
  })
}

export async function linkOAuthProvider(provider: OAuthProviderName, redirectTo: string) {
  return supabase.auth.linkIdentity({
    provider: provider as Provider,
    options: {
      redirectTo
    }
  })
}

export async function getLinkedProviders() {
  const { data, error } = await supabase.auth.getUserIdentities()
  if (error) return { providers: new Set<OAuthProviderName>(), error }

  const providers = new Set<OAuthProviderName>()
  for (const identity of data.identities || []) {
    const provider = String(identity.provider || '').trim().toLowerCase()
    if (provider === 'google' || provider === 'discord') {
      providers.add(provider)
    }
  }

  return { providers, error: null }
}
