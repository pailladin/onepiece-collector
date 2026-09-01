'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/lib/auth'
import { DEFAULT_LOCALE } from '@/lib/locale'
import {
  getDisplayPrintCode,
  getPrintVariantTypeBadgeLabel,
  getPrintVariantTypeBorderColor
} from '@/lib/cards/printDisplay'
import { compareCardPrintNumberSort } from '@/lib/sorting/compareCardPrints'
import {
  filterCardPrints,
  getFilterOptions,
  getAltTypeKey,
  getAltTypeLabel,
  isAltVersion,
  type AltFilter
} from '@/lib/filtering/filterCardPrints'
import {
  aggregateCollectionRows,
  fetchUserCollectionRowsForPrintIds
} from '@/lib/collections/quantities'
import {
  COLLECTION_LANGUAGE_OPTIONS,
  UNKNOWN_LANGUAGE,
  normalizeCollectionLanguage,
  resolveAvailableLanguages,
  resolveSetLanguages
} from '@/lib/collections/languages'
import { WishlistHeartButton } from '@/components/WishlistHeartButton'
import { useWishlist } from '@/lib/useWishlist'

const STORAGE_BASE_URL = (process.env.NEXT_PUBLIC_IMAGES_BASE_URL || `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/cards-images`).replace(/\/$/, '')
const MISSING_IMAGE_PATH = '__missing__'
const CARD_PLACEHOLDER_IMAGE =
  "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 360 500'%3E%3Crect width='360' height='500' fill='%23e2e8f0'/%3E%3Crect x='16' y='16' width='328' height='468' rx='16' fill='%23f8fafc' stroke='%23cbd5e1' stroke-width='2'/%3E%3Ctext x='180' y='235' text-anchor='middle' font-family='Arial' font-size='24' fill='%23475569'%3EPhoto a venir%3C/text%3E%3C/svg%3E"

type SortKey = 'number' | 'name' | 'rarity' | 'type'
type SortDirection = 'asc' | 'desc'

type CardTranslation = {
  locale: string
  name: string
}

type CatalogueCard = {
  rarity: string | null
  type: string | null
  card_translations?: CardTranslation[] | null
}

type CatalogueItem = {
  id: string
  print_code: string | null
  variant_type: string | null
  image_path: string | null
  available_languages?: string[] | null
  card: CatalogueCard | null
  quantity: number
  languageBreakdown: Map<string, number>
}

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

function isSetScopedFallbackPrint(printCode: string | null | undefined, setCode: string) {
  const raw = (printCode || '').toString().trim().toUpperCase()
  if (!raw || !setCode) return false
  return raw.includes(`_${setCode}`)
}

