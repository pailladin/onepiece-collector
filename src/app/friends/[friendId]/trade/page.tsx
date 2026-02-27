'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { DEFAULT_LOCALE } from '@/lib/locale'
import { getDisplayPrintCode } from '@/lib/cards/printDisplay'
import { parseCardCode } from '@/lib/sorting/parseCardCode'
import { useAuth } from '@/lib/auth'

type SetRow = {
  id: string
  code: string
}

type CollectionRow = {
  card_print_id: string
  quantity: number
}

type CardTranslationRow = {
  locale: string
  name: string
}

type CardRow = {
  id: string
  rarity: string | null
  type: string | null
  card_translations?: CardTranslationRow[] | null
}

type CardPrintRow = {
  id: string
  card_id: string
  distribution_set_id: string
  print_code: string | null
  variant_type: string | null
}

type TradeItem = {
  id: string
  setCode: string
  displayCode: string
  name: string
  rarity: string
  type: string
  giverQty: number
  needQty: number
}

function sortTradeItems(items: TradeItem[]) {
  return [...items].sort((a, b) => {
    if (a.setCode !== b.setCode) return a.setCode.localeCompare(b.setCode)

    const pa = parseCardCode(a.displayCode)
    const pb = parseCardCode(b.displayCode)
    if (pa.number !== pb.number) return pa.number - pb.number
    if (pa.variant !== pb.variant) return pa.variant - pb.variant
    return a.displayCode.localeCompare(b.displayCode)
  })
}

