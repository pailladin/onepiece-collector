'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/lib/auth'
import { DEFAULT_LOCALE } from '@/lib/locale'

const STORAGE_BASE_URL =
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/cards-images`

export default function SetPage() {
  const { user } = useAuth()
  const params = useParams()
  const code = Array.isArray(params.code)
    ? params.code[0]
    : params.code

  const [prints, setPrints] = useState<any[]>([])
  const [collectionMap, setCollectionMap] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
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

      const merged = printsData?.map(print => ({
        ...print,
        card: cardsMap.get(print.card_id)
      })) || []

      setPrints(merged)

      // 🔹 Charger collection utilisateur
      if (user) {
        const { data: collectionData } = await supabase
          .from('collections')
          .select('card_print_id, quantity')
          .eq('user_id', user.id)

        const map: Record<string, number> = {}
        collectionData?.forEach(item => {
          map[item.card_print_id] = item.quantity
        })

        setCollectionMap(map)
      }

      setLoading(false)
    }

    if (code) fetchData()
  }, [code, user])

  const addToCollection = async (printId: string) => {
    if (!user) return

    const currentQty = collectionMap[printId] || 0

    if (currentQty === 0) {
      await supabase.from('collections').insert({
        user_id: user.id,
        card_print_id: printId,
        quantity: 1
      })
    } else {
      await supabase
        .from('collections')
        .update({ quantity: currentQty + 1 })
        .eq('user_id', user.id)
        .eq('card_print_id', printId)
    }

    setCollectionMap({
      ...collectionMap,
      [printId]: currentQty + 1
    })
  }

  if (loading) {
    return <div style={{ padding: 40 }}>Chargement...</div>
  }

  return (
    <div style={{ padding: 40 }}>
      <h1 style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 30 }}>
        Set {code}
      </h1>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 20
        }}
      >
        {prints.map((print) => {
          const translation = print.card?.card_translations?.find(
            (t: any) => t.locale === DEFAULT_LOCALE
          )

          const imageUrl =
            `${STORAGE_BASE_URL}/${code}/${print.image_path}`

          const quantity = collectionMap[print.id] || 0

          return (
            <div
              key={print.id}
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
                {print.print_code}
              </div>

              {print.variant_type !== 'normal' && (
                <div style={{ color: '#ff6600', fontSize: 12 }}>
                  {print.variant_type}
                </div>
              )}

              <div>{translation?.name}</div>
              <div style={{ fontSize: 12 }}>
                {print.card?.rarity} • {print.card?.type}
              </div>

              {user && (
                <div style={{ marginTop: 10 }}>
                  <button
                    onClick={() => addToCollection(print.id)}
                    style={{
                      padding: '5px 10px',
                      background: '#0070f3',
                      color: 'white',
                      border: 'none',
                      borderRadius: 4,
                      cursor: 'pointer'
                    }}
                  >
                    ➕ Ajouter
                  </button>

                  {quantity > 0 && (
                    <div style={{ marginTop: 5 }}>
                      Quantité : {quantity}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}