export function CatalogueSetPageClient() {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const { isWishlisted, toggleWishlist, busyPrintId } = useWishlist(userId)
  const params = useParams()
  const searchParams = useSearchParams()
  const code = Array.isArray(params.code) ? params.code[0] : params.code
  const normalizedCode = (code || '').toString().replace('-', '').toUpperCase()
  const initialQuery = searchParams.get('q') || ''

  const [items, setItems] = useState<CatalogueItem[]>([])
  const [setLanguages, setSetLanguages] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [collectionMutationError, setCollectionMutationError] = useState<string | null>(null)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [isCompactView, setIsCompactView] = useState(false)

  const [sortKey, setSortKey] = useState<SortKey>('number')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [searchQuery, setSearchQuery] = useState(initialQuery)
  const [rarityFilter, setRarityFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [altFilter, setAltFilter] = useState<AltFilter>('all')
  const [altTypeFilter, setAltTypeFilter] = useState('all')
  const normalizedSetCode = normalizedCode

  useEffect(() => {
    setSearchQuery(initialQuery)
  }, [initialQuery])

  useEffect(() => {
    const syncCompactView = () => {
      if (typeof window === 'undefined') return
      setIsCompactView(window.innerWidth <= 1024)
    }

    syncCompactView()
    window.addEventListener('resize', syncCompactView)
    return () => window.removeEventListener('resize', syncCompactView)
  }, [])

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError(null)

      const res = await fetch(`/api/catalogue/${normalizedCode}`)
      const payload = await res.json().catch(() => ({}))

      if (!res.ok) {
        setItems([])
        setSetLanguages([])
        setError(payload?.error || 'Erreur chargement catalogue')
        setLoading(false)
        return
      }

      setSetLanguages(resolveSetLanguages(payload?.set?.availableLanguages))

      const baseItems = (Array.isArray(payload?.items) ? payload.items : []) as Array<
        Omit<CatalogueItem, 'quantity' | 'languageBreakdown'>
      >
      if (baseItems.length === 0) {
        setItems([])
        setLoading(false)
        return
      }

      let ownedMap = new Map<string, number>()
      let languageBreakdownByPrintId = new Map<string, Map<string, number>>()

      if (userId) {
        const collectionData = await fetchUserCollectionRowsForPrintIds({
          supabase,
          userId,
          printIds: baseItems.map((print) => String(print.id || ''))
        })

        const aggregated = aggregateCollectionRows(collectionData)
        ownedMap = aggregated.totalByPrintId
        languageBreakdownByPrintId = aggregated.byPrintIdLanguage
      }

      const merged: CatalogueItem[] = baseItems.map((print) => ({
        ...print,
        quantity: ownedMap.get(print.id) || 0,
        languageBreakdown: languageBreakdownByPrintId.get(print.id) || new Map<string, number>()
      }))

      const dedupedByVisualKey = new Map<string, CatalogueItem>()
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

        const existingFallback = isSetScopedFallbackPrint(existing.print_code, normalizedSetCode)
        const currentFallback = isSetScopedFallbackPrint(item.print_code, normalizedSetCode)
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

    void fetchData()
  }, [normalizedCode, normalizedSetCode, userId])

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
        a.card?.card_translations?.find((t) => t.locale === DEFAULT_LOCALE)?.name || ''
      const nameB =
        b.card?.card_translations?.find((t) => t.locale === DEFAULT_LOCALE)?.name || ''

      switch (sortKey) {
        case 'number':
          return compareCardPrintNumberSort(a, b, {
            fallbackSetCode: normalizedSetCode,
            directionMultiplier: multiplier,
            nameA,
            nameB,
            variantPriority: VARIANT_PRIORITY
          })

        case 'name':
          return nameA.localeCompare(nameB) * multiplier

        case 'rarity': {
          const rA = RARITY_PRIORITY[a.card?.rarity ?? ''] ?? 99
          const rB = RARITY_PRIORITY[b.card?.rarity ?? ''] ?? 99
          return (rA - rB) * multiplier
        }

        case 'type':
          return (a.card?.type || '').localeCompare(b.card?.type || '') * multiplier

        default:
          return 0
      }
    })
  }, [filteredItems, sortKey, sortDirection, normalizedSetCode])

  const updateQuantity = async (printId: string, languageCode: string, delta: number) => {
    if (!user) return

    const current = items.find((i) => i.id === printId)
    if (!current) return
    const normalizedLanguageCode = normalizeCollectionLanguage(languageCode)
    const currentLanguageQty = Number(
      current.languageBreakdown?.get(normalizedLanguageCode) || 0
    )
    const nextLanguageQty = currentLanguageQty + delta
    let mutationError: string | null = null

    if (nextLanguageQty <= 0) {
      const { error } = await supabase
        .from('collections')
        .delete()
        .eq('user_id', user.id)
        .eq('card_print_id', printId)
        .eq('language_code', normalizedLanguageCode)
      mutationError = error?.message || null
    } else if (currentLanguageQty === 0) {
      const { error } = await supabase.from('collections').upsert(
        {
          user_id: user.id,
          card_print_id: printId,
          language_code: normalizedLanguageCode,
          quantity: nextLanguageQty
        },
        { onConflict: 'user_id,card_print_id,language_code' }
      )
      mutationError = error?.message || null
    } else {
      const { error } = await supabase
        .from('collections')
        .update({ quantity: nextLanguageQty })
        .eq('user_id', user.id)
        .eq('card_print_id', printId)
        .eq('language_code', normalizedLanguageCode)
      mutationError = error?.message || null
    }

    if (mutationError) {
      setCollectionMutationError(mutationError)
      return
    }

    setCollectionMutationError(null)

    setItems((prevItems) =>
      prevItems.map((i) =>
        i.id === printId
          ? (() => {
              const nextLanguageBreakdown = new Map<string, number>(
                i.languageBreakdown || []
              )
              if (nextLanguageQty <= 0) {
                nextLanguageBreakdown.delete(normalizedLanguageCode)
              } else {
                nextLanguageBreakdown.set(normalizedLanguageCode, nextLanguageQty)
              }

              const totalQuantity = [...nextLanguageBreakdown.values()].reduce(
                (sum, quantity) => sum + quantity,
                0
              )

              return {
                ...i,
                quantity: totalQuantity,
                languageBreakdown: nextLanguageBreakdown
              }
            })()
          : i
      )
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

  if (error) {
    return <div style={{ padding: 40 }}>Erreur: {error}</div>
  }

  const totalCount = items.length

  return (
    <div
      style={{
        padding: isCompactView ? '10px 8px 20px' : '18px 28px 28px',
        background:
          'radial-gradient(circle at 10% 20%, #f0f9ff 0%, #eef2ff 35%, #fff7ed 100%)',
        minHeight: '100vh'
      }}
    >
      <h1
        style={{
          fontSize: isCompactView ? 24 : 30,
          fontWeight: 'bold',
          marginBottom: isCompactView ? 10 : 14,
          color: '#111827'
        }}
      >
        Catalogue - {normalizedCode}
      </h1>

      <div
        style={{
          marginBottom: isCompactView ? 14 : 20,
          display: 'grid',
          gridTemplateColumns: isCompactView
            ? '1fr'
            : 'minmax(300px, 1.6fr) minmax(180px, 0.65fr) minmax(220px, 0.9fr)',
          gap: isCompactView ? 10 : 12
        }}
      >
        <div
          style={{
            border: '1px solid #d1d5db',
            borderRadius: 12,
            padding: isCompactView ? 10 : 12,
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
                padding: isCompactView ? '10px 10px' : '9px 10px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                fontSize: isCompactView ? 15 : 14
              }}
            />

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isCompactView
                  ? 'repeat(2, minmax(0, 1fr))'
                  : 'repeat(2, minmax(140px, 1fr))',
                gap: 8
              }}
            >
              <select
                value={rarityFilter}
                onChange={(e) => setRarityFilter(e.target.value)}
                style={{ minWidth: 0, minHeight: isCompactView ? 38 : undefined }}
              >
                <option value="all">Toutes raretes</option>
                {filterOptions.rarities.map((rarity) => (
                  <option key={rarity} value={rarity}>
                    {rarity}
                  </option>
                ))}
              </select>

              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                style={{ minWidth: 0, minHeight: isCompactView ? 38 : undefined }}
              >
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
                style={{ minWidth: 0, minHeight: isCompactView ? 38 : undefined }}
              >
                <option value="all">Toutes versions</option>
                <option value="normal">Normales</option>
                <option value="alt">Alternatives</option>
              </select>

              <select
                value={altTypeFilter}
                onChange={(e) => setAltTypeFilter(e.target.value)}
                disabled={altFilter === 'normal'}
                style={{ minWidth: 0, minHeight: isCompactView ? 38 : undefined }}
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
            padding: isCompactView ? 10 : 12,
            background: '#ffffffd1'
          }}
        >
          <div style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>Tri</div>
          <div style={{ display: 'grid', gap: 8 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isCompactView
                  ? 'repeat(2, minmax(0, 1fr))'
                  : 'repeat(2, minmax(120px, 1fr))',
                gap: 8
              }}
            >
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                style={{ minWidth: 0, minHeight: isCompactView ? 38 : undefined }}
              >
                <option value="number">Numero</option>
                <option value="name">Nom</option>
                <option value="rarity">Rarete</option>
                <option value="type">Type</option>
              </select>

              <select
                value={sortDirection}
                onChange={(e) => setSortDirection(e.target.value as SortDirection)}
                style={{ minWidth: 0, minHeight: isCompactView ? 38 : undefined }}
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
            padding: isCompactView ? 10 : 12,
            background: '#ffffffd1'
          }}
        >
          <div style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>Actions</div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr',
              gap: 8,
              alignItems: 'center'
            }}
          >
            <button
              onClick={resetFilters}
              style={{
                padding: isCompactView ? '10px 12px' : '8px 12px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                cursor: 'pointer',
                minHeight: isCompactView ? 40 : undefined
              }}
            >
              Reinitialiser filtres
            </button>
          </div>
          {collectionMutationError && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#b91c1c' }}>
              Erreur collection: {collectionMutationError}
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isCompactView
            ? 'repeat(2, minmax(0, 1fr))'
            : 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: isCompactView ? 10 : 20
        }}
      >
        {sortedItems.map((item) => {
          const translation = item.card?.card_translations?.find(
            (t) => t.locale === DEFAULT_LOCALE
          )
          const itemLanguages = resolveAvailableLanguages({
            setLanguages,
            itemLanguages: item.available_languages
          })
          const visibleLanguageControls = COLLECTION_LANGUAGE_OPTIONS.filter((option) => {
            if (option.code !== UNKNOWN_LANGUAGE) return itemLanguages.includes(option.code)
            return Number(item.languageBreakdown?.get(UNKNOWN_LANGUAGE) || 0) > 0
          }).map((option) => ({
            code: option.code,
            flag: option.flag,
            label: option.label,
            shortLabel: option.shortLabel,
            quantity: Number(item.languageBreakdown?.get(option.code) || 0)
          }))
          const hasImagePath = Boolean(item.image_path) && item.image_path !== MISSING_IMAGE_PATH
          const imageUrl = hasImagePath
            ? `${STORAGE_BASE_URL}/${normalizedCode}/${item.image_path}`
            : CARD_PLACEHOLDER_IMAGE
          const isAlt = isAltVersion(item)
          const variantBadgeLabel = getPrintVariantTypeBadgeLabel(item)
          const variantBorderColor = getPrintVariantTypeBorderColor(item)
          const rarityTheme = ALT_RARITY_THEME[item.card?.rarity ?? ''] || {
            background: 'linear-gradient(145deg, #f3f4f6, #e5e7eb)',
            border: '#9ca3af'
          }

          return (
            <div
              key={item.id}
              style={{
                border: `2px solid ${variantBorderColor}`,
                borderRadius: 12,
                padding: isCompactView ? 7 : 10,
                background: isAlt
                  ? rarityTheme.background
                  : 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
                textAlign: 'center',
                position: 'relative',
                boxShadow: variantBorderColor === '#f5c84c'
                  ? '0 0 0 1px rgba(255,245,204,0.7) inset, 0 0 18px -6px rgba(251,191,36,0.95), 0 8px 24px -18px #374151'
                  : isAlt
                    ? `0 10px 24px -14px ${variantBorderColor}`
                    : '0 8px 20px -18px #374151'
              }}
            >
              {user && (
                <WishlistHeartButton
                  active={isWishlisted(item.id)}
                  busy={busyPrintId === item.id}
                  onToggle={() => void toggleWishlist(item.id)}
                />
              )}
              {variantBadgeLabel && (
                <div
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: user ? 44 : 8,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 0.5,
                    background: '#111827',
                    color: '#fff',
                    borderRadius: 999,
                    padding: '3px 8px'
                  }}
                >
                  {variantBadgeLabel}
                </div>
              )}
              <img
                src={imageUrl}
                alt={translation?.name}
                style={{
                  width: '100%',
                  marginBottom: isCompactView ? 6 : 10,
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

              {getDisplayPrintCode(item) && (
                <div style={{ fontWeight: 'bold', fontSize: isCompactView ? 12 : 16 }}>
                  {getDisplayPrintCode(item)}
                </div>
              )}
              <div
                style={{
                  fontSize: isCompactView ? 11 : 14,
                  lineHeight: 1.25,
                  minHeight: isCompactView ? 28 : undefined
                }}
              >
                {translation?.name}
              </div>

              <div style={{ fontSize: isCompactView ? 10 : 12, lineHeight: 1.25 }}>
                <strong>{item.card?.rarity}</strong> - {item.card?.type}
              </div>

              {item.quantity > 0 && (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 10,
                    color: '#475569',
                    display: 'flex',
                    gap: 6,
                    justifyContent: 'center',
                    alignItems: 'center',
                    whiteSpace: 'nowrap',
                    overflowX: 'auto',
                    scrollbarWidth: 'none'
                  }}
                >
                  <span style={{ color: '#334155' }}>
                    Total: <strong>{item.quantity}</strong>
                  </span>
                </div>
              )}

              {user && (
                <div
                  style={{
                    marginTop: isCompactView ? 8 : 10,
                    display: 'grid',
                    gap: 6,
                    justifyItems: 'center'
                  }}
                >
                  {visibleLanguageControls.map((entry) => (
                    <div
                      key={entry.code}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: isCompactView ? 11 : 12
                      }}
                    >
                      <span style={{ minWidth: 20, textAlign: 'left' }}>{entry.shortLabel}</span>
                      <button onClick={() => updateQuantity(item.id, entry.code, -1)}>-</button>
                      <span style={{ minWidth: 16, textAlign: 'center' }}>{entry.quantity}</span>
                      <button onClick={() => updateQuantity(item.id, entry.code, 1)}>+</button>
                    </div>
                  ))}
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
