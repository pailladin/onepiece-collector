'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { DEFAULT_LOCALE } from '@/lib/locale'

const STORAGE_BASE_URL =
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/cards-images`

export default function SetPage() {
  const params = useParams()
  const code = Array.isArray(params.code)
    ? params.code[0]
    : params.code

  const [prints, setPrints] = useState<any[]>([])
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
        setPrints([])
        setLoading(false)
        return
      }

      const { data: printsData } = await supabase
        .from('card_prints')
        .select('*')
        .eq('distribution_set_id', setData.id)

      if (!printsData) {
        setPrints([])
        setLoading(false)
        return
      }

      const { data: cardsData } = await supabase
        .from('cards')
        .select(`
          id,
          number,
          rarity,
          type,
          card_translations (
            name,
            locale
          )
        `)

      if (!cardsData) {
        setPrints([])
        setLoading(false)
        return
      }

      const cardsMap = new Map(
        cardsData.map(c => [c.id, c])
      )

      const merged = printsData.map(print => ({
        ...print,
        card: cardsMap.get(print.card_id)
      }))

      setPrints(merged)
      setLoading(false)
    }

    if (code) fetchData()
  }, [code])

  if (loading) {
    return <div style={{ padding: 40 }}>Chargement...</div>
  }

  return (
    <div style={{ padding: 40 }}>
      <h1 style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 30 }}>
        Set {code}
      </h1>

      {prints.length === 0 && (
        <p>Aucune carte trouvée.</p>
      )}

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
                style={{
                  width: '100%',
                  height: 'auto',
                  marginBottom: 10
                }}
              />

              <div style={{ fontWeight: 'bold' }}>
                {print.print_code}
              </div>

              {print.variant_type !== 'normal' && (
                <div style={{ color: '#ff6600', fontSize: 12 }}>
                  {print.variant_type}
                </div>
              )}

              <div style={{ marginTop: 5 }}>
                {translation?.name}
              </div>

              <div style={{ fontSize: 12, color: '#555' }}>
                {print.card?.rarity} • {print.card?.type}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}