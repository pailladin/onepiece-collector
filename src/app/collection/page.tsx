'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/lib/auth'

export default function CollectionPage() {
  const { user } = useAuth()
  const [sets, setSets] = useState<any[]>([])
  const [stats, setStats] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return

      setLoading(true)

      const { data: setsData } = await supabase
        .from('sets')
        .select('*')
        .order('code')

      const { data: printsData } = await supabase
        .from('card_prints')
        .select('id, distribution_set_id')

      const { data: collectionData } = await supabase
        .from('collections')
        .select('card_print_id')
        .eq('user_id', user.id)

      const ownedIds = new Set(collectionData?.map((c) => c.card_print_id))

      const result: Record<string, any> = {}

      setsData?.forEach((set) => {
        const prints =
          printsData?.filter((p) => p.distribution_set_id === set.id) || []

        const total = prints.length
        const owned = prints.filter((p) => ownedIds.has(p.id)).length

        const percent = total > 0 ? Math.round((owned / total) * 100) : 0

        result[set.code] = {
          total,
          owned,
          percent
        }
      })

      setSets(setsData || [])
      setStats(result)
      setLoading(false)
    }

    fetchData()
  }, [user])

  if (loading) {
    return <div style={{ padding: 40 }}>Chargement...</div>
  }

  return (
    <div style={{ padding: 40 }}>
      <h1 style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 30 }}>
        Ma Collection
      </h1>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 25
        }}
      >
        {sets.map((set) => {
          const stat = stats[set.code]

          return (
            <Link
              key={set.id}
              href={`/collection/${set.code}`}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div
                style={{
                  border: '1px solid #ddd',
                  borderRadius: 10,
                  padding: 15,
                  background: '#fff',
                  cursor: 'pointer'
                }}
              >
                <div style={{ fontWeight: 'bold', fontSize: 18 }}>
                  {set.code}
                </div>

                <div style={{ marginTop: 10 }}>
                  {stat?.owned} / {stat?.total}
                </div>

                <div
                  style={{
                    marginTop: 8,
                    height: 8,
                    background: '#eee',
                    borderRadius: 4
                  }}
                >
                  <div
                    style={{
                      width: `${stat?.percent || 0}%`,
                      height: '100%',
                      background: '#0070f3',
                      borderRadius: 4
                    }}
                  />
                </div>

                <div style={{ marginTop: 5, fontSize: 12 }}>
                  {stat?.percent}% complété
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
