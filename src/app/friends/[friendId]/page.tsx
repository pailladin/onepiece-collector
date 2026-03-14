'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { type SetRow, type SetStats } from '@/lib/collections/fetchUserSetStats'
import { CollectionSetsGrid } from '@/components/CollectionSetsGrid'

export default function FriendCollectionsPage() {
  const params = useParams()
  const friendId = Array.isArray(params.friendId) ? params.friendId[0] : params.friendId
  const [friendUsername, setFriendUsername] = useState<string>('')
  const [sets, setSets] = useState<SetRow[]>([])
  const [stats, setStats] = useState<Record<string, SetStats>>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const visibleSets = useMemo(
    () => sets.filter((set) => (stats[set.code]?.owned || 0) > 0),
    [sets, stats]
  )

  useEffect(() => {
    const fetchData = async () => {
      if (!friendId) return

      setLoading(true)
      setError(null)

      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token

      const res = await fetch(`/api/friends/${friendId}/sets`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setFriendUsername('Ami')
        setSets([])
        setStats({})
        setError(data?.error || 'Erreur chargement collection ami')
        setLoading(false)
        return
      }

      setFriendUsername(data?.username || 'Ami')
      setSets(Array.isArray(data?.sets) ? data.sets : [])
      setStats(typeof data?.stats === 'object' && data.stats ? data.stats : {})
      setLoading(false)
    }

    void fetchData()
  }, [friendId])

  if (!friendId) {
    return <div style={{ padding: 40 }}>Ami introuvable.</div>
  }

  if (loading) {
    return <div style={{ padding: 40 }}>Chargement...</div>
  }

  return (
    <div>
      <div style={{ padding: '24px 40px 0', display: 'flex', gap: 14 }}>
        <Link href="/friends">Retour aux amis</Link>
        <Link href={`/friends/${friendId}/trade`}>Voir echanges possibles</Link>
      </div>
      {error && (
        <div style={{ padding: '12px 40px 0', color: '#b91c1c', fontWeight: 600 }}>
          {error}
        </div>
      )}
      {!error && visibleSets.length === 0 && (
        <div style={{ padding: '12px 40px 0', color: '#475569', fontWeight: 600 }}>
          Cet ami n&apos;a pas encore de carte dans sa collection.
        </div>
      )}
      <CollectionSetsGrid
        title={`Collection de ${friendUsername}`}
        sets={visibleSets}
        stats={stats}
        getSetHref={(setCode) => `/friends/${friendId}/${setCode}`}
      />
    </div>
  )
}
