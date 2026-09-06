import { supabase } from '@/lib/supabaseClient'

export type SetStats = {
  total: number
  owned: number
  percent: number
  totalNormal: number
  ownedNormal: number
  percentNormal: number
  totalAlt: number
  ownedAlt: number
  percentAlt: number
}

export type SetRow = {
  id: string
  code: string
  name: string
}

export async function fetchUserSetStats(userId: string) {
  if (!userId) return { sets: [] as SetRow[], stats: {} as Record<string, SetStats> }

  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Session invalide. Reconnecte-toi.')

  const response = await fetch('/api/collection/stats', {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}` }
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.error || 'Erreur chargement collection')
  }

  return {
    sets: (Array.isArray(payload?.sets) ? payload.sets : []) as SetRow[],
    stats: (payload?.stats || {}) as Record<string, SetStats>
  }
}
