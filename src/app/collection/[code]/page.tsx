'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/lib/auth'
import { DEFAULT_LOCALE } from '@/lib/locale'

const STORAGE_BASE_URL =
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/cards-images`

export default function CollectionSetPage() {
  const { code } = useParams()
  const { user, loading } = useAuth()

  const [prints, setPrints] = useState<any[]>([])
  const [loadingData, setLoadingData] = useState(true)

  useEffect(() => {
    if (!user || !code) return

    const fetchCollection = async () => {
      const { data } = await supabase
        .from('collections')
        .select(`
          quantity,
          card_prints!inner (
            id,
            print_code,
            variant_type,
            image_path,
            distribution_set_id,
            cards (
              rarity,
              type,
              card_translations (
                name,
                locale
              )
            ),
            sets!card_prints_distribution_set_id_fkey (
              code
            )
          )
        `)
        .eq('user_id', user.id)
        .eq('card_prints.sets.code', code)

      setPrints(data || [])
      setLoadingData(false)
    }

    fetchCollection()
  }, [user, code])

  if (loading || loadingData)
    return <div style={{ padding: 40 }}>Chargement...</div>

  if (!user)
    return <div style={{ padding: 40 }}>Non connecté</div>

  return (
    <div style={{ padding: 40 }}>
      <h1 style={{ fontSize: 24, fontWeight: 'bold' }}>
        Ma Collection - {code}
      </h1>

      {prints.map((entry, index) => {
        const print = entry.card_prints
        const card = print.cards

        const translation = card.card_translations.find(
          (t: any) => t.locale === DEFAULT_LOCALE
        )

        const imageUrl =
          `${STORAGE_BASE_URL}/${code}/${print.image_path}`

        return (
          <div
            key={index}
            style={{
              border: '1px solid #ccc',
              padding: 15,
              marginTop: 15,
              display: 'flex',
              gap: 20,
              alignItems: 'center',
            }}
          >
            <img
              src={imageUrl}
              alt={translation?.name}
              style={{ width: 120 }}
            />

            <div>
              <strong>{print.print_code}</strong>

              {print.variant_type !== 'normal' && (
                <div style={{ color: 'orange' }}>
                  Variante : {print.variant_type}
                </div>
              )}

              <div>{translation?.name}</div>
              <div>Rareté : {card.rarity}</div>
              <div>Type : {card.type}</div>
              <div>Quantité : {entry.quantity}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}