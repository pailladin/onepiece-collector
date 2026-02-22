'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function Home() {
  const [sets, setSets] = useState<any[]>([])

  useEffect(() => {
    const fetchSets = async () => {
      const { data, error } = await supabase.from('sets').select('*')
      if (error) {
        console.error(error)
      } else {
        setSets(data || [])
      }
    }

    fetchSets()
  }, [])

  return (
    <div style={{ padding: 40 }}>
      <h1 style={{ fontSize: 24, fontWeight: 'bold' }}>
        One Piece Collector
      </h1>

      <pre>{JSON.stringify(sets, null, 2)}</pre>
    </div>
  )
}