'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
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
type PriceDetail = {
  id: string
  printCode: string
  displayCode: string
  name: string
  quantity: number
  unitPrice: number
  totalPrice: number
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

type Props = {
  code: string
  ownerUserId?: string | null
  editable?: boolean
  title?: string
  shareToken?: string | null
}

function normalizeSetCode(value: string) {
  return value.trim().toUpperCase().replace(/-/g, '')
}

function parseSortKey(value: string | null): SortKey {
  if (value === 'name' || value === 'rarity' || value === 'type') return value
  return 'number'
}

function parseSortDirection(value: string | null): SortDirection {
  return value === 'desc' ? 'desc' : 'asc'
}

function parseAltFilter(value: string | null): AltFilter {
  if (value === 'normal' || value === 'alt') return value
  return 'all'
}

function parseBoolFlag(value: string | null, fallback = true) {
  if (value === '0') return false
  if (value === '1') return true
  return fallback
}

function buildViewQuery(params: {
  searchQuery: string
  rarityFilter: string
  typeFilter: string
  altFilter: AltFilter
  altTypeFilter: string
  sortKey: SortKey
  sortDirection: SortDirection
  showOwned: boolean
  showMissing: boolean
}) {
  const q = new URLSearchParams()
  if (params.searchQuery) q.set('q', params.searchQuery)
  if (params.rarityFilter !== 'all') q.set('rarity', params.rarityFilter)
  if (params.typeFilter !== 'all') q.set('type', params.typeFilter)
  if (params.altFilter !== 'all') q.set('alt', params.altFilter)
  if (params.altTypeFilter !== 'all') q.set('altType', params.altTypeFilter)
  if (params.sortKey !== 'number') q.set('sort', params.sortKey)
  if (params.sortDirection !== 'asc') q.set('dir', params.sortDirection)
  if (!params.showOwned) q.set('owned', '0')
  if (!params.showMissing) q.set('missing', '0')
  return q.toString()
}

export function CollectionSetView({
  code,
  ownerUserId = null,
  editable = true,
  title,
  shareToken = null
}: Props) {
  const { user } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const initialQuery = searchParams.toString()
  const resolvedOwnerId = ownerUserId || user?.id || null
  const canEdit = Boolean(editable && user?.id && user.id === resolvedOwnerId)
  const isSharedView = Boolean(shareToken)

  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)

  const [sortKey, setSortKey] = useState<SortKey>(() =>
    parseSortKey(searchParams.get('sort'))
  )
  const [sortDirection, setSortDirection] = useState<SortDirection>(() =>
    parseSortDirection(searchParams.get('dir'))
  )
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') || '')
  const [rarityFilter, setRarityFilter] = useState(
    () => searchParams.get('rarity') || 'all'
  )
  const [typeFilter, setTypeFilter] = useState(
    () => searchParams.get('type') || 'all'
  )
  const [altFilter, setAltFilter] = useState<AltFilter>(() =>
    parseAltFilter(searchParams.get('alt'))
  )
  const [altTypeFilter, setAltTypeFilter] = useState(
    () => searchParams.get('altType') || 'all'
  )
  const [showOwned, setShowOwned] = useState(() =>
    parseBoolFlag(searchParams.get('owned'), true)
  )
  const [showMissing, setShowMissing] = useState(() =>
    parseBoolFlag(searchParams.get('missing'), true)
  )
  const [priceLoading, setPriceLoading] = useState(false)
  const [priceError, setPriceError] = useState<string | null>(null)
  const [ownedCollectionValue, setOwnedCollectionValue] = useState<number | null>(
    null
  )
  const [pricedOwnedCount, setPricedOwnedCount] = useState(0)
  const [priceDetails, setPriceDetails] = useState<PriceDetail[]>([])
  const [showPriceDetails, setShowPriceDetails] = useState(false)
  const [shareMessage, setShareMessage] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)

      if (shareToken) {
        const res = await fetch(
          `/api/share/set/${encodeURIComponent(shareToken)}/${normalizeSetCode(code)}`
        )
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setItems([])
          setLoading(false)
          return
        }

        setItems(data?.items || [])
        setLoading(false)
        return
      }

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

      if (resolvedOwnerId) {
        const { data: collectionData } = await supabase
          .from('collections')
          .select('*')
          .eq('user_id', resolvedOwnerId)

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
  }, [code, resolvedOwnerId, shareToken])


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
        a.card?.card_translations?.find((t: any) => t.locale === DEFAULT_LOCALE)
          ?.name || ''
      const nameB =
        b.card?.card_translations?.find((t: any) => t.locale === DEFAULT_LOCALE)
          ?.name || ''

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

  const ownedItemsAll = useMemo(
    () => items.filter((item) => (item.quantity || 0) > 0),
    [items]
  )

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(value)

  const calculateCollectionValue = async () => {
    if (!code) return

    setPriceLoading(true)
    setPriceError(null)
    setShowPriceDetails(false)

    try {
      const res = await fetch(`/api/optcg/prices/${code}`)
      const data = await res.json()

      if (!res.ok) {
        setPriceError(data?.error || 'Erreur calcul prix')
        setOwnedCollectionValue(null)
        setPricedOwnedCount(0)
        setPriceDetails([])
        return
      }

      const prices: Record<string, number> = data?.prices || {}
      let total = 0
      let matched = 0
      const details: PriceDetail[] = []

      for (const item of ownedItemsAll) {
        const printCode = (item.print_code || '').trim().toUpperCase()
        const unitPrice = prices[printCode]
        if (!Number.isFinite(unitPrice)) continue
        const quantity = item.quantity || 0
        const totalPrice = unitPrice * quantity
        const name =
          item.card?.card_translations?.find((t: any) => t.locale === DEFAULT_LOCALE)
            ?.name || ''

        total += totalPrice
        matched += 1
        details.push({
          id: item.id,
          printCode,
          displayCode: getDisplayPrintCode(item),
          name,
          quantity,
          unitPrice,
          totalPrice
        })
      }

      setOwnedCollectionValue(total)
      setPricedOwnedCount(matched)
      setPriceDetails(
        details.sort(
          (a, b) =>
            b.totalPrice - a.totalPrice || b.unitPrice - a.unitPrice || a.name.localeCompare(b.name)
        )
      )
    } catch {
      setPriceError('Erreur serveur pendant le calcul')
      setOwnedCollectionValue(null)
      setPricedOwnedCount(0)
      setPriceDetails([])
    } finally {
      setPriceLoading(false)
    }
  }

  useEffect(() => {
    const queryString = buildViewQuery({
      searchQuery,
      rarityFilter,
      typeFilter,
      altFilter,
      altTypeFilter,
      sortKey,
      sortDirection,
      showOwned,
      showMissing
    })
    if (queryString === initialQuery) return
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
      scroll: false
    })
  }, [
    altFilter,
    altTypeFilter,
    initialQuery,
    pathname,
    rarityFilter,
    router,
    searchQuery,
    showMissing,
    showOwned,
    sortDirection,
    sortKey,
    typeFilter
  ])

  const copyShareLink = async () => {
    if (!canEdit) return

    setShareMessage(null)

    const queryString = buildViewQuery({
      searchQuery,
      rarityFilter,
      typeFilter,
      altFilter,
      altTypeFilter,
      sortKey,
      sortDirection,
      showOwned,
      showMissing
    })

    const { data } = await supabase.auth.getSession()
    const accessToken = data.session?.access_token
    if (!accessToken) {
      setShareMessage('Session invalide. Reconnecte-toi.')
      return
    }

    const res = await fetch('/api/share/set-link', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        setCode: code,
        queryString
      })
    })
    const payload = await res.json().catch(() => ({}))

    if (!res.ok || !payload?.shareUrl) {
      setShareMessage(payload?.error || 'Impossible de generer le lien')
      return
    }

    try {
      await navigator.clipboard.writeText(payload.shareUrl)
      setShareMessage('Lien copie dans le presse-papiers.')
    } catch {
      setShareMessage(`Copie manuelle: ${payload.shareUrl}`)
    }
  }

  const updateQuantity = async (printId: string, delta: number) => {
    if (!user || !canEdit) return

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
        const hasImagePath =
          Boolean(item.image_path) && item.image_path !== MISSING_IMAGE_PATH
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

            {canEdit && (
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
        {title || `Collection - ${code}`}
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

        {canEdit && (
          <button
            onClick={copyShareLink}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              cursor: 'pointer'
            }}
          >
            Copier lien de partage
          </button>
        )}

        <button
          onClick={calculateCollectionValue}
          disabled={priceLoading || ownedItemsAll.length === 0}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid #cbd5e1',
            background: '#ffffff',
            cursor:
              priceLoading || ownedItemsAll.length === 0 ? 'not-allowed' : 'pointer'
          }}
        >
          {priceLoading ? 'Calcul en cours...' : 'Calculer valeur collection'}
        </button>

        {ownedCollectionValue !== null && (
          <>
            <div style={{ fontSize: 12, color: '#0f172a', fontWeight: 600 }}>
              Valeur estimee: {formatCurrency(ownedCollectionValue)} ({pricedOwnedCount}/
              {ownedItemsAll.length} cartes pricees)
            </div>
            <button
              onClick={() => setShowPriceDetails(true)}
              disabled={priceDetails.length === 0}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                cursor: priceDetails.length === 0 ? 'not-allowed' : 'pointer'
              }}
            >
              Voir detail prix
            </button>
          </>
        )}

        {priceError && <div style={{ fontSize: 12, color: '#b91c1c' }}>{priceError}</div>}
        {shareMessage && (
          <div style={{ fontSize: 12, color: '#0f766e' }}>{shareMessage}</div>
        )}
        {isSharedView && (
          <div style={{ fontSize: 12, color: '#334155' }}>
            Vue partagee en lecture seule
          </div>
        )}
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
          {showOwned ? 'v' : '>'} Cartes possedees ({ownedItems.length})
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
          {showMissing ? 'v' : '>'} Cartes non possedees ({missingItems.length})
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

      {showPriceDetails && (
        <div
          onClick={() => setShowPriceDetails(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1100
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 10,
              width: 'min(900px, 95vw)',
              maxHeight: '80vh',
              overflow: 'auto',
              padding: 16
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12
              }}
            >
              <h2 style={{ margin: 0, fontSize: 18 }}>
                Detail des prix (plus chere a moins chere)
              </h2>
              <button onClick={() => setShowPriceDetails(false)}>Fermer</button>
            </div>

            {priceDetails.map((row) => (
              <div
                key={row.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.4fr 1fr 0.6fr 0.8fr 0.8fr',
                  gap: 10,
                  padding: '8px 0',
                  borderBottom: '1px solid #e2e8f0',
                  fontSize: 13
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{row.displayCode}</div>
                  <div>{row.name}</div>
                </div>
                <div>{row.printCode}</div>
                <div>x{row.quantity}</div>
                <div>{formatCurrency(row.unitPrice)}</div>
                <div style={{ fontWeight: 700 }}>{formatCurrency(row.totalPrice)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
