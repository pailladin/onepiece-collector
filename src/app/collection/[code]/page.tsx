'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/lib/auth'
import { DEFAULT_LOCALE } from '@/lib/locale'

const STORAGE_BASE_URL =
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/cards-images`

export default function CollectionSetPage() {
  const { user } = useAuth()
  const params = useParams()
  const code = Array.isArray(params.code)
    ? params.code[0]
    : params.code

  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return

      setLoading(true)

      // 1️⃣ récupérer le set
      const { data: setData } = await supabase
        .from('sets')
        .select('id')
        .eq('code', code)
        .single()

      if (!setData) {
        setLoading(false)
        return
      }

      // 2️⃣ récupérer la collection user
      const { data: collectionData } = await supabase
        .from('collections')
        .select('*')
        .eq('user_id', user.id)

      if (!collectionData || collectionData.length === 0) {
        setItems([])
        setLoading(false)
        return
      }

      // 3️⃣ récupérer les prints du set
      const { data: printsData } = await supabase
        .from('card_prints')
        .select('*')
        .eq('distribution_set_id', setData.id)

      const printIds = collectionData.map(c => c.card_print_id)

      const filteredPrints = printsData?.filter(p =>
        printIds.includes(p.id)
      )

      // 4️⃣ récupérer cartes
      const { data: cardsData } = await supabase
        .from('cards')
        .select(`
          id,
          rarity,
          type,
          card_translations (
            name,
            locale
          )
        `)

      const cardsMap = new Map(
        cardsData?.map(c => [c.id, c])
      )

      const merged = filteredPrints?.map(print => {
        const col = collectionData.find(
          c => c.card_print_id === print.id
        )

        return {
          ...print,
          card: cardsMap.get(print.card_id),
          quantity: col?.quantity || 0
        }
      }) || []

      setItems(merged)
      setLoading(false)
    }

    fetchData()
  }, [user, code])

  if (loading) {
    return <div style={{ padding: 40 }}>Chargement...</div>
  }

  return (
    <div style={{ padding: 40 }}>
      <h1 style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 30 }}>
        Ma Collection - {code}
      </h1>

      {items.length === 0 && (
        <p>Aucune carte dans ce set.</p>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 20
        }}
      >
        {items.map((item) => {
          const translation = item.card?.card_translations?.find(
            (t: any) => t.locale === DEFAULT_LOCALE
          )

          const imageUrl =
            `${STORAGE_BASE_URL}/${code}/${item.image_path}`

          return (
            <div
              key={item.id}
              style={{
                border: '1px solid #ddd',
                borderRadius: 8,
                padding: 10,
                textAlign: 'center',
                background: '#fff'
              }}
            >
              <img
                src={imageUrl}
                alt={translation?.name}
                style={{
                  width: '100%',
                  height: 'auto',
                  marginBottom: 10
                }}
              />

              <div style={{ fontWeight: 'bold' }}>
                {item.print_code}
              </div>

              <div>{translation?.name}</div>

              <div style={{ fontSize: 12 }}>
                {item.card?.rarity} • {item.card?.type}
              </div>

              <div style={{ marginTop: 8 }}>
                Quantité : {item.quantity}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}