export default function FriendTradePage() {
  const { user, loading: authLoading } = useAuth()
  const params = useParams()
  const friendId = Array.isArray(params.friendId) ? params.friendId[0] : params.friendId

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [friendUsername, setFriendUsername] = useState('Ami')
  const [friendCanGive, setFriendCanGive] = useState<TradeItem[]>([])
  const [iCanGive, setICanGive] = useState<TradeItem[]>([])

  useEffect(() => {
    const loadTrade = async () => {
      if (!user || !friendId) return
      setLoading(true)
      setError(null)

      const { data: profileData } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', friendId)
        .maybeSingle()
      setFriendUsername(profileData?.username || 'Ami')

      const { data: setsData } = await supabase
        .from('sets')
        .select('id, code')

      const setById = new Map<string, string>(
        ((setsData as SetRow[] | null) || []).map((row) => [row.id, row.code])
      )

      const { data: printsData } = await supabase
        .from('card_prints')
        .select('id, card_id, distribution_set_id, print_code, variant_type')

      const prints = (printsData as CardPrintRow[] | null) || []
      const cardIds = [...new Set(prints.map((row) => row.card_id))]

      const { data: cardsData } = await supabase
        .from('cards')
        .select(
          `
            id,
            rarity,
            type,
            card_translations (
              locale,
              name
            )
          `
        )
        .in('id', cardIds)

      const cardsById = new Map<string, CardRow>(
        ((cardsData as CardRow[] | null) || []).map((row) => [row.id, row])
      )

      const { data: myCollectionData, error: myCollectionError } = await supabase
        .from('collections')
        .select('card_print_id, quantity')
        .eq('user_id', user.id)

      if (myCollectionError) {
        setError(myCollectionError.message)
        setLoading(false)
        return
      }

      const { data: friendCollectionData, error: friendCollectionError } = await supabase
        .from('collections')
        .select('card_print_id, quantity')
        .eq('user_id', friendId)

      if (friendCollectionError) {
        setError(friendCollectionError.message)
        setLoading(false)
        return
      }

      const mineByPrint = new Map<string, number>(
        ((myCollectionData as CollectionRow[] | null) || []).map((row) => [
          row.card_print_id,
          row.quantity || 0
        ])
      )

      const friendByPrint = new Map<string, number>(
        ((friendCollectionData as CollectionRow[] | null) || []).map((row) => [
          row.card_print_id,
          row.quantity || 0
        ])
      )

      const canGiveToMe: TradeItem[] = []
      const canGiveToFriend: TradeItem[] = []

      for (const print of prints) {
        const friendQty = friendByPrint.get(print.id) || 0
        const myQty = mineByPrint.get(print.id) || 0
        const friendExtra = Math.max(friendQty - 1, 0)
        const myExtra = Math.max(myQty - 1, 0)
        const iNeed = myQty === 0 ? 1 : 0
        const friendNeeds = friendQty === 0 ? 1 : 0

        if (friendExtra === 0 && myExtra === 0) continue

        const card = cardsById.get(print.card_id)
        const setCode = setById.get(print.distribution_set_id) || '?'
        const name =
          card?.card_translations?.find((t) => t.locale === DEFAULT_LOCALE)?.name ||
          card?.card_translations?.[0]?.name ||
          'Carte inconnue'

        const baseItem: Omit<TradeItem, 'giverQty' | 'needQty'> = {
          id: print.id,
          setCode,
          displayCode: getDisplayPrintCode(print),
          name,
          rarity: card?.rarity || '-',
          type: card?.type || '-'
        }

        if (friendExtra > 0 && iNeed > 0) {
          canGiveToMe.push({
            ...baseItem,
            giverQty: friendExtra,
            needQty: iNeed
          })
        }

        if (myExtra > 0 && friendNeeds > 0) {
          canGiveToFriend.push({
            ...baseItem,
            giverQty: myExtra,
            needQty: friendNeeds
          })
        }
      }

      setFriendCanGive(sortTradeItems(canGiveToMe))
      setICanGive(sortTradeItems(canGiveToFriend))
      setLoading(false)
    }

    loadTrade()
  }, [user, friendId])

  const totalPotential = useMemo(
    () => friendCanGive.length + iCanGive.length,
    [friendCanGive.length, iCanGive.length]
  )

  if (authLoading || loading) {
    return <div style={{ padding: 40 }}>Chargement...</div>
  }

  if (!user) {
    return <div style={{ padding: 40 }}>Connecte-toi pour voir les echanges.</div>
  }

  if (!friendId) {
    return <div style={{ padding: 40 }}>Ami introuvable.</div>
  }

  const renderList = (items: TradeItem[], emptyText: string) => {
    if (items.length === 0) return <div>{emptyText}</div>
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        {items.map((item) => (
          <div
            key={item.id}
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              padding: '10px 12px',
              display: 'grid',
              gridTemplateColumns: '120px 1fr auto',
              gap: 12,
              alignItems: 'center'
            }}
          >
            <div style={{ fontWeight: 700 }}>{item.displayCode}</div>
            <div>
              <div>{item.name}</div>
              <div style={{ fontSize: 12, color: '#475569' }}>
                {item.setCode} | {item.rarity} | {item.type}
              </div>
            </div>
            <div style={{ fontSize: 12, color: '#0f172a', fontWeight: 700 }}>
              x{item.giverQty} en double
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={{ padding: 40, display: 'grid', gap: 22 }}>
      <div style={{ display: 'grid', gap: 8 }}>
        <Link href={`/friends/${friendId}`}>Retour aux collections de cet ami</Link>
        <h1 style={{ margin: 0 }}>Echanges avec {friendUsername}</h1>
        <div style={{ color: '#334155' }}>
          {totalPotential} cartes potentiellement echangeables.
        </div>
      </div>

      {error && (
        <div style={{ color: '#b91c1c', fontWeight: 600 }}>
          {error}
        </div>
      )}

      <section style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>
          {friendUsername} peut me donner (ses doubles que je n&apos;ai pas)
        </h2>
        {renderList(friendCanGive, 'Aucune carte trouvee dans ce sens.')}
      </section>

      <section style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>
          Je peux donner a {friendUsername} (mes doubles qu&apos;il n&apos;a pas)
        </h2>
        {renderList(iCanGive, 'Aucune carte trouvee dans ce sens.')}
      </section>
    </div>
  )
}
