'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/lib/auth'
import { DEFAULT_LOCALE } from '@/lib/locale'
import { getDisplayPrintCode } from '@/lib/cards/printDisplay'
import { parseCardCode } from '@/lib/sorting/parseCardCode'
import {
  filterCardPrints,
  getFilterOptions,
  getAltTypeKey,
  getAltTypeLabel,
  isAltVersion,
  type AltFilter
} from '@/lib/filtering/filterCardPrints'

const STORAGE_BASE_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/cards-images`
const MISSING_IMAGE_PATH = '__missing__'
const CARD_PLACEHOLDER_IMAGE =
  "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 360 500'%3E%3Crect width='360' height='500' fill='%23e2e8f0'/%3E%3Crect x='16' y='16' width='328' height='468' rx='16' fill='%23f8fafc' stroke='%23cbd5e1' stroke-width='2'/%3E%3Ctext x='180' y='235' text-anchor='middle' font-family='Arial' font-size='24' fill='%23475569'%3EPhoto a venir%3C/text%3E%3C/svg%3E"

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
  parallel: 1,
  Parallel: 1,
  foil: 1,
  Foil: 1,
  aa: 1,
  AA: 1,
  sp: 2,
  SP: 2,
  manga: 3,
  Manga: 3,
  'wanted poster': 3,
  'Wanted Poster': 3,
  tr: 4,
  TR: 4,
  'treasure rare': 4,
  'Treasure Rare': 4
}

const ALT_RARITY_THEME: Record<string, { background: string; border: string }> = {
  C: { background: 'linear-gradient(145deg, #f2f4f7, #e5e7eb)', border: '#9ca3af' },
  UC: { background: 'linear-gradient(145deg, #eafff4, #bbf7d0)', border: '#22c55e' },
  R: { background: 'linear-gradient(145deg, #ecf5ff, #bfdbfe)', border: '#3b82f6' },
  SR: { background: 'linear-gradient(145deg, #fff7e8, #fed7aa)', border: '#f97316' },
  SEC: { background: 'linear-gradient(145deg, #fff0f5, #fbcfe8)', border: '#ec4899' },
  L: { background: 'linear-gradient(145deg, #fff9db, #fde68a)', border: '#eab308' }
}

export default function CatalogueSetPage() {
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
  const [altTypeFilter, setAltTypeFilter] = useState('all')
  const normalizedSetCode = (code || '').toString().replace('-', '').toUpperCase()

  const isSetScopedFallbackPrint = (printCode: string | null | undefined) => {
    const raw = (printCode || '').toString().trim().toUpperCase()
    if (!raw || !normalizedSetCode) return false
    return raw.includes(`_${normalizedSetCode}`)
  }

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

        ownedMap = new Map(collectionData?.map((c) => [c.card_print_id, c.quantity]))
      }

      const cardsMap = new Map(cardsData?.map((c) => [c.id, c]))

      const merged = printsData.map((print) => ({
        ...print,
        card: cardsMap.get(print.card_id),
        quantity: ownedMap.get(print.id) || 0
      }))

      const dedupedByVisualKey = new Map<string, any>()
      for (const item of merged) {
        const baseCode = String(item.print_code || '')
          .trim()
          .toUpperCase()
          .split('_')[0]
        const variant = String(item.variant_type || 'normal').trim().toUpperCase()
        const imageKey = String(item.image_path || MISSING_IMAGE_PATH)
          .trim()
          .toUpperCase()
        const visualKey = `${baseCode}::${variant}::${imageKey}`
        const existing = dedupedByVisualKey.get(visualKey)

        if (!existing) {
          dedupedByVisualKey.set(visualKey, item)
          continue
        }

        const existingFallback = isSetScopedFallbackPrint(existing.print_code)
        const currentFallback = isSetScopedFallbackPrint(item.print_code)
        const existingMissingImage =
          !existing.image_path || existing.image_path === MISSING_IMAGE_PATH
        const currentMissingImage = !item.image_path || item.image_path === MISSING_IMAGE_PATH
        const shouldReplace =
          (existingFallback && !currentFallback) ||
          (existingMissingImage && !currentMissingImage) ||
          Number(item.quantity || 0) > Number(existing.quantity || 0)

        if (shouldReplace) {
          dedupedByVisualKey.set(visualKey, item)
        }
      }

      setItems([...dedupedByVisualKey.values()])
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
        alt: altFilter,
        altType: altTypeFilter
      }),
    [items, searchQuery, rarityFilter, typeFilter, altFilter, altTypeFilter]
  )

  const sortedItems = useMemo(() => {
    const multiplier = sortDirection === 'asc' ? 1 : -1

    return [...filteredItems].sort((a, b) => {
      const nameA =
        a.card?.card_translations?.find((t: any) => t.locale === DEFAULT_LOCALE)?.name || ''
      const nameB =
        b.card?.card_translations?.find((t: any) => t.locale === DEFAULT_LOCALE)?.name || ''

      switch (sortKey) {
        case 'number': {
          const parsedA = parseCardCode(a.print_code || `${code}-0`)
          const parsedB = parseCardCode(b.print_code || `${code}-0`)

          if (parsedA.set !== parsedB.set) {
            return parsedA.set.localeCompare(parsedB.set) * multiplier
          }

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
          return (a.card?.type || '').localeCompare(b.card?.type || '') * multiplier

        default:
          return 0
      }
    })
  }, [filteredItems, sortKey, sortDirection, code])

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
      items.map((i) => (i.id === printId ? { ...i, quantity: Math.max(newQty, 0) } : i))
    )
  }

  const resetFilters = () => {
    setSearchQuery('')
    setRarityFilter('all')
    setTypeFilter('all')
    setAltFilter('all')
    setAltTypeFilter('all')
    setSortKey('number')
    setSortDirection('asc')
  }

  if (loading) {
    return <div style={{ padding: 40 }}>Chargement...</div>
  }

  const totalCount = items.length

  return (
    <div
      style={{
        padding: '18px 28px 28px',
        background:
          'radial-gradient(circle at 10% 20%, #f0f9ff 0%, #eef2ff 35%, #fff7ed 100%)',
        minHeight: '100vh'
      }}
    >
      <h1
        style={{
          fontSize: 30,
          fontWeight: 'bold',
          marginBottom: 14,
          color: '#111827'
        }}
      >
        Catalogue - {code}
      </h1>

      <div
        style={{
          marginBottom: 20,
          display: 'grid',
          gridTemplateColumns: 'minmax(300px, 1.6fr) minmax(180px, 0.65fr) minmax(220px, 0.9fr)',
          gap: 12
        }}
      >
        <div
          style={{
            border: '1px solid #d1d5db',
            borderRadius: 12,
            padding: 12,
            background: '#ffffffd1'
          }}
        >
          <div style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>
            Recherche et filtres
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Recherche nom, code ou variante"
              style={{
                width: '100%',
                maxWidth: '100%',
                boxSizing: 'border-box',
                padding: '9px 10px',
                borderRadius: 8,
                border: '1px solid #cbd5e1'
              }}
            />

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select value={rarityFilter} onChange={(e) => setRarityFilter(e.target.value)}>
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
                onChange={(e) => {
                  const value = e.target.value as AltFilter
                  setAltFilter(value)
                  if (value === 'normal') setAltTypeFilter('all')
                }}
              >
                <option value="all">Toutes versions</option>
                <option value="normal">Normales</option>
                <option value="alt">Alternatives</option>
              </select>

              <select
                value={altTypeFilter}
                onChange={(e) => setAltTypeFilter(e.target.value)}
                disabled={altFilter === 'normal'}
              >
                <option value="all">Tous types alternatives</option>
                {filterOptions.altTypes.map((altType) => (
                  <option key={altType} value={altType}>
                    {getAltTypeLabel(altType)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div
          style={{
            border: '1px solid #d1d5db',
            borderRadius: 12,
            padding: 12,
            background: '#ffffffd1'
          }}
        >
          <div style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>Tri</div>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
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
            </div>
            <div style={{ fontSize: 12, color: '#334155' }}>
              Resultats filtres: {sortedItems.length} / {totalCount}
            </div>
          </div>
        </div>

        <div
          style={{
            border: '1px solid #d1d5db',
            borderRadius: 12,
            padding: 12,
            background: '#ffffffd1'
          }}
        >
          <div style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>Actions</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              onClick={resetFilters}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                cursor: 'pointer'
              }}
            >
              Reinitialiser filtres
            </button>
          </div>
        </div>
      </div>

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
          const hasImagePath = Boolean(item.image_path) && item.image_path !== MISSING_IMAGE_PATH
          const imageUrl = hasImagePath
            ? `${STORAGE_BASE_URL}/${code}/${item.image_path}`
            : CARD_PLACEHOLDER_IMAGE
          const isAlt = isAltVersion(item)
          const altType = getAltTypeKey(item)
          const isFoil = altType === 'foil'
          const altBadgeLabel = altType === 'foil' ? 'FOIL' : 'ALT'
          const rarityTheme = ALT_RARITY_THEME[item.card?.rarity] || {
            background: 'linear-gradient(145deg, #f3f4f6, #e5e7eb)',
            border: '#9ca3af'
          }

          return (
            <div
              key={item.id}
              style={{
                border: `2px solid ${
                  isFoil ? '#f5c84c' : isAlt ? rarityTheme.border : '#d1d5db'
                }`,
                borderRadius: 12,
                padding: 10,
                background: isAlt
                  ? rarityTheme.background
                  : 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
                textAlign: 'center',
                position: 'relative',
                boxShadow: isFoil
                  ? '0 0 0 1px rgba(255,245,204,0.7) inset, 0 0 18px -6px rgba(251,191,36,0.95), 0 8px 24px -18px #374151'
                  : isAlt
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
                  {altBadgeLabel}
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
                onError={(e) => {
                  e.currentTarget.src = CARD_PLACEHOLDER_IMAGE
                }}
                onClick={() => {
                  if (hasImagePath) setSelectedImage(imageUrl)
                }}
              />

              <div style={{ fontWeight: 'bold' }}>{getDisplayPrintCode(item)}</div>
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
            alt="Apercu carte"
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
