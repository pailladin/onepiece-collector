'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import {
  fetchUserSetStats,
  type SetRow,
  type SetStats
} from '@/lib/collections/fetchUserSetStats'
import { CollectionSetsGrid } from '@/components/CollectionSetsGrid'

export default function CollectionPage() {
  const { user } = useAuth()
  const [sets, setSets] = useState<SetRow[]>([])
  const [stats, setStats] = useState<Record<string, SetStats>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      if (!user) {
        setLoading(false)
        setSets([])
        setStats({})
        return
      }

      setLoading(true)
      const data = await fetchUserSetStats(user.id)
      setSets(data.sets)
      setStats(data.stats)
      setLoading(false)
    }

    fetchData()
  }, [user])

  if (loading) {
    return <div style={{ padding: 40 }}>Chargement...</div>
  }

  if (!user) {
    return <div style={{ padding: 40 }}>Connecte-toi pour voir ta collection.</div>
  }

  return (
    <CollectionSetsGrid
      title="Ma Collection"
      sets={sets}
      stats={stats}
      getSetHref={(setCode) => `/collection/${setCode}`}
    />
  )
}
