'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { DEFAULT_LOCALE } from '@/lib/locale'
import {
  getDisplayPrintCode,
  getPrintVariantTypeBadgeLabel,
  getPrintVariantTypeBorderColor
} from '@/lib/cards/printDisplay'
import {
  getAltTypeLabel,
  getAltTypeKey,
  isAltVersion,
  type AltFilter
} from '@/lib/filtering/filterCardPrints'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabaseClient'
import {
  aggregateCollectionRows,
  fetchUserCollectionRowsForPrintIds
} from '@/lib/collections/quantities'
import {
  COLLECTION_LANGUAGE_OPTIONS,
  UNKNOWN_LANGUAGE,
  normalizeCollectionLanguage,
  resolveAvailableLanguages
} from '@/lib/collections/languages'
import { WishlistHeartButton } from '@/components/WishlistHeartButton'
import { useWishlist } from '@/lib/useWishlist'

const STORAGE_BASE_URL =
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/cards-images`
const CARD_PLACEHOLDER_IMAGE =
  "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 360 500'%3E%3Crect width='360' height='500' fill='%23e2e8f0'/%3E%3Crect x='16' y='16' width='328' height='468' rx='16' fill='%23f8fafc' stroke='%23cbd5e1' stroke-width='2'/%3E%3Ctext x='180' y='235' text-anchor='middle' font-family='Arial' font-size='24' fill='%23475569'%3EPhoto a venir%3C/text%3E%3C/svg%3E"

export type CatalogueSetRow = {
  id: string | null
  code: string
  name?: string | null
}

type CatalogueGlobalCardRow = {
  id: string
  print_code: string | null
  variant_type: string | null
  image_path: string | null
  available_languages?: string[] | null
  set: {
    code: string
    name?: string | null
    availableLanguages?: string[] | null
  }
  card?: {
    rarity?: string | null
    type?: string | null
    card_translations?: Array<{
      name: string
      locale: string
    }> | null
  } | null
  quantity: number
  languageBreakdown: Map<string, number>
}

type CatalogueType = 'all' | 'booster' | 'extra_booster' | 'start_deck'
type CatalogueMode = 'sets' | 'cards'

type CatalogueGlobalFilterOptions = {
  rarities: string[]
  types: string[]
  altTypes: string[]
}

const ALT_RARITY_THEME: Record<string, { background: string; border: string }> = {
  C: { background: 'linear-gradient(145deg, #f2f4f7, #e5e7eb)', border: '#9ca3af' },
  UC: { background: 'linear-gradient(145deg, #eafff4, #bbf7d0)', border: '#22c55e' },
  R: { background: 'linear-gradient(145deg, #ecf5ff, #bfdbfe)', border: '#3b82f6' },
  SR: { background: 'linear-gradient(145deg, #fff7e8, #fed7aa)', border: '#f97316' },
  SEC: { background: 'linear-gradient(145deg, #fff0f5, #fbcfe8)', border: '#ec4899' },
  L: { background: 'linear-gradient(145deg, #fff9db, #fde68a)', border: '#eab308' }
}

function getCatalogueTypes(code: string): Array<Exclude<CatalogueType, 'all'>> {
  const normalized = (code || '').trim().toUpperCase()
  const types: Array<Exclude<CatalogueType, 'all'>> = []

  if (normalized.includes('ST')) types.push('start_deck')
  if (normalized.includes('EB')) types.push('extra_booster')
  if (normalized.includes('OP')) types.push('booster')

  return types.length > 0 ? types : ['booster']
}

function getCatalogueLabel(type: Exclude<CatalogueType, 'all'>) {
  if (type === 'start_deck') return 'Start Deck'
  if (type === 'extra_booster') return 'Extra Booster'
  return 'Booster'
}

function getPanelStyle() {
  return {
    border: '1px solid #d1d5db',
    borderRadius: 12,
    padding: 12,
    background: '#ffffffd1'
  } as const
}

export default function CatalogueSetsBrowser({ sets }: { sets: CatalogueSetRow[] }) {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const { isWishlisted, toggleWishlist, busyPrintId } = useWishlist(userId)
  const [isMobileView, setIsMobileView] = useState(false)
  const [mode, setMode] = useState<CatalogueMode>('sets')
  const [typeFilter, setTypeFilter] = useState<CatalogueType>('all')
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [globalItems, setGlobalItems] = useState<CatalogueGlobalCardRow[]>([])
  const [globalFilterOptions, setGlobalFilterOptions] = useState<CatalogueGlobalFilterOptions>({
    rarities: [],
    types: [],
    altTypes: []
  })
  const [globalLoading, setGlobalLoading] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [globalOptionsError, setGlobalOptionsError] = useState<string | null>(null)
  const [collectionMutationError, setCollectionMutationError] = useState<string | null>(null)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [rarityFilter, setRarityFilter] = useState('all')
  const [cardTypeFilter, setCardTypeFilter] = useState('all')
  const [altFilter, setAltFilter] = useState<AltFilter>('all')
  const [altTypeFilter, setAltTypeFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [hasNextPage, setHasNextPage] = useState(false)
  const [totalItems, setTotalItems] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  useEffect(() => {
    const syncMobileView = () => {
      if (typeof window === 'undefined') return
      setIsMobileView(window.innerWidth <= 1024)
    }

    syncMobileView()
    window.addEventListener('resize', syncMobileView)
    return () => window.removeEventListener('resize', syncMobileView)
  }, [])

  useEffect(() => {
    if (mode !== 'cards') return

    const timeout = window.setTimeout(() => {
      setDebouncedQuery(query)
    }, 250)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [mode, query])

  useEffect(() => {
    if (mode !== 'cards' || globalFilterOptions.rarities.length > 0 || globalOptionsError) return

    let cancelled = false

    const fetchGlobalOptions = async () => {
      try {
        const res = await fetch('/api/catalogue/search/options')
        const payload = await res.json().catch(() => ({}))

        if (!res.ok) {
          if (!cancelled) {
            setGlobalOptionsError(payload?.error || 'Erreur chargement options')
          }
          return
        }

        if (!cancelled) {
          setGlobalFilterOptions({
            rarities: Array.isArray(payload?.rarities) ? payload.rarities : [],
            types: Array.isArray(payload?.types) ? payload.types : [],
            altTypes: Array.isArray(payload?.altTypes) ? payload.altTypes : []
          })
        }
      } catch {
        if (!cancelled) {
          setGlobalOptionsError('Erreur chargement options')
        }
      }
    }

    void fetchGlobalOptions()

    return () => {
      cancelled = true
    }
  }, [globalFilterOptions.rarities.length, globalOptionsError, mode])

  const filteredSets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return sets.filter((set) => {
      const types = getCatalogueTypes(set.code)
      if (typeFilter !== 'all' && !types.includes(typeFilter)) return false

      if (!normalizedQuery) return true

      const haystack = `${set.code} ${set.name || ''}`.toLowerCase()
      return haystack.includes(normalizedQuery)
    })
  }, [query, sets, typeFilter])

  useEffect(() => {
    if (mode !== 'cards') return

    let cancelled = false

    const fetchGlobalCards = async () => {
      setGlobalLoading(true)
      setGlobalError(null)

      try {
        const params = new URLSearchParams()
        if (debouncedQuery.trim()) params.set('q', debouncedQuery.trim())
        if (rarityFilter !== 'all') params.set('rarity', rarityFilter)
        if (cardTypeFilter !== 'all') params.set('type', cardTypeFilter)
        if (altFilter !== 'all') params.set('alt', altFilter)
        if (altTypeFilter !== 'all') params.set('altType', altTypeFilter)
        params.set('page', String(page))

        const res = await fetch(`/api/catalogue/search?${params.toString()}`)
        const payload = await res.json().catch(() => ({}))

          if (!res.ok) {
          if (!cancelled) {
            setGlobalError(payload?.error || 'Erreur chargement cartes')
            setGlobalItems([])
            setHasNextPage(false)
            setTotalItems(0)
            setTotalPages(1)
          }
          return
        }

        if (!cancelled) {
          const baseItems = Array.isArray(payload?.items) ? payload.items : []
          let ownedMap = new Map<string, number>()
          let languageBreakdownByPrintId = new Map<string, Map<string, number>>()

          if (userId) {
            const collectionData = await fetchUserCollectionRowsForPrintIds({
              supabase,
              userId,
              printIds: baseItems.map((item: { id?: string | null }) => String(item.id || ''))
            })
            const aggregated = aggregateCollectionRows(collectionData)
            ownedMap = aggregated.totalByPrintId
            languageBreakdownByPrintId = aggregated.byPrintIdLanguage
          }

          setGlobalItems(
            baseItems.map((item: Omit<CatalogueGlobalCardRow, 'quantity' | 'languageBreakdown'>) => ({
              ...item,
              quantity: ownedMap.get(item.id) || 0,
              languageBreakdown:
                languageBreakdownByPrintId.get(item.id) || new Map<string, number>()
            }))
          )
          setHasNextPage(Boolean(payload?.hasNextPage))
          setTotalItems(Number(payload?.totalItems || 0))
          setTotalPages(Math.max(1, Number(payload?.totalPages || 1)))
        }
      } catch {
        if (!cancelled) {
          setGlobalError('Erreur chargement cartes')
          setGlobalItems([])
          setHasNextPage(false)
          setTotalItems(0)
          setTotalPages(1)
        }
      } finally {
        if (!cancelled) {
          setGlobalLoading(false)
        }
      }
    }

    void fetchGlobalCards()

    return () => {
      cancelled = true
    }
  }, [altFilter, altTypeFilter, cardTypeFilter, debouncedQuery, mode, page, rarityFilter, userId])

  const resetCardFilters = () => {
    setQuery('')
    setDebouncedQuery('')
    setRarityFilter('all')
    setCardTypeFilter('all')
    setAltFilter('all')
    setAltTypeFilter('all')
    setPage(1)
  }

  const updateQuantity = async (printId: string, languageCode: string, delta: number) => {
    if (!user) return

    const current = globalItems.find((item) => item.id === printId)
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
    setGlobalItems((prevItems) =>
      prevItems.map((item) => {
        if (item.id !== printId) return item

        const nextLanguageBreakdown = new Map<string, number>(item.languageBreakdown || [])
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
          ...item,
          quantity: totalQuantity,
          languageBreakdown: nextLanguageBreakdown
        }
      })
    )
  }

  return (
    <>
      <div
        style={{
          ...getPanelStyle(),
          marginBottom: isMobileView ? 14 : 20,
          padding: isMobileView ? 10 : 12
        }}
      >
        <div style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>Mode de navigation</div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobileView ? 'repeat(2, minmax(0, 1fr))' : 'repeat(2, max-content)',
            gap: 10
          }}
        >
          <button
            type="button"
            onClick={() => setMode('sets')}
            style={{
              padding: isMobileView ? '10px 12px' : '10px 14px',
              borderRadius: 999,
              border: mode === 'sets' ? '1px solid #1d4ed8' : '1px solid #cbd5e1',
              background: mode === 'sets' ? '#dbeafe' : '#fff',
              color: mode === 'sets' ? '#1d4ed8' : '#334155',
              fontWeight: 700,
              cursor: 'pointer',
              minWidth: 0
            }}
          >
            Vue par set
          </button>

          <button
            type="button"
            onClick={() => setMode('cards')}
            style={{
              padding: isMobileView ? '10px 12px' : '10px 14px',
              borderRadius: 999,
              border: mode === 'cards' ? '1px solid #1d4ed8' : '1px solid #cbd5e1',
              background: mode === 'cards' ? '#dbeafe' : '#fff',
              color: mode === 'cards' ? '#1d4ed8' : '#334155',
              fontWeight: 700,
              cursor: 'pointer',
              minWidth: 0
            }}
          >
            Recherche globale cartes
          </button>
        </div>
      </div>

      {mode === 'sets' ? (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobileView
                ? '1fr'
                : 'minmax(260px, 1.3fr) minmax(220px, 0.7fr)',
              gap: 12,
              marginBottom: isMobileView ? 16 : 24
            }}
          >
            <div style={{ ...getPanelStyle(), padding: isMobileView ? 10 : 12 }}>
              <div style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>
                Recherche et filtres
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filtrer par nom ou code"
                  style={{
                    width: '100%',
                    maxWidth: '100%',
                    boxSizing: 'border-box',
                    padding: isMobileView ? '10px 10px' : '9px 10px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: isMobileView ? 15 : 14
                  }}
                />

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr',
                    gap: 8
                  }}
                >
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value as CatalogueType)}
                    style={{ minWidth: 0, minHeight: isMobileView ? 38 : undefined }}
                  >
                    <option value="all">Tous les types</option>
                    <option value="booster">Booster</option>
                    <option value="extra_booster">Extra Booster</option>
                    <option value="start_deck">Start Deck</option>
                  </select>
                </div>
              </div>
            </div>

            <div style={{ ...getPanelStyle(), padding: isMobileView ? 10 : 12 }}>
              <div style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>Resume</div>
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 12, color: '#334155' }}>
                  Resultats filtres: {filteredSets.length} / {sets.length}
                </div>
              </div>
            </div>
          </div>

          <div style={{ color: '#475569', marginBottom: isMobileView ? 14 : 20 }}>
            {filteredSets.length} resultat(s)
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobileView
                ? 'repeat(2, minmax(0, 1fr))'
                : 'repeat(auto-fill, minmax(220px, 1fr))',
              columnGap: isMobileView ? 14 : 32,
              rowGap: isMobileView ? 18 : 48,
              marginTop: isMobileView ? 6 : 0
            }}
          >
            {filteredSets.map((set) => {
              const imageUrl = `${STORAGE_BASE_URL}/sets/${set.code}.png`
              const types = getCatalogueTypes(set.code)
              const showCodeAndName = types.includes('booster') || types.includes('extra_booster')

              return (
                <Link
                  key={set.id || set.code}
                  href={`/catalogue/${set.code}`}
                  style={{
                    textDecoration: 'none',
                    color: 'inherit',
                    display: 'block',
                    height: '100%'
                  }}
                >
                  <div
                    style={{
                      border: '1px solid #ddd',
                      borderRadius: 10,
                      padding: isMobileView ? 10 : 15,
                      background: '#fff',
                      transition: 'transform 0.2s',
                      cursor: 'pointer',
                      height: '100%',
                      boxSizing: 'border-box'
                    }}
                  >
                    <div
                      style={{
                        height: isMobileView ? 165 : 300,
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: isMobileView ? 10 : 15,
                        overflow: 'hidden'
                      }}
                    >
                      <img
                        src={imageUrl}
                        alt={set.code}
                        style={{
                          maxWidth: '100%',
                          maxHeight: '100%',
                          objectFit: 'contain'
                        }}
                      />
                    </div>

                    <div
                      style={{
                        marginBottom: isMobileView ? 8 : 10,
                        display: 'flex',
                        gap: 6,
                        justifyContent: 'center',
                        flexWrap: 'wrap'
                      }}
                    >
                      {types.map((type) => (
                        <span
                          key={type}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: isMobileView ? '3px 7px' : '4px 8px',
                            borderRadius: 999,
                            background: '#eff6ff',
                            color: '#1d4ed8',
                            fontSize: isMobileView ? 11 : 12,
                            fontWeight: 700
                          }}
                        >
                          {getCatalogueLabel(type)}
                        </span>
                      ))}
                    </div>

                    <div style={{ textAlign: 'center' }}>
                      {showCodeAndName ? (
                        <>
                          <div style={{ fontWeight: 'bold', fontSize: isMobileView ? 15 : 18 }}>
                            {set.code}
                          </div>
                          <div
                            style={{
                              marginTop: 4,
                              color: '#334155',
                              fontSize: isMobileView ? 12 : 16,
                              lineHeight: 1.25
                            }}
                          >
                            {set.name || set.code}
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={{ fontWeight: 'bold', fontSize: isMobileView ? 15 : 18 }}>
                            {set.name || set.code}
                          </div>
                          <div
                            style={{
                              marginTop: 4,
                              color: '#64748b',
                              fontSize: isMobileView ? 12 : 16
                            }}
                          >
                            {set.code}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </>
      ) : (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobileView
                ? '1fr'
                : 'minmax(300px, 1.6fr) minmax(220px, 0.8fr) minmax(220px, 0.9fr)',
              gap: 12,
              marginBottom: isMobileView ? 16 : 20,
              alignItems: 'stretch'
            }}
          >
            <div style={{ ...getPanelStyle(), padding: isMobileView ? 10 : 12 }}>
              <div style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>
                Recherche et filtres
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setPage(1)
                  }}
                  placeholder="Recherche nom, code, variante ou set"
                  style={{
                    width: '100%',
                    maxWidth: '100%',
                    boxSizing: 'border-box',
                    padding: isMobileView ? '10px 10px' : '9px 10px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: isMobileView ? 15 : 14
                  }}
                />

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isMobileView
                      ? 'repeat(2, minmax(0, 1fr))'
                      : 'repeat(2, minmax(140px, 1fr))',
                    gap: 8
                  }}
                >
                  <select
                    value={rarityFilter}
                    onChange={(e) => {
                      setRarityFilter(e.target.value)
                      setPage(1)
                    }}
                    style={{ minWidth: 0, minHeight: isMobileView ? 38 : undefined }}
                  >
                    <option value="all">Toutes raretes</option>
                    {globalFilterOptions.rarities.map((rarity) => (
                      <option key={rarity} value={rarity}>
                        {rarity}
                      </option>
                    ))}
                  </select>

                  <select
                    value={cardTypeFilter}
                    onChange={(e) => {
                      setCardTypeFilter(e.target.value)
                      setPage(1)
                    }}
                    style={{ minWidth: 0, minHeight: isMobileView ? 38 : undefined }}
                  >
                    <option value="all">Tous types</option>
                    {globalFilterOptions.types.map((cardType) => (
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
                      setPage(1)
                    }}
                    style={{ minWidth: 0, minHeight: isMobileView ? 38 : undefined }}
                  >
                    <option value="all">Toutes versions</option>
                    <option value="normal">Normales</option>
                    <option value="alt">Alternatives</option>
                  </select>

                  <select
                    value={altTypeFilter}
                    onChange={(e) => {
                      setAltTypeFilter(e.target.value)
                      setPage(1)
                    }}
                    disabled={altFilter === 'normal'}
                    style={{ minWidth: 0, minHeight: isMobileView ? 38 : undefined }}
                  >
                    <option value="all">Tous types alternatives</option>
                    {globalFilterOptions.altTypes.map((altType) => (
                      <option key={altType} value={altType}>
                        {getAltTypeLabel(altType)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div style={{ ...getPanelStyle(), padding: isMobileView ? 10 : 12 }}>
              <div style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>Navigation</div>
              <div style={{ display: 'grid', gap: 10 }}>
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    flexWrap: 'wrap'
                  }}
                >
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 10px',
                      borderRadius: 999,
                      background: '#eff6ff',
                      color: '#1d4ed8',
                      fontSize: 12,
                      fontWeight: 700
                    }}
                  >
                    <span>{totalItems.toLocaleString('fr-FR')}</span>
                    <span style={{ color: '#475569', fontWeight: 600 }}>cartes</span>
                  </div>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 10px',
                      borderRadius: 999,
                      background: '#f8fafc',
                      color: '#334155',
                      fontSize: 12,
                      fontWeight: 700
                    }}
                  >
                    <span>{totalPages.toLocaleString('fr-FR')}</span>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>pages</span>
                  </div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    flexWrap: 'wrap'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      flexWrap: 'wrap',
                      alignItems: 'center'
                    }}
                  >
                    <div style={{ fontSize: 12, color: '#64748b' }}>Page</div>
                    <button
                      type="button"
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                      disabled={page === 1 || globalLoading}
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 999,
                        border: '1px solid #cbd5e1',
                        background: page === 1 || globalLoading ? '#f8fafc' : '#ffffff',
                        color: page === 1 || globalLoading ? '#94a3b8' : '#0f172a',
                        cursor: page === 1 || globalLoading ? 'not-allowed' : 'pointer',
                        fontWeight: 700,
                        fontSize: 18,
                        lineHeight: 1
                      }}
                      aria-label="Page precedente"
                    >
                      -
                    </button>
                    <div
                      style={{
                        minWidth: 82,
                        height: 34,
                        padding: '0 12px',
                        borderRadius: 999,
                        border: '1px solid #dbe3ee',
                        background: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 14,
                        fontWeight: 700,
                        color: '#0f172a'
                      }}
                    >
                      {Math.min(page, totalPages)} / {totalPages}
                    </div>
                    <button
                      type="button"
                      onClick={() => setPage((current) => current + 1)}
                      disabled={!hasNextPage || globalLoading}
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 999,
                        border: '1px solid #1d4ed8',
                        background: !hasNextPage || globalLoading ? '#dbeafe66' : '#dbeafe',
                        color: !hasNextPage || globalLoading ? '#94a3b8' : '#1d4ed8',
                        cursor: !hasNextPage || globalLoading ? 'not-allowed' : 'pointer',
                        fontWeight: 700,
                        fontSize: 18,
                        lineHeight: 1
                      }}
                      aria-label="Page suivante"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ ...getPanelStyle(), padding: isMobileView ? 10 : 12 }}>
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
                  type="button"
                  onClick={resetCardFilters}
                  style={{
                    padding: isMobileView ? '10px 12px' : '8px 12px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    cursor: 'pointer',
                    minHeight: isMobileView ? 40 : undefined
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

          {globalLoading && <div style={{ color: '#475569', marginBottom: 20 }}>Chargement des cartes...</div>}
          {!globalLoading && globalError && (
            <div style={{ color: '#475569', marginBottom: 20 }}>{globalError}</div>
          )}

          {!globalLoading && !globalError && (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobileView
                    ? 'repeat(2, minmax(0, 1fr))'
                    : 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: isMobileView ? 10 : 20
                }}
              >
                {globalItems.map((item) => {
                  const translation =
                    item.card?.card_translations?.find((entry) => entry.locale === DEFAULT_LOCALE)
                      ?.name || item.card?.card_translations?.[0]?.name
                  const itemLanguages = resolveAvailableLanguages({
                    setLanguages: item.set.availableLanguages,
                    itemLanguages: item.available_languages
                  })
                  const visibleLanguageControls = COLLECTION_LANGUAGE_OPTIONS.filter((option) => {
                    if (option.code !== UNKNOWN_LANGUAGE) return itemLanguages.includes(option.code)
                    return Number(item.languageBreakdown?.get(UNKNOWN_LANGUAGE) || 0) > 0
                  }).map((option) => ({
                    code: option.code,
                    shortLabel: option.shortLabel,
                    quantity: Number(item.languageBreakdown?.get(option.code) || 0)
                  }))
                  const hasImagePath = Boolean(item.image_path)
                  const imageUrl = hasImagePath
                    ? `${STORAGE_BASE_URL}/${item.set.code}/${item.image_path}`
                    : CARD_PLACEHOLDER_IMAGE
                  const isAlt = isAltVersion(item)
                  const variantBadgeLabel = getPrintVariantTypeBadgeLabel(item)
                  const variantBorderColor = getPrintVariantTypeBorderColor(item)
                  const rarityTheme = ALT_RARITY_THEME[item.card?.rarity || ''] || {
                    background: 'linear-gradient(145deg, #f3f4f6, #e5e7eb)',
                    border: '#9ca3af'
                  }

                  return (
                    <div
                      key={item.id}
                      style={{
                        border: `2px solid ${variantBorderColor}`,
                        borderRadius: 12,
                        padding: isMobileView ? 7 : 10,
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
                        alt={translation || getDisplayPrintCode(item)}
                        style={{
                          width: '100%',
                          marginBottom: isMobileView ? 6 : 10,
                          cursor: hasImagePath ? 'pointer' : 'default',
                          borderRadius: 8
                        }}
                        onError={(e) => {
                          e.currentTarget.src = CARD_PLACEHOLDER_IMAGE
                        }}
                        onClick={() => {
                          if (hasImagePath) setSelectedImage(imageUrl)
                        }}
                      />

                      <div style={{ fontWeight: 'bold', fontSize: isMobileView ? 12 : 16 }}>
                        {getDisplayPrintCode(item)}
                      </div>
                      <div
                        style={{
                          fontSize: isMobileView ? 11 : 14,
                          lineHeight: 1.25,
                          minHeight: isMobileView ? 28 : undefined
                        }}
                      >
                        {translation || 'Carte sans nom'}
                      </div>

                      <div style={{ fontSize: isMobileView ? 10 : 12, lineHeight: 1.25 }}>
                        <strong>{item.card?.rarity}</strong> - {item.card?.type}
                      </div>
                      <div
                        style={{
                          marginTop: 4,
                          fontSize: isMobileView ? 10 : 12,
                          color: '#64748b',
                          lineHeight: 1.25
                        }}
                      >
                        <Link
                          href={`/catalogue/${item.set.code}?q=${encodeURIComponent(
                            translation || getDisplayPrintCode(item)
                          )}`}
                          style={{ color: 'inherit' }}
                        >
                          {item.set.code} - {item.set.name || item.set.code}
                        </Link>
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
                            marginTop: isMobileView ? 8 : 10,
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
                                fontSize: isMobileView ? 11 : 12
                              }}
                            >
                              <span style={{ minWidth: 20, textAlign: 'left' }}>{entry.shortLabel}</span>
                              <button onClick={() => void updateQuantity(item.id, entry.code, -1)}>
                                -
                              </button>
                              <span style={{ minWidth: 16, textAlign: 'center' }}>{entry.quantity}</span>
                              <button onClick={() => void updateQuantity(item.id, entry.code, 1)}>
                                +
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </>
      )}
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
    </>
  )
}
