import { supabase } from './supabase'

function getSiteUrl() {
  const raw = process.env.EXPO_PUBLIC_SITE_URL || ''
  return raw.replace(/\/+$/, '')
}

export async function fetchJsonWithAuth<T>(path: string): Promise<T> {
  const baseUrl = getSiteUrl()
  if (!baseUrl) {
    throw new Error('Missing EXPO_PUBLIC_SITE_URL in mobile environment.')
  }

  const { data, error } = await supabase.auth.getSession()
  if (error) throw new Error(error.message)

  const token = data.session?.access_token
  const response = await fetch(`${baseUrl}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message =
      payload && typeof payload.error === 'string' ? payload.error : 'Erreur API mobile.'
    throw new Error(message)
  }

  return payload as T
}
