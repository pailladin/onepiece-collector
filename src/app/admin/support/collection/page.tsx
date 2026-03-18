'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { CollectionSetsGrid } from '@/components/CollectionSetsGrid'
import type { ServiceSetRow, ServiceSetStats } from '@/lib/server/userCollectionService'

type SupportResponse = {
  user: {
    id: string
    username: string
  }
  sets: ServiceSetRow[]
  stats: Record<string, ServiceSetStats>
}

export default function AdminSupportCollectionPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payload, setPayload] = useState<SupportResponse | null>(null)

  const getAuthHeaders = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    const accessToken = data.session?.access_token
    return accessToken
      ? ({ Authorization: `Bearer ${accessToken}` } as Record<string, string>)
      : ({} as Record<string, string>)
  }, [])

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      setError(null)

      const authHeaders = await getAuthHeaders()
      const res = await fetch('/api/admin/support/collection', { headers: authHeaders })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setPayload(null)
        setError(data?.error || 'Erreur chargement collection support')
        setLoading(false)
        return
      }

      setPayload(data as SupportResponse)
      setLoading(false)
    }

    void loadData()
  }, [getAuthHeaders])

  const visibleSets = useMemo(
    () => (payload?.sets || []).filter((set) => ((payload?.stats || {})[set.code]?.owned || 0) > 0),
    [payload]
  )

  if (loading) return <div style={{ padding: 40 }}>Chargement...</div>

  return (
    <div>
      <div style={{ padding: '24px 40px 0', display: 'flex', gap: 14 }}>
        <Link href="/admin/users">Retour admin users</Link>
        <Link href="/admin/support/account">Voir son compte</Link>
      </div>
      {error && <div style={{ padding: '12px 40px 0', color: '#b91c1c', fontWeight: 600 }}>{error}</div>}
      {!error && payload && visibleSets.length === 0 && (
        <div style={{ padding: '12px 40px 0', color: '#475569', fontWeight: 600 }}>
          Cet utilisateur n&apos;a pas encore de carte dans sa collection.
        </div>
      )}
      <CollectionSetsGrid
        title={`Support lecture seule - Collection de ${payload?.user.username || 'Utilisateur'}`}
        sets={visibleSets}
        stats={(payload?.stats || {}) as Record<string, ServiceSetStats>}
        getSetHref={(setCode) => `/admin/support/collection/${setCode}`}
      />
    </div>
  )
}
