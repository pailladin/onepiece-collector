'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/lib/auth'
import { DEFAULT_LOCALE } from '@/lib/locale'

const STORAGE_BASE_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/cards-images`

export default function CatalogueSetPage() {
  const { user } = useAuth()
  const params = useParams()
  const code = Array.isArray(params.code) ? params.code[0] : params.code

  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)

      const { data: setData } = await supabase
        .from('sets')
        .select('id')
        .eq('code', code)
        .single()

      if (!setData) {
        setItems([])
        setLoading(false)
        return
      }

      const { data: printsData } = await supabase
        .from('card_prints')
        .select('*')
        .eq('distribution_set_id', setData.id)

      if (!printsData || printsData.length === 0) {
        setItems([])
        setLoading(false)
        return
      }

      const cardIds = printsData.map((p) => p.card_id)

      const { data: cardsData } = await supabase
        .from('cards')
        .select(
          `
          id,
          number,
          rarity,
          type,
          card_translations (
            name,
            locale
          )
        `
        )
        .in('id', cardIds)

      let ownedMap = new Map<string, number>()

      if (user) {
        const { data: collectionData } = await supabase
          .from('collections')
          .select('*')
          .eq('user_id', user.id)

        ownedMap = new Map(
          collectionData?.map((c) => [c.card_print_id, c.quantity])
        )
      }

      const cardsMap = new Map(cardsData?.map((c) => [c.id, c]))

      const merged = printsData.map((print) => ({
        ...print,
        card: cardsMap.get(print.card_id),
        quantity: ownedMap.get(print.id) || 0
      }))

      setItems(merged)
      setLoading(false)
    }

    fetchData()
  }, [code, user])

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const numA = parseInt(a.card?.number || '0')
      const numB = parseInt(b.card?.number || '0')

      if (numA !== numB) return numA - numB

      const getOrder = (variant: string) => {
        if (variant === 'normal') return 0
        if (variant === 'AA') return 1
        if (variant === 'SP') return 2
        if (variant === 'TR') return 3
        return 99
      }

      return getOrder(a.variant_type) - getOrder(b.variant_type)
    })
  }, [items])

  const updateQuantity = async (printId: string, delta: number) => {
    if (!user) return

    const current = items.find((i) => i.id === printId)
    if (!current) return

    const newQty = current.quantity + delta

    if (newQty <= 0) {
      await supabase
        .from('collections')
        .delete()
        .eq('user_id', user.id)
        .eq('card_print_id', printId)
    } else if (current.quantity === 0) {
      await supabase.from('collections').insert({
        user_id: user.id,
        card_print_id: printId,
        quantity: 1
      })
    } else {
      await supabase
        .from('collections')
        .update({ quantity: newQty })
        .eq('user_id', user.id)
        .eq('card_print_id', printId)
    }

    setItems(
      items.map((i) =>
        i.id === printId ? { ...i, quantity: Math.max(newQty, 0) } : i
      )
    )
  }

  if (loading) {
    return <div style={{ padding: 40 }}>Chargement...</div>
  }

  return (
    <div style={{ padding: 40 }}>
      <h1 style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 30 }}>
        Catalogue - {code}
      </h1>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 20
        }}
      >
        {sortedItems.map((item) => {
          const translation = item.card?.card_translations?.find(
            (t: any) => t.locale === DEFAULT_LOCALE
          )

          const imageUrl = `${STORAGE_BASE_URL}/${code}/${item.image_path}`

          return (
            <div
              key={item.id}
              style={{
                border: '1px solid #ddd',
                borderRadius: 8,
                padding: 10,
                background: '#fff',
                textAlign: 'center'
              }}
            >
              <img
                src={imageUrl}
                alt={translation?.name}
                style={{
                  width: '100%',
                  marginBottom: 10,
                  cursor: 'pointer'
                }}
                onClick={() => setSelectedImage(imageUrl)}
              />

              <div style={{ fontWeight: 'bold' }}>{item.print_code}</div>

              <div>{translation?.name}</div>

              <div style={{ fontSize: 12 }}>
                {item.card?.rarity} • {item.card?.type}
              </div>

              {user && (
                <div style={{ marginTop: 10 }}>
                  <button onClick={() => updateQuantity(item.id, -1)}>
                    ➖
                  </button>

                  <span style={{ margin: '0 8px' }}>{item.quantity}</span>

                  <button onClick={() => updateQuantity(item.id, 1)}>➕</button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {selectedImage && (
        <div
          onClick={() => setSelectedImage(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000
          }}
        >
          <img
            src={selectedImage}
            style={{
              maxHeight: '90%',
              maxWidth: '90%',
              borderRadius: 8
            }}
          />
        </div>
      )}
    </div>
  )
}
