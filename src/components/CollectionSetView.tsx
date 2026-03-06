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
type PriceSource = 'cardmarket' | 'us'
type PriceDetail = {
  id: string
  printCode: string
  displayCode: string
  name: string
  quantity: number
  unitPrice: number
  totalPrice: number
  source: PriceSource
  cardmarketProductId: string | null
}

type DoubleDetail = {
  id: string
  printCode: string
  displayCode: string
  name: string
  quantity: number
  unitPrice: number | null
  source: PriceSource | null
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
  const [priceModalTotal, setPriceModalTotal] = useState<number | null>(null)
  const [priceModalPricedCount, setPriceModalPricedCount] = useState(0)
  const [priceModalExpectedCount, setPriceModalExpectedCount] = useState(0)
  const [priceModalTitle, setPriceModalTitle] = useState('Detail des prix')
  const [priceDetails, setPriceDetails] = useState<PriceDetail[]>([])
  const [showPriceDetails, setShowPriceDetails] = useState(false)
  const [shareMessage, setShareMessage] = useState<string | null>(null)
  const [showDoublesModal, setShowDoublesModal] = useState(false)
  const [doublesPriceLoading, setDoublesPriceLoading] = useState(false)

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
  const doublesDetails = useMemo<DoubleDetail[]>(
    () =>
      ownedItemsAll
        .filter((item) => (item.quantity || 0) > 1)
        .map((item) => {
          const printCode = (item.print_code || '').trim().toUpperCase()
          const name =
            item.card?.card_translations?.find((t: any) => t.locale === DEFAULT_LOCALE)
              ?.name || ''
          const quantity = item.quantity || 0
          return {
            id: item.id,
            printCode,
            displayCode: getDisplayPrintCode(item),
            name,
            quantity,
            unitPrice: null,
            source: null
          }
        })
        .sort((a, b) => b.quantity - a.quantity || a.displayCode.localeCompare(b.displayCode)),
    [ownedItemsAll]
  )
  const missingItemsAll = useMemo(
    () => items.filter((item) => (item.quantity || 0) === 0),
    [items]
  )

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(value)

  const calculatePriceDetails = async (mode: 'owned' | 'missing') => {
    if (!code) return

    setPriceLoading(true)
    setPriceError(null)
    setShowPriceDetails(false)

    try {
      const res = await fetch(`/api/optcg/prices/${code}`)
      const data = await res.json()

      if (!res.ok) {
        setPriceError(data?.error || 'Erreur calcul prix')
        setPriceModalTotal(null)
        setPriceModalPricedCount(0)
        setPriceModalExpectedCount(0)
        setPriceDetails([])
        return
      }

      const prices: Record<string, number> = data?.prices || {}
      const priceSources: Record<string, PriceSource> = data?.sources || {}
      const cardmarketProductIds: Record<string, string> = data?.cardmarketProductIds || {}
      let total = 0
      let matched = 0
      const details: PriceDetail[] = []
      const targetItems = mode === 'owned' ? ownedItemsAll : missingItemsAll

      for (const item of targetItems) {
        const printCode = (item.print_code || '').trim().toUpperCase()
        const unitPrice = prices[printCode]
        if (!Number.isFinite(unitPrice)) continue
        const source: PriceSource = priceSources[printCode] === 'cardmarket' ? 'cardmarket' : 'us'
        const quantity = mode === 'owned' ? item.quantity || 0 : 1
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
          totalPrice,
          source,
          cardmarketProductId: cardmarketProductIds[printCode] || null
        })
      }

      setPriceModalTitle(
        mode === 'owned'
          ? 'Detail des prix - Cartes possedees'
          : 'Detail des prix - Cartes manquantes'
      )
      setPriceModalTotal(total)
      setPriceModalPricedCount(matched)
      setPriceModalExpectedCount(targetItems.length)
      setPriceDetails(
        details.sort(
          (a, b) =>
            b.totalPrice - a.totalPrice ||
            b.unitPrice - a.unitPrice ||
            a.name.localeCompare(b.name)
        )
      )
      setShowPriceDetails(true)
    } catch {
      setPriceError('Erreur serveur pendant le calcul')
      setPriceModalTotal(null)
      setPriceModalPricedCount(0)
      setPriceModalExpectedCount(0)
      setPriceDetails([])
    } finally {
      setPriceLoading(false)
    }
  }

  const calculateCollectionValue = async () => {
    await calculatePriceDetails('owned')
  }

  const calculateMissingValue = async () => {
    await calculatePriceDetails('missing')
  }

  const openDoublesModal = async () => {
    if (!canEdit || doublesDetails.length === 0 || doublesPriceLoading) return
    setDoublesPriceLoading(true)
    setShowDoublesModal(true)
    try {
      const res = await fetch(`/api/optcg/prices/${code}`)
      const data = await res.json().catch(() => ({}))
      const prices: Record<string, number> = res.ok ? data?.prices || {} : {}
      const priceSources: Record<string, PriceSource> = res.ok ? data?.sources || {} : {}
      const enriched = doublesDetails
        .map((row) => ({
          ...row,
          unitPrice: Number.isFinite(prices[row.printCode]) ? prices[row.printCode] : null,
          source:
            Number.isFinite(prices[row.printCode])
              ? (priceSources[row.printCode] === 'cardmarket' ? 'cardmarket' : 'us')
              : null
        }))
        .sort(
          (a, b) =>
            (b.unitPrice || -1) - (a.unitPrice || -1) ||
            b.quantity - a.quantity ||
            a.displayCode.localeCompare(b.displayCode)
        )
      // Reuse state setter by rebuilding from owned items is heavier; direct state for modal table only
      setDoublesRows(enriched)
    } finally {
      setDoublesPriceLoading(false)
    }
  }

  const [doublesRows, setDoublesRows] = useState<DoubleDetail[]>([])

  useEffect(() => {
    setDoublesRows(doublesDetails)
  }, [doublesDetails])

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

  const resetFilters = () => {
    setSearchQuery('')
    setRarityFilter('all')
    setTypeFilter('all')
    setAltFilter('all')
    setAltTypeFilter('all')
    setSortKey('number')
    setSortDirection('asc')
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

  const totalCount = items.length
  const ownedCount = ownedItemsAll.length
  const missingCount = Math.max(totalCount - ownedCount, 0)
  const lifePercent = totalCount > 0 ? Math.round((ownedCount / totalCount) * 100) : 0
  const altCount = items.filter((item) => isAltVersion(item)).length
  const normalCount = totalCount - altCount

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
        {title || `Collection - ${code}`}
      </h1>

      <div
        style={{
          border: '1px solid #cfe4ff',
          borderRadius: 14,
          background: 'linear-gradient(145deg, #ffffff 0%, #eff6ff 100%)',
          padding: 16,
          marginBottom: 16
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
            marginBottom: 10
          }}
        >
          <div style={{ minWidth: 220 }}>
            <div style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>Ligne de vie</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
              {ownedCount} possedees / {totalCount} ({lifePercent}%)
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div
              style={{
                fontSize: 12,
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: 999,
                padding: '4px 10px'
              }}
            >
              Normales: <strong>{normalCount}</strong>
            </div>
            <div
              style={{
                fontSize: 12,
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: 999,
                padding: '4px 10px'
              }}
            >
              Alternatives: <strong>{altCount}</strong>
            </div>
            <div
              style={{
                fontSize: 12,
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: 999,
                padding: '4px 10px'
              }}
            >
              Manquantes: <strong>{missingCount}</strong>
            </div>
          </div>
        </div>

        <div
          style={{
            height: 12,
            background: '#dbeafe',
            borderRadius: 999,
            overflow: 'hidden'
          }}
        >
          <div
            style={{
              width: `${lifePercent}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #0ea5e9 0%, #22c55e 100%)'
            }}
          />
        </div>
      </div>

      <div
        style={{
          marginBottom: 20,
          display: 'grid',
          gridTemplateColumns: 'minmax(300px, 1.6fr) minmax(180px, 0.65fr) minmax(280px, 1fr)',
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
            </div>
            <div style={{ fontSize: 12, color: '#334155' }}>
              Resultats filtres: {sortedItems.length} / {items.length}
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
              {priceLoading ? 'Calcul en cours...' : 'Valeur Collection'}
            </button>

            <button
              onClick={calculateMissingValue}
              disabled={priceLoading || missingItemsAll.length === 0}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                cursor:
                  priceLoading || missingItemsAll.length === 0
                    ? 'not-allowed'
                    : 'pointer'
              }}
            >
              {priceLoading ? 'Calcul en cours...' : 'Completer collection'}
            </button>

            <button
              onClick={openDoublesModal}
              disabled={!canEdit || doublesDetails.length === 0}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                cursor:
                  !canEdit || doublesDetails.length === 0 ? 'not-allowed' : 'pointer'
              }}
            >
              {doublesPriceLoading ? 'Chargement...' : 'Doubles'}
            </button>
          </div>
          {priceError && <div style={{ marginTop: 6, fontSize: 12, color: '#b91c1c' }}>{priceError}</div>}
          {shareMessage && (
            <div style={{ marginTop: 6, fontSize: 12, color: '#0f766e' }}>{shareMessage}</div>
          )}
          {isSharedView && (
            <div style={{ marginTop: 6, fontSize: 12, color: '#334155' }}>
              Vue partagee en lecture seule
            </div>
          )}
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
              padding: 0
            }}
          >
            <div
              style={{
                position: 'sticky',
                top: 0,
                zIndex: 1,
                background: '#fff',
                borderBottom: '1px solid #e2e8f0',
                padding: 16,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: 18 }}>{priceModalTitle}</h2>
                <div style={{ marginTop: 4, fontSize: 13, color: '#334155' }}>
                  Total estime: <strong>{formatCurrency(priceModalTotal || 0)}</strong>{' '}
                  ({priceModalPricedCount}/{priceModalExpectedCount} cartes pricees)
                </div>
              </div>
              <button onClick={() => setShowPriceDetails(false)}>Fermer</button>
            </div>

            <div style={{ padding: 12 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.5fr 1fr 0.6fr 0.8fr 0.8fr 0.9fr',
                  gap: 10,
                  padding: '6px 8px',
                  fontSize: 12,
                  color: '#475569',
                  borderBottom: '1px solid #e2e8f0',
                  marginBottom: 2
                }}
              >
                <div>Carte</div>
                <div>Code print</div>
                <div>Qte</div>
                <div>Prix u.</div>
                <div>Total</div>
                <div>Lien</div>
              </div>

              {priceDetails.map((row) => (
                (() => {
                  const baseCode = (row.printCode || '').split('_')[0] || ''
                  const cardmarketUrl = row.cardmarketProductId
                    ? `https://www.cardmarket.com/en/OnePiece/Products?idProduct=${encodeURIComponent(row.cardmarketProductId)}`
                    : `https://www.cardmarket.com/fr/OnePiece/Products/Singles?searchMode=v2&idCategory=1621&idExpansion=0&searchString=${encodeURIComponent(baseCode)}&idRarity=0&perSite=30`
                  return (
                <div
                  key={row.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.5fr 1fr 0.6fr 0.8fr 0.8fr 0.9fr',
                    gap: 10,
                    padding: '10px 8px',
                    borderBottom: '1px solid #e2e8f0',
                    fontSize: 13,
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700 }}>{row.displayCode}</div>
                    <div>{row.name}</div>
                  </div>
                  <div style={{ color: '#334155' }}>{row.printCode}</div>
                    <div>x{row.quantity}</div>
                  <div
                    title={
                      row.source === 'cardmarket'
                        ? 'Prix Cardmarket (avg_price)'
                        : 'Prix US (source externe), un ecart peut exister'
                    }
                  >
                    {formatCurrency(row.unitPrice)}
                    {row.source !== 'cardmarket' ? '*' : ''}
                  </div>
                  <div style={{ fontWeight: 700 }}>{formatCurrency(row.totalPrice)}</div>
                  <a
                    href={cardmarketUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: '#0369a1', fontWeight: 600 }}
                  >
                    Cardmarket
                  </a>
                </div>
                  )
                })()
              ))}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', padding: '0 8px 10px' }}>
                * Prix US (source externe), un ecart peut exister avec Cardmarket.
              </div>
            </div>
        </div>
      )}

      {showDoublesModal && (
        <div
          onClick={() => setShowDoublesModal(false)}
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
              width: 'min(820px, 95vw)',
              maxHeight: '80vh',
              overflow: 'auto',
              padding: 0
            }}
          >
            <div
              style={{
                position: 'sticky',
                top: 0,
                zIndex: 1,
                background: '#fff',
                borderBottom: '1px solid #e2e8f0',
                padding: 16,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: 18 }}>Detail des doubles - Cartes possedees</h2>
                <div style={{ marginTop: 4, fontSize: 13, color: '#334155' }}>
                  {doublesDetails.length} carte(s) avec au moins un double
                </div>
              </div>
              <button onClick={() => setShowDoublesModal(false)}>Fermer</button>
            </div>

            <div style={{ padding: 12 }}>
              {doublesDetails.length === 0 ? (
                <div style={{ fontSize: 14, color: '#64748b' }}>Aucun double.</div>
              ) : (
                <>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1.5fr 1fr 0.8fr 0.8fr',
                      gap: 10,
                      padding: '6px 8px',
                      fontSize: 12,
                      color: '#475569',
                      borderBottom: '1px solid #e2e8f0',
                      marginBottom: 2
                    }}
                  >
                    <div>Carte</div>
                    <div>Code print</div>
                    <div>Quantite</div>
                    <div>Prix</div>
                  </div>

                  {doublesRows.map((row) => (
                    <div
                      key={row.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1.5fr 1fr 0.8fr 0.8fr',
                        gap: 10,
                        padding: '10px 8px',
                        borderBottom: '1px solid #e2e8f0',
                        fontSize: 13,
                        alignItems: 'center'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700 }}>{row.displayCode}</div>
                        <div>{row.name}</div>
                      </div>
                      <div style={{ color: '#334155' }}>{row.printCode}</div>
                      <div>x{row.quantity}</div>
                      <div style={{ fontWeight: 700 }}>
                        {row.unitPrice == null ? '-' : `${formatCurrency(row.unitPrice)}${row.source !== 'cardmarket' ? '*' : ''}`}
                      </div>
                    </div>
                  ))}
                  <div style={{ fontSize: 12, color: '#64748b', padding: '8px 8px 2px' }}>
                    * Prix US (source externe), un ecart peut exister avec Cardmarket.
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
