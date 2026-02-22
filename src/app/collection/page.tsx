'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/lib/auth'

type SetStats = {
  code: string
  name: string
  totalPrints: number
  ownedPrints: number
}

export default function CollectionPage() {
  const { user, loading } = useAuth()
  const [stats, setStats] = useState<SetStats[]>([])
  const [loadingData, setLoadingData] = useState(true)

  useEffect(() => {
    if (!user) return

    const fetchStats = async () => {
      const { data: sets } = await supabase
        .from('sets')
        .select('*')

      if (!sets) return

      const results: SetStats[] = []

      for (const set of sets) {
        const { count: total } = await supabase
          .from('card_prints')
          .select('*', { count: 'exact', head: true })
          .eq('distribution_set_id', set.id)

        const { data: owned } = await supabase
          .from('collections')
          .select(`
            card_print_id,
            card_prints!inner (
              distribution_set_id
            )
          `)
          .eq('user_id', user.id)
          .eq('card_prints.distribution_set_id', set.id)

        results.push({
          code: set.code,
          name: set.name,
          totalPrints: total || 0,
          ownedPrints: owned ? owned.length : 0,
        })
      }

      setStats(results)
      setLoadingData(false)
    }

    fetchStats()
  }, [user])

  if (loading || loadingData)
    return <div style={{ padding: 40 }}>Chargement...</div>

  if (!user)
    return <div style={{ padding: 40 }}>Non connecté</div>

  return (
    <div style={{ padding: 40 }}>
      <h1 style={{ fontSize: 24, fontWeight: 'bold' }}>
        Ma Collection
      </h1>

      {stats.map((set) => {
        const percentage =
          set.totalPrints > 0
            ? Math.round((set.ownedPrints / set.totalPrints) * 100)
            : 0

        return (
          <div
            key={set.code}
            style={{
              border: '1px solid #ccc',
              padding: 20,
              marginTop: 20,
            }}
          >
            <h2>{set.code}</h2>
            <p>{set.name}</p>

            <p>
              {set.ownedPrints} / {set.totalPrints} ({percentage}%)
            </p>

            <div
              style={{
                background: '#eee',
                height: 20,
                width: '100%',
                borderRadius: 10,
                overflow: 'hidden',
                marginBottom: 15,
              }}
            >
              <div
                style={{
                  width: `${percentage}%`,
                  height: '100%',
                  background: '#4caf50',
                }}
              />
            </div>

            <Link href={`/collection/${set.code}`}>
              Voir les cartes de ce set
            </Link>
          </div>
        )
      })}
    </div>
  )
}