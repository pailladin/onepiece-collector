'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

const STORAGE_BASE_URL =
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/cards-images`

export default function CataloguePage() {
  const [sets, setSets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchSets = async () => {
      setLoading(true)

      const { data } = await supabase
        .from('sets')
        .select('*')
        .order('code', { ascending: true })

      setSets(data || [])
      setLoading(false)
    }

    fetchSets()
  }, [])

  if (loading) {
    return <div style={{ padding: 40 }}>Chargement...</div>
  }

  return (
    <div style={{ padding: 40 }}>
      <h1 style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 30 }}>
        Catalogue des Sets
      </h1>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          columnGap: 32,
          rowGap: 48
        }}
      >
        {sets.map((set) => {
          const imageUrl =
            `${STORAGE_BASE_URL}/sets/${set.code}.png`

          return (
            <Link
              key={set.id}
              href={`/catalogue/${set.code}`}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div
                style={{
                  border: '1px solid #ddd',
                  borderRadius: 10,
                  padding: 15,
                  background: '#fff',
                  transition: 'transform 0.2s',
                  cursor: 'pointer',
                  height: '100%'
                }}
              >
                <div
                  style={{
                    height: 300,
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 15,
                    overflow: 'hidden'
                  }}
                >
                  <img
                    src={imageUrl}
                    alt={set.code}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '100%',
                      objectFit: 'contain'
                    }}
                  />
                </div>

                <div
                  style={{
                    fontWeight: 'bold',
                    fontSize: 18,
                    textAlign: 'center'
                  }}
                >
                  {set.code}
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
