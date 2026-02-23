'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/lib/auth'
import { DEFAULT_LOCALE } from '@/lib/locale'

const STORAGE_BASE_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/cards-images`

export default function CollectionSetPage() {
  const { user } = useAuth()
  const params = useParams()
  const code = Array.isArray(params.code) ? params.code[0] : params.code

  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('ALL')

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return

      setLoading(true)

      const { data: setData } = await supabase
        .from('sets')
        .select('id')
        .eq('code', code)
        .single()

      if (!setData) {
        setLoading(false)
        return
      }

      const { data: printsData } = await supabase
        .from('card_prints')
        .select('*')
        .eq('distribution_set_id', setData.id)

      const { data: cardsData } = await supabase.from('cards').select(`
          id,
          number,
          rarity,
          type,
          card_translations (
            name,
            locale
          )
        `)

      const { data: collectionData } = await supabase
        .from('collections')
        .select('*')
        .eq('user_id', user.id)

      const ownedMap = new Map(
        collectionData?.map((c) => [c.card_print_id, c.quantity])
      )

      const cardsMap = new Map(cardsData?.map((c) => [c.id, c]))

      const merged =
        printsData?.map((print) => ({
          ...print,
          card: cardsMap.get(print.card_id),
          quantity: ownedMap.get(print.id) || 0
        })) || []

      setItems(merged)
      setLoading(false)
    }

    fetchData()
  }, [user, code])

  // 🔹 TRI SANS INDEX DYNAMIQUE
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

  const filteredItems = useMemo(() => {
    if (filter === 'ALL') return sortedItems
    return sortedItems.filter((i) => i.variant_type === filter)
  }, [sortedItems, filter])

  const owned = filteredItems.filter((i) => i.quantity > 0)
  const missing = filteredItems.filter((i) => i.quantity === 0)

  const updateQuantity = async (printId: string, delta: number) => {
    const current = items.find((i) => i.id === printId)
    if (!current) return

    const newQty = current.quantity + delta

    if (newQty <= 0) {
      await supabase
        .from('collections')
        .delete()
        .eq('user_id', user?.id)
        .eq('card_print_id', printId)
    } else if (current.quantity === 0) {
      await supabase.from('collections').insert({
        user_id: user?.id,
        card_print_id: printId,
        quantity: 1
      })
    } else {
      await supabase
        .from('collections')
        .update({ quantity: newQty })
        .eq('user_id', user?.id)
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

  const Grid = ({ data }: { data: any[] }) => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 20
      }}
    >
      {data.map((item) => {
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
              style={{ width: '100%', marginBottom: 10 }}
            />

            <div style={{ fontWeight: 'bold' }}>{item.print_code}</div>

            <div>{translation?.name}</div>

            <div style={{ fontSize: 12 }}>
              {item.card?.rarity} • {item.card?.type}
            </div>

            <div style={{ marginTop: 8 }}>
              <button onClick={() => updateQuantity(item.id, -1)}>➖</button>

              <span style={{ margin: '0 8px' }}>{item.quantity}</span>

              <button onClick={() => updateQuantity(item.id, 1)}>➕</button>
            </div>
          </div>
        )
      })}
    </div>
  )

  return (
    <div style={{ padding: 40 }}>
      <h1 style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 20 }}>
        Collection - {code}
      </h1>

      <div style={{ marginBottom: 20 }}>
        {['ALL', 'normal', 'AA', 'SP', 'TR'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              marginRight: 10,
              background: filter === f ? '#0070f3' : '#eee',
              color: filter === f ? '#fff' : '#000',
              padding: '5px 10px',
              borderRadius: 4,
              border: 'none'
            }}
          >
            {f}
          </button>
        ))}
      </div>

      <h2>Cartes possédées</h2>
      <Grid data={owned} />

      <h2 style={{ marginTop: 40 }}>Cartes manquantes</h2>
      <Grid data={missing} />
    </div>
  )
}
