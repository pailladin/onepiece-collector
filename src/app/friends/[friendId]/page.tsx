'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import {
  fetchUserSetStats,
  type SetRow,
  type SetStats
} from '@/lib/collections/fetchUserSetStats'
import { CollectionSetsGrid } from '@/components/CollectionSetsGrid'

export default function FriendCollectionsPage() {
  const params = useParams()
  const friendId = Array.isArray(params.friendId) ? params.friendId[0] : params.friendId
  const [friendUsername, setFriendUsername] = useState<string>('')
  const [sets, setSets] = useState<SetRow[]>([])
  const [stats, setStats] = useState<Record<string, SetStats>>({})
  const [loading, setLoading] = useState(true)
  const visibleSets = useMemo(
    () => sets.filter((set) => (stats[set.code]?.owned || 0) > 0),
    [sets, stats]
  )

  useEffect(() => {
    const fetchData = async () => {
      if (!friendId) return

      setLoading(true)

      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', friendId)
        .maybeSingle()

      setFriendUsername(profile?.username || 'Ami')

      const data = await fetchUserSetStats(friendId)
      setSets(data.sets)
      setStats(data.stats)
      setLoading(false)
    }

    fetchData()
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
      <CollectionSetsGrid
        title={`Collection de ${friendUsername}`}
        sets={visibleSets}
        stats={stats}
        getSetHref={(setCode) => `/friends/${friendId}/${setCode}`}
      />
    </div>
  )
}
