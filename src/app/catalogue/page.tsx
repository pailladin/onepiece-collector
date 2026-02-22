'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

type Set = {
  id: string
  code: string
  name: string
  release_date: string
}

export default function CataloguePage() {
  const [sets, setSets] = useState<Set[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchSets = async () => {
      const { data, error } = await supabase
        .from('sets')
        .select('*')
        .order('release_date', { ascending: false })

      if (!error && data) {
        setSets(data)
      }

      setLoading(false)
    }

    fetchSets()
  }, [])

  if (loading) {
    return <div style={{ padding: 40 }}>Chargement...</div>
  }

  return (
    <div style={{ padding: 40 }}>
      <h1 style={{ fontSize: 24, fontWeight: 'bold' }}>
        Catalogue - Extensions
      </h1>

      {sets.length === 0 && <p>Aucun set disponible.</p>}

      {sets.map((set) => (
        <div
          key={set.id}
          style={{
            border: '1px solid #ccc',
            padding: 20,
            marginTop: 15,
          }}
        >
          <h2>{set.code}</h2>
          <p>{set.name}</p>

          <Link href={`/catalogue/${set.code}`}>
            Voir les cartes
          </Link>
        </div>
      ))}
    </div>
  )
}