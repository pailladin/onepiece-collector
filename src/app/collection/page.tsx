'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/lib/auth'
import { DEFAULT_LOCALE } from '@/lib/locale'

const STORAGE_BASE_URL =
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/cards-images`

export default function CollectionPage() {
  const { user } = useAuth()
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchCollection = async () => {
      if (!user) return

      setLoading(true)

      const { data: collectionData } = await supabase
        .from('collections')
        .select('*')
        .eq('user_id', user.id)

      if (!collectionData || collectionData.length === 0) {
        setItems([])
        setLoading(false)
        return
      }

      const printIds = collectionData.map(c => c.card_print_id)

      const { data: printsData } = await supabase
        .from('card_prints')
        .select('*')
        .in('id', printIds)

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

      const merged = printsData?.map(print => {
        const collectionItem = collectionData.find(
          c => c.card_print_id === print.id
        )

        return {
          ...print,
          card: cardsMap.get(print.card_id),
          quantity: collectionItem?.quantity || 0
        }
      }) || []

      setItems(merged)
      setLoading(false)
    }

    fetchCollection()
  }, [user])

  const updateQuantity = async (printId: string, delta: number) => {
    const current = items.find(i => i.id === printId)
    if (!current) return

    const newQty = current.quantity + delta

    if (newQty <= 0) {
      await supabase
        .from('collections')
        .delete()
        .eq('user_id', user?.id)
        .eq('card_print_id', printId)

      setItems(items.filter(i => i.id !== printId))
      return
    }

    await supabase
      .from('collections')
      .update({ quantity: newQty })
      .eq('user_id', user?.id)
      .eq('card_print_id', printId)

    setItems(items.map(i =>
      i.id === printId ? { ...i, quantity: newQty } : i
    ))
  }

  if (loading) {
    return <div style={{ padding: 40 }}>Chargement...</div>
  }

  return (
    <div style={{ padding: 40 }}>
      <h1 style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 30 }}>
        Ma Collection
      </h1>

      {items.length === 0 && <p>Aucune carte dans la collection.</p>}

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
            `${STORAGE_BASE_URL}/${item.print_code.split('-')[0]}/${item.image_path}`

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
                style={{ width: '100%', marginBottom: 10 }}
              />

              <div style={{ fontWeight: 'bold' }}>
                {item.print_code}
              </div>

              <div>{translation?.name}</div>

              <div style={{ fontSize: 12 }}>
                {item.card?.rarity} • {item.card?.type}
              </div>

              <div style={{ marginTop: 8 }}>
                <button
                  onClick={() => updateQuantity(item.id, -1)}
                  style={{ marginRight: 5 }}
                >
                  ➖
                </button>

                {item.quantity}

                <button
                  onClick={() => updateQuantity(item.id, 1)}
                  style={{ marginLeft: 5 }}
                >
                  ➕
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}