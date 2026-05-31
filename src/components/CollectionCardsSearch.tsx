'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { DEFAULT_LOCALE } from '@/lib/locale'
import { getDisplayPrintCode } from '@/lib/cards/printDisplay'
import {
  getAltTypeKey,
  getAltTypeLabel,
  isAltVersion,
  type AltFilter
} from '@/lib/filtering/filterCardPrints'
import { getCollectionLanguageShortLabel } from '@/lib/collections/languages'
import { supabase } from '@/lib/supabaseClient'

const STORAGE_BASE_URL =
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/cards-images`
const CARD_PLACEHOLDER_IMAGE =
  "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 360 500'%3E%3Crect width='360' height='500' fill='%23e2e8f0'/%3E%3Crect x='16' y='16' width='328' height='468' rx='16' fill='%23f8fafc' stroke='%23cbd5e1' stroke-width='2'/%3E%3Ctext x='180' y='235' text-anchor='middle' font-family='Arial' font-size='24' fill='%23475569'%3EPhoto a venir%3C/text%3E%3C/svg%3E"

type CollectionSearchItem = {
  id: string
  print_code: string | null
  variant_type: string | null
  image_path: string | null
  available_languages?: string[] | null
  quantity: number
  languageBreakdown: Array<{ languageCode: string; quantity: number }>
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
}

type FilterOptions = {
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

function getPanelStyle() {
  return {
    border: '1px solid #d1d5db',
    borderRadius: 12,
    padding: 12,
    background: '#ffffffd1'
  } as const
}

export function CollectionCardsSearch() {
  const [isMobileView, setIsMobileView] = useState(false)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [items, setItems] = useState<CollectionSearchItem[]>([])
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    rarities: [],
    types: [],
    altTypes: []
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rarityFilter, setRarityFilter] = useState('all')
  const [cardTypeFilter, setCardTypeFilter] = useState('all')
  const [altFilter, setAltFilter] = useState<AltFilter>('all')
  const [altTypeFilter, setAltTypeFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [hasNextPage, setHasNextPage] = useState(false)
  const [totalItems, setTotalItems] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)

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
    const timeout = window.setTimeout(() => {
      setDebouncedQuery(query)
    }, 250)

    return () => window.clearTimeout(timeout)
  }, [query])

  useEffect(() => {
    let cancelled = false

    const fetchCollectionCards = async () => {
      setLoading(true)
      setError(null)

      try {
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token
        const params = new URLSearchParams()
        if (debouncedQuery.trim()) params.set('q', debouncedQuery.trim())
        if (rarityFilter !== 'all') params.set('rarity', rarityFilter)
        if (cardTypeFilter !== 'all') params.set('type', cardTypeFilter)
        if (altFilter !== 'all') params.set('alt', altFilter)
        if (altTypeFilter !== 'all') params.set('altType', altTypeFilter)
        params.set('page', String(page))

        const res = await fetch(`/api/collection/search?${params.toString()}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        })
        const payload = await res.json().catch(() => ({}))

        if (!res.ok) {
          if (!cancelled) {
            setError(payload?.error || 'Erreur chargement collection')
            setItems([])
            setHasNextPage(false)
            setTotalItems(0)
            setTotalPages(1)
          }
          return
        }

        if (!cancelled) {
          setItems(Array.isArray(payload?.items) ? payload.items : [])
          setFilterOptions({
            rarities: Array.isArray(payload?.options?.rarities) ? payload.options.rarities : [],
            types: Array.isArray(payload?.options?.types) ? payload.options.types : [],
            altTypes: Array.isArray(payload?.options?.altTypes) ? payload.options.altTypes : []
          })
          setHasNextPage(Boolean(payload?.hasNextPage))
          setTotalItems(Number(payload?.totalItems || 0))
          setTotalPages(Math.max(1, Number(payload?.totalPages || 1)))
        }
      } catch {
        if (!cancelled) {
          setError('Erreur chargement collection')
          setItems([])
          setHasNextPage(false)
          setTotalItems(0)
          setTotalPages(1)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void fetchCollectionCards()

    return () => {
      cancelled = true
    }
  }, [altFilter, altTypeFilter, cardTypeFilter, debouncedQuery, page, rarityFilter])

  const resetFilters = () => {
    setQuery('')
    setDebouncedQuery('')
    setRarityFilter('all')
    setCardTypeFilter('all')
    setAltFilter('all')
    setAltTypeFilter('all')
    setPage(1)
  }

  return (
    <div style={{ padding: isMobileView ? '0 0 12px' : '0 40px 40px' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobileView ? '1fr' : 'minmax(260px, 1fr) minmax(220px, 0.5fr) minmax(220px, 0.5fr)',
          gap: 12,
          marginBottom: isMobileView ? 16 : 24
        }}
      >
        <div style={{ ...getPanelStyle(), padding: isMobileView ? 10 : 12 }}>
          <div style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>Recherche et filtres</div>
          <div style={{ display: 'grid', gap: 8 }}>
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setPage(1)
              }}
              placeholder="Recherche dans ma collection"
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
                gridTemplateColumns: isMobileView ? 'repeat(2, minmax(0, 1fr))' : 'repeat(2, minmax(140px, 1fr))',
                gap: 8
              }}
            >
              <select
                value={rarityFilter}
                onChange={(event) => {
                  setRarityFilter(event.target.value)
                  setPage(1)
                }}
                style={{ minWidth: 0, minHeight: isMobileView ? 38 : undefined }}
              >
                <option value="all">Toutes raretes</option>
                {filterOptions.rarities.map((rarity) => (
                  <option key={rarity} value={rarity}>
                    {rarity}
                  </option>
                ))}
              </select>

              <select
                value={cardTypeFilter}
                onChange={(event) => {
                  setCardTypeFilter(event.target.value)
                  setPage(1)
                }}
                style={{ minWidth: 0, minHeight: isMobileView ? 38 : undefined }}
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
                onChange={(event) => {
                  const value = event.target.value as AltFilter
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
                onChange={(event) => {
                  setAltTypeFilter(event.target.value)
                  setPage(1)
                }}
                disabled={altFilter === 'normal'}
                style={{ minWidth: 0, minHeight: isMobileView ? 38 : undefined }}
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

        <div style={{ ...getPanelStyle(), padding: isMobileView ? 10 : 12 }}>
          <div style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>Navigation</div>
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ fontSize: 12, color: '#64748b' }}>Page</div>
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page === 1 || loading}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  border: '1px solid #cbd5e1',
                  background: page === 1 || loading ? '#f8fafc' : '#ffffff',
                  color: page === 1 || loading ? '#94a3b8' : '#0f172a',
                  cursor: page === 1 || loading ? 'not-allowed' : 'pointer',
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
                disabled={!hasNextPage || loading}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  border: '1px solid #1d4ed8',
                  background: !hasNextPage || loading ? '#dbeafe66' : '#dbeafe',
                  color: !hasNextPage || loading ? '#94a3b8' : '#1d4ed8',
                  cursor: !hasNextPage || loading ? 'not-allowed' : 'pointer',
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

        <div style={{ ...getPanelStyle(), padding: isMobileView ? 10 : 12 }}>
          <div style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>Actions</div>
          <button
            type="button"
            onClick={resetFilters}
            style={{
              width: '100%',
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
      </div>

      {loading && <div style={{ color: '#475569', marginBottom: 20 }}>Chargement des cartes...</div>}
      {!loading && error && <div style={{ color: '#475569', marginBottom: 20 }}>{error}</div>}
      {!loading && !error && items.length === 0 && (
        <div style={{ color: '#475569', marginBottom: 20 }}>Aucune carte trouvee dans ta collection.</div>
      )}

      {!loading && !error && items.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobileView ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: isMobileView ? 10 : 20
          }}
        >
          {items.map((item) => {
            const translation =
              item.card?.card_translations?.find((entry) => entry.locale === DEFAULT_LOCALE)?.name ||
              item.card?.card_translations?.[0]?.name
            const hasImagePath = Boolean(item.image_path)
            const imageUrl = hasImagePath
              ? `${STORAGE_BASE_URL}/${item.set.code}/${item.image_path}`
              : CARD_PLACEHOLDER_IMAGE
            const isAlt = isAltVersion(item)
            const altType = getAltTypeKey(item)
            const isFoil = altType === 'foil'
            const altBadgeLabel = altType === 'foil' ? 'FOIL' : 'ALT'
            const rarityTheme = ALT_RARITY_THEME[item.card?.rarity || ''] || {
              background: 'linear-gradient(145deg, #f3f4f6, #e5e7eb)',
              border: '#9ca3af'
            }

            return (
              <div
                key={item.id}
                style={{
                  border: `2px solid ${isFoil ? '#f5c84c' : isAlt ? rarityTheme.border : '#d1d5db'}`,
                  borderRadius: 12,
                  padding: isMobileView ? 7 : 10,
                  background: isAlt ? rarityTheme.background : 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
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
                  alt={translation || getDisplayPrintCode(item)}
                  style={{
                    width: '100%',
                    marginBottom: isMobileView ? 6 : 10,
                    cursor: hasImagePath ? 'pointer' : 'default',
                    borderRadius: 8
                  }}
                  onError={(event) => {
                    event.currentTarget.src = CARD_PLACEHOLDER_IMAGE
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
                    href={`/collection/${item.set.code}?q=${encodeURIComponent(
                      translation || getDisplayPrintCode(item)
                    )}`}
                    style={{ color: 'inherit' }}
                  >
                    {item.set.code} - {item.set.name || item.set.code}
                  </Link>
                </div>

                <div
                  style={{
                    marginTop: 8,
                    fontSize: 11,
                    color: '#334155',
                    display: 'grid',
                    gap: 4,
                    justifyItems: 'center'
                  }}
                >
                  <span>
                    Total: <strong>{item.quantity}</strong>
                  </span>
                  {item.languageBreakdown.length > 0 && (
                    <span style={{ color: '#64748b' }}>
                      {item.languageBreakdown
                        .map((entry) => `${getCollectionLanguageShortLabel(entry.languageCode)} ${entry.quantity}`)
                        .join(' | ')}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
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
    </div>
  )
}
