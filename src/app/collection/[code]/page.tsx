'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/lib/auth'
import { DEFAULT_LOCALE } from '@/lib/locale'
import { parseCardCode } from '@/lib/sorting/parseCardCode'
import {
  filterCardPrints,
  getFilterOptions,
  isAltVersion,
  type AltFilter
} from '@/lib/filtering/filterCardPrints'

const STORAGE_BASE_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/cards-images`

type SortKey = 'number' | 'name' | 'rarity' | 'type'
type SortDirection = 'asc' | 'desc'

const RARITY_PRIORITY: Record<string, number> = {
  C: 1,
  UC: 2,
  R: 3,
  SR: 4,
  SEC: 5,
  L: 6
}

const VARIANT_PRIORITY: Record<string, number> = {
  normal: 0,
  AA: 1,
  SP: 2,
  TR: 3
}

const ALT_RARITY_THEME: Record<string, { background: string; border: string }> = {
  C: { background: 'linear-gradient(145deg, #f2f4f7, #e5e7eb)', border: '#9ca3af' },
  UC: { background: 'linear-gradient(145deg, #eafff4, #bbf7d0)', border: '#22c55e' },
  R: { background: 'linear-gradient(145deg, #ecf5ff, #bfdbfe)', border: '#3b82f6' },
  SR: { background: 'linear-gradient(145deg, #fff7e8, #fed7aa)', border: '#f97316' },
  SEC: { background: 'linear-gradient(145deg, #fff0f5, #fbcfe8)', border: '#ec4899' },
  L: { background: 'linear-gradient(145deg, #fff9db, #fde68a)', border: '#eab308' }
}

export default function CollectionSetPage() {
  const { user } = useAuth()
  const params = useParams()
  const code = Array.isArray(params.code) ? params.code[0] : params.code

  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)

  const [sortKey, setSortKey] = useState<SortKey>('number')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [searchQuery, setSearchQuery] = useState('')
  const [rarityFilter, setRarityFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [altFilter, setAltFilter] = useState<AltFilter>('all')
  const [showOwned, setShowOwned] = useState(true)
  const [showMissing, setShowMissing] = useState(true)

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

  const filterOptions = useMemo(() => getFilterOptions(items), [items])

  const filteredItems = useMemo(
    () =>
      filterCardPrints(items, {
        query: searchQuery,
        rarity: rarityFilter,
        type: typeFilter,
        alt: altFilter
      }),
    [items, searchQuery, rarityFilter, typeFilter, altFilter]
  )

  const sortedItems = useMemo(() => {
    const multiplier = sortDirection === 'asc' ? 1 : -1

    return [...filteredItems].sort((a, b) => {
      const nameA =
        a.card?.card_translations?.find((t: any) => t.locale === DEFAULT_LOCALE)
          ?.name || ''
      const nameB =
        b.card?.card_translations?.find((t: any) => t.locale === DEFAULT_LOCALE)
          ?.name || ''

      switch (sortKey) {
        case 'number': {
          const parsedA = parseCardCode(a.print_code || `${code}-0`)
          const parsedB = parseCardCode(b.print_code || `${code}-0`)

          if (parsedA.number !== parsedB.number) {
            return (parsedA.number - parsedB.number) * multiplier
          }

          if (parsedA.variant !== parsedB.variant) {
            return (parsedA.variant - parsedB.variant) * multiplier
          }

          const varA = VARIANT_PRIORITY[a.variant_type] ?? 99
          const varB = VARIANT_PRIORITY[b.variant_type] ?? 99
          return (varA - varB) * multiplier
        }

        case 'name':
          return nameA.localeCompare(nameB) * multiplier

        case 'rarity': {
          const rA = RARITY_PRIORITY[a.card?.rarity] ?? 99
          const rB = RARITY_PRIORITY[b.card?.rarity] ?? 99
          return (rA - rB) * multiplier
        }

        case 'type':
          return (
            (a.card?.type || '').localeCompare(b.card?.type || '') * multiplier
          )

        default:
          return 0
      }
    })
  }, [filteredItems, sortKey, sortDirection, code])

  const ownedItems = useMemo(
    () => sortedItems.filter((item) => (item.quantity || 0) > 0),
    [sortedItems]
  )

  const missingItems = useMemo(
    () => sortedItems.filter((item) => (item.quantity || 0) === 0),
    [sortedItems]
  )

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

  const renderGrid = (data: any[]) => (
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
        const isAlt = isAltVersion(item)
        const rarityTheme = ALT_RARITY_THEME[item.card?.rarity] || {
          background: 'linear-gradient(145deg, #f3f4f6, #e5e7eb)',
          border: '#9ca3af'
        }

        return (
          <div
            key={item.id}
            style={{
              border: `2px solid ${isAlt ? rarityTheme.border : '#d1d5db'}`,
              borderRadius: 12,
              padding: 10,
              background: isAlt
                ? rarityTheme.background
                : 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
              textAlign: 'center',
              position: 'relative',
              boxShadow: isAlt
                ? `0 10px 24px -14px ${rarityTheme.border}`
                : '0 8px 20px -18px #374151'
            }}
          >
            {isAlt && (
              <div
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  background: '#111827',
                  color: '#fff',
                  borderRadius: 999,
                  padding: '3px 8px'
                }}
              >
                ALT
              </div>
            )}

            <img
              src={imageUrl}
              alt={translation?.name}
              style={{
                width: '100%',
                marginBottom: 10,
                cursor: 'pointer',
                borderRadius: 8
              }}
              onClick={() => setSelectedImage(imageUrl)}
            />

            <div style={{ fontWeight: 'bold' }}>{item.print_code}</div>
            <div>{translation?.name}</div>

            <div style={{ fontSize: 12 }}>
              <strong>{item.card?.rarity}</strong> - {item.card?.type}
            </div>

            {user && (
              <div style={{ marginTop: 10 }}>
                <button onClick={() => updateQuantity(item.id, -1)}>-</button>
                <span style={{ margin: '0 8px' }}>{item.quantity}</span>
                <button onClick={() => updateQuantity(item.id, 1)}>+</button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  return (
    <div
      style={{
        padding: 40,
        background:
          'radial-gradient(circle at 10% 20%, #f0f9ff 0%, #eef2ff 35%, #fff7ed 100%)',
        minHeight: '100vh'
      }}
    >
      <h1
        style={{
          fontSize: 24,
          fontWeight: 'bold',
          marginBottom: 20,
          color: '#111827'
        }}
      >
        Collection - {code}
      </h1>

      <div
        style={{
          marginBottom: 20,
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center'
        }}
      >
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Recherche nom ou code"
          style={{
            minWidth: 220,
            padding: '8px 10px',
            borderRadius: 8,
            border: '1px solid #cbd5e1'
          }}
        />

        <select
          value={rarityFilter}
          onChange={(e) => setRarityFilter(e.target.value)}
        >
          <option value="all">Toutes raretes</option>
          {filterOptions.rarities.map((rarity) => (
            <option key={rarity} value={rarity}>
              {rarity}
            </option>
          ))}
        </select>

        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">Tous types</option>
          {filterOptions.types.map((cardType) => (
            <option key={cardType} value={cardType}>
              {cardType}
            </option>
          ))}
        </select>

        <select
          value={altFilter}
          onChange={(e) => setAltFilter(e.target.value as AltFilter)}
        >
          <option value="all">Toutes versions</option>
          <option value="normal">Normales</option>
          <option value="alt">Alternatives</option>
        </select>

        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
        >
          <option value="number">Numero</option>
          <option value="name">Nom</option>
          <option value="rarity">Rarete</option>
          <option value="type">Type</option>
        </select>

        <select
          value={sortDirection}
          onChange={(e) => setSortDirection(e.target.value as SortDirection)}
        >
          <option value="asc">Ascendant</option>
          <option value="desc">Descendant</option>
        </select>

        <div style={{ fontSize: 12, color: '#334155' }}>
          {sortedItems.length} / {items.length}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <button
          onClick={() => setShowOwned((prev) => !prev)}
          style={{
            width: '100%',
            textAlign: 'left',
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid #cbd5e1',
            background: '#ffffff',
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          {showOwned ? '▼' : '▶'} Cartes possedees ({ownedItems.length})
        </button>
        {showOwned && <div style={{ marginTop: 12 }}>{renderGrid(ownedItems)}</div>}
      </div>

      <div>
        <button
          onClick={() => setShowMissing((prev) => !prev)}
          style={{
            width: '100%',
            textAlign: 'left',
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid #cbd5e1',
            background: '#ffffff',
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          {showMissing ? '▼' : '▶'} Cartes non possedees ({missingItems.length})
        </button>
        {showMissing && (
          <div style={{ marginTop: 12 }}>{renderGrid(missingItems)}</div>
        )}
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
