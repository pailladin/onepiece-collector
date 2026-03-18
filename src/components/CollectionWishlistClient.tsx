'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabaseClient'
import { DEFAULT_LOCALE } from '@/lib/locale'
import { getDisplayPrintCode } from '@/lib/cards/printDisplay'
import { WishlistHeartButton } from '@/components/WishlistHeartButton'
import { useWishlist } from '@/lib/useWishlist'
import { buildCardmarketProductOrSearchUrl } from '@/lib/cardmarketUrls'
import type { WishlistBaseItem } from '@/lib/server/wishlist'

const STORAGE_BASE_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/cards-images`
const MISSING_IMAGE_PATH = '__missing__'
const CARD_PLACEHOLDER_IMAGE =
  "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 360 500'%3E%3Crect width='360' height='500' fill='%23e2e8f0'/%3E%3Crect x='16' y='16' width='328' height='468' rx='16' fill='%23f8fafc' stroke='%23cbd5e1' stroke-width='2'/%3E%3Ctext x='180' y='235' text-anchor='middle' font-family='Arial' font-size='24' fill='%23475569'%3EPhoto a venir%3C/text%3E%3C/svg%3E"

type WishlistItem = WishlistBaseItem & {
  price: number | null
  cardmarketProductId: string | null
  low: number | null
  avg: number | null
  trendDirection: 'up' | 'down' | 'flat' | 'unknown'
  trendScore: number | null
  trendPct1d: number | null
  trendPct7d: number | null
  trendPct30d: number | null
  interestIndex: number | null
}

type Props = {
  shareToken?: string | null
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getDropMagnitude(value: number | null) {
  return value != null && value < 0 ? -value : 0
}

function calculateInterestIndex(params: {
  trendScore: number | null
  pct1d: number | null
  pct7d: number | null
  pct30d: number | null
  low: number | null
  avg: number | null
  unitPrice: number | null
}) {
  if (params.unitPrice == null) return null

  const baseDrop = getDropMagnitude(params.trendScore)
  const drop1d = getDropMagnitude(params.pct1d)
  const drop7d = getDropMagnitude(params.pct7d)
  const drop30d = getDropMagnitude(params.pct30d)
  const snapshotDrop = drop1d * 0.5 + drop7d * 0.3 + drop30d * 0.2
  const dropScore = baseDrop * 0.7 + snapshotDrop * 0.3

  const spreadScore =
    params.avg && params.avg > 0 && params.low != null && params.low >= 0
      ? clamp((params.avg - params.low) / params.avg, 0, 0.6)
      : 0

  const priceAccessibility = clamp(1 / (1 + params.unitPrice / 60), 0, 1)
  const interestRaw = dropScore * 0.75 + spreadScore * 0.15 + priceAccessibility * 0.1
  return clamp(Math.round(interestRaw * 1000) / 10, 0, 100)
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR'
  }).format(value)
}

function formatPercent(value: number) {
  return `${value >= 0 ? '+' : ''}${new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(value * 100)}%`
}

async function fetchWishlistBaseItemsForCurrentUser(wishlistIds: Set<string>): Promise<WishlistBaseItem[]> {
  const printIds = [...wishlistIds]
  if (printIds.length === 0) {
    return []
  }

  const printRows: Array<{
    id: string
    print_code: string | null
    variant_type: string | null
    image_path: string | null
    distribution_set_id: string
    card_id: string
  }> = []

  for (const idsChunk of chunkArray(printIds, 300)) {
    const { data } = await supabase
      .from('card_prints')
      .select('id, print_code, variant_type, image_path, distribution_set_id, card_id')
      .in('id', idsChunk)

    printRows.push(
      ...((((data as Array<{
        id: string
        print_code: string | null
        variant_type: string | null
        image_path: string | null
        distribution_set_id: string
        card_id: string
      }> | null) || []) as Array<{
        id: string
        print_code: string | null
        variant_type: string | null
        image_path: string | null
        distribution_set_id: string
        card_id: string
      }>))
    )
  }

  const setIds = [...new Set(printRows.map((row) => row.distribution_set_id))]
  const cardIds = [...new Set(printRows.map((row) => row.card_id))]

  const [{ data: setsData }, { data: cardsData }] = await Promise.all([
    supabase.from('sets').select('id, code, name').in('id', setIds),
    supabase
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
  ])

  const setsById = new Map(
    ((((setsData as Array<{ id: string; code: string; name: string | null }> | null) || []) as Array<{
      id: string
      code: string
      name: string | null
    }>)).map((row) => [row.id, row])
  )
  const cardsById = new Map(
    ((((cardsData as Array<{
      id: string
      rarity: string | null
      type: string | null
      card_translations?: Array<{ locale: string; name: string }> | null
    }> | null) || []) as Array<{
      id: string
      rarity: string | null
      type: string | null
      card_translations?: Array<{ locale: string; name: string }> | null
    }>)).map((row) => [row.id, row])
  )

  return printRows
    .map((print) => {
      const set = setsById.get(print.distribution_set_id)
      const card = cardsById.get(print.card_id)
      const name =
        card?.card_translations?.find((entry) => entry.locale === DEFAULT_LOCALE)?.name ||
        card?.card_translations?.[0]?.name ||
        print.print_code ||
        'Carte'

      return {
        id: print.id,
        setCode: set?.code || '?',
        setName: set?.name || set?.code || '?',
        print_code: print.print_code,
        variant_type: print.variant_type,
        image_path: print.image_path,
        rarity: card?.rarity || null,
        type: card?.type || null,
        name
      }
    })
    .sort((a, b) => a.setCode.localeCompare(b.setCode) || a.name.localeCompare(b.name))
}

async function enrichWishlistItems(baseItems: WishlistBaseItem[]): Promise<WishlistItem[]> {
  if (baseItems.length === 0) {
    return []
  }

  const pricingBySet = new Map<
    string,
    {
      pricesByPrintId: Record<string, number>
      prices: Record<string, number>
      productIdsByPrintId: Record<string, string>
      productIds: Record<string, string>
      rangesByPrintId: Record<string, { low: number | null; avg: number | null }>
      ranges: Record<string, { low: number | null; avg: number | null }>
      trendsByPrintId: Record<
        string,
        {
          direction?: 'up' | 'down' | 'flat' | 'unknown'
          score?: number | null
          pct1d?: number | null
          pct7d?: number | null
          pct30d?: number | null
        }
      >
      trends: Record<
        string,
        {
          direction?: 'up' | 'down' | 'flat' | 'unknown'
          score?: number | null
          pct1d?: number | null
          pct7d?: number | null
          pct30d?: number | null
        }
      >
    }
  >()

  for (const setCode of [...new Set(baseItems.map((item) => item.setCode))]) {
    const res = await fetch(`/api/optcg/prices/${encodeURIComponent(setCode)}`)
    const data = await res.json().catch(() => ({}))
    pricingBySet.set(setCode, {
      pricesByPrintId: res.ok ? data?.pricesByPrintId || {} : {},
      prices: res.ok ? data?.prices || {} : {},
      productIdsByPrintId: res.ok ? data?.cardmarketProductIdsByPrintId || {} : {},
      productIds: res.ok ? data?.cardmarketProductIds || {} : {},
      rangesByPrintId: res.ok ? data?.cardmarketRangesByPrintId || {} : {},
      ranges: res.ok ? data?.cardmarketRanges || {} : {},
      trendsByPrintId: res.ok ? data?.cardmarketTrendsByPrintId || {} : {},
      trends: res.ok ? data?.cardmarketTrends || {} : {}
    })
  }

  return baseItems.map((item) => {
    const printCode = String(item.print_code || '').trim().toUpperCase()
    const pricing = pricingBySet.get(item.setCode)
    const priceValue = Number(pricing?.pricesByPrintId?.[item.id] ?? pricing?.prices?.[printCode])
    const unitPrice = Number.isFinite(priceValue) ? priceValue : null
    const trend = pricing?.trendsByPrintId?.[item.id] || pricing?.trends?.[printCode] || {}
    const range = pricing?.rangesByPrintId?.[item.id] || pricing?.ranges?.[printCode]
    const lowValue = Number(range?.low)
    const avgValue = Number(range?.avg)
    const low = Number.isFinite(lowValue) ? lowValue : null
    const avg = Number.isFinite(avgValue) ? avgValue : null

    return {
      ...item,
      price: unitPrice,
      cardmarketProductId:
        pricing?.productIdsByPrintId?.[item.id] || pricing?.productIds?.[printCode] || null,
      low,
      avg,
      trendDirection: trend.direction || 'unknown',
      trendScore: Number.isFinite(Number(trend.score)) ? Number(trend.score) : null,
      trendPct1d: Number.isFinite(Number(trend.pct1d)) ? Number(trend.pct1d) : null,
      trendPct7d: Number.isFinite(Number(trend.pct7d)) ? Number(trend.pct7d) : null,
      trendPct30d: Number.isFinite(Number(trend.pct30d)) ? Number(trend.pct30d) : null,
      interestIndex: calculateInterestIndex({
        trendScore: Number.isFinite(Number(trend.score)) ? Number(trend.score) : null,
        pct1d: Number.isFinite(Number(trend.pct1d)) ? Number(trend.pct1d) : null,
        pct7d: Number.isFinite(Number(trend.pct7d)) ? Number(trend.pct7d) : null,
        pct30d: Number.isFinite(Number(trend.pct30d)) ? Number(trend.pct30d) : null,
        low,
        avg,
        unitPrice
      })
    }
  })
}

export function CollectionWishlistClient({ shareToken = null }: Props) {
  const { user, loading: authLoading } = useAuth()
  const userId = user?.id ?? null
  const { wishlistIds, toggleWishlist, busyPrintId, loading: wishlistLoading } = useWishlist(userId)
  const isSharedView = Boolean(shareToken)
  const [items, setItems] = useState<WishlistItem[]>([])
  const [ownerName, setOwnerName] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [shareMessage, setShareMessage] = useState<string | null>(null)

  useEffect(() => {
    const loadWishlist = async () => {
      if (isSharedView) {
        setLoading(true)
        setLoadError(null)
        const res = await fetch(`/api/share/wishlist/${encodeURIComponent(String(shareToken || ''))}`)
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setItems([])
          setOwnerName('')
          setLoadError(data?.error || 'Lien de partage invalide')
          setLoading(false)
          return
        }

        const baseItems = Array.isArray(data?.items) ? (data.items as WishlistBaseItem[]) : []
        const enrichedItems = await enrichWishlistItems(baseItems)
        setOwnerName(String(data?.ownerName || '').trim())
        setItems(enrichedItems)
        setLoading(false)
        return
      }

      if (!userId) {
        setItems([])
        setLoading(false)
        return
      }

      setLoading(true)
      setLoadError(null)
      const baseItems = await fetchWishlistBaseItemsForCurrentUser(wishlistIds)
      const enrichedItems = await enrichWishlistItems(baseItems)
      setItems(enrichedItems)
      setLoading(false)
    }

    void loadWishlist()
  }, [isSharedView, shareToken, userId, wishlistIds])

  const groupedItems = useMemo(() => {
    const grouped = new Map<string, WishlistItem[]>()
    for (const item of items) {
      if (!grouped.has(item.setCode)) grouped.set(item.setCode, [])
      grouped.get(item.setCode)?.push(item)
    }
    return [...grouped.entries()]
  }, [items])

  const copyShareLink = async () => {
    if (!user) return

    setShareMessage(null)

    const { data } = await supabase.auth.getSession()
    const accessToken = data.session?.access_token
    if (!accessToken) {
      setShareMessage('Session invalide. Reconnecte-toi.')
      return
    }

    const res = await fetch('/api/share/wishlist-link', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
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

  if ((isSharedView && loading) || (!isSharedView && (authLoading || wishlistLoading || loading))) {
    return <div style={{ padding: 40 }}>Chargement...</div>
  }

  if (isSharedView && loadError) {
    return <div style={{ padding: 40 }}>{loadError}</div>
  }

  if (!isSharedView && !user) {
    return <div style={{ padding: 40 }}>Connecte-toi pour voir ta wishlist.</div>
  }

  const pageTitle = isSharedView
    ? `Wishlist de ${ownerName || 'Collectionneur'}`
    : 'Ma Wishlist'
  const pageSubtitle = isSharedView
    ? `${items.length} carte(s) partagee(s) pour aider la famille et les amis a choisir quoi acheter.`
    : `${items.length} carte(s) suivie(s) pour tes recherches et prochains achats.`

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '18px 28px 28px',
        background:
          'radial-gradient(circle at 12% 8%, #fff4e6 0%, #e0f2fe 40%, #eef2ff 100%)',
        display: 'grid',
        gap: 12,
        alignContent: 'start'
      }}
    >
      <section
        style={{
          border: '1px solid #cfe4ff',
          borderRadius: 14,
          background: 'linear-gradient(145deg, #ffffff 0%, #eff6ff 100%)',
          padding: 14
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 30, color: '#0f172a' }}>{pageTitle}</h1>
            <div style={{ marginTop: 8, color: '#475569' }}>{pageSubtitle}</div>
            {shareMessage && <div style={{ marginTop: 8, color: '#0f766e' }}>{shareMessage}</div>}
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'start', flexWrap: 'wrap' }}>
            {!isSharedView && (
              <button
                onClick={() => void copyShareLink()}
                style={{
                  border: '1px solid #2563eb',
                  background: '#2563eb',
                  color: '#fff',
                  borderRadius: 8,
                  padding: '8px 12px',
                  cursor: 'pointer'
                }}
              >
                Partager ma wishlist
              </button>
            )}
            {!isSharedView && <Link href="/collection">Retour a ma collection</Link>}
            <Link href="/catalogue">Voir le catalogue</Link>
          </div>
        </div>
      </section>

      {items.length === 0 ? (
        <section
          style={{
            border: '1px solid #d1d5db',
            borderRadius: 12,
            background: '#ffffffd1',
            padding: 16,
            color: '#475569'
          }}
        >
          {isSharedView
            ? 'Cette wishlist est vide pour le moment.'
            : 'Aucune carte dans ta wishlist pour le moment. Clique sur le coeur en haut a droite des cartes pour en ajouter.'}
        </section>
      ) : (
        groupedItems.map(([setCode, setItems]) => (
          <section
            key={setCode}
            style={{
              border: '1px solid #d1d5db',
              borderRadius: 12,
              background: '#ffffffd1',
              padding: 14
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 20, color: '#0f172a' }}>{setCode}</div>
                <div style={{ color: '#475569' }}>{setItems[0]?.setName || setCode}</div>
              </div>
              <Link href={`/catalogue/${setCode}`}>Voir le set</Link>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: 20
              }}
            >
              {setItems.map((item) => {
                const hasImagePath = Boolean(item.image_path) && item.image_path !== MISSING_IMAGE_PATH
                const imageUrl = hasImagePath
                  ? `${STORAGE_BASE_URL}/${item.setCode}/${item.image_path}`
                  : CARD_PLACEHOLDER_IMAGE

                return (
                  <div
                    key={item.id}
                    style={{
                      border: '2px solid #d1d5db',
                      borderRadius: 12,
                      padding: 10,
                      background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
                      textAlign: 'center',
                      position: 'relative'
                    }}
                  >
                    {!isSharedView && (
                      <WishlistHeartButton
                        active
                        busy={busyPrintId === item.id}
                        onToggle={() => void toggleWishlist(item.id)}
                      />
                    )}

                    <img
                      src={imageUrl}
                      alt={item.name}
                      style={{ width: '100%', marginBottom: 10, borderRadius: 8 }}
                      onError={(e) => {
                        e.currentTarget.src = CARD_PLACEHOLDER_IMAGE
                      }}
                    />

                    <div style={{ fontWeight: 'bold' }}>{getDisplayPrintCode(item)}</div>
                    <div>{item.name}</div>

                    <div style={{ fontSize: 12 }}>
                      <strong>{item.rarity || '-'}</strong> - {item.type || '-'}
                    </div>

                    <div
                      style={{
                        marginTop: 10,
                        paddingTop: 10,
                        borderTop: '1px solid #e2e8f0',
                        display: 'grid',
                        gap: 6,
                        fontSize: 12,
                        color: '#334155',
                        textAlign: 'left'
                      }}
                    >
                      <div>
                        Prix: <strong>{item.price != null ? formatCurrency(item.price) : '-'}</strong>
                      </div>
                      <div
                        title={
                          item.trendScore != null
                            ? `1j: ${item.trendPct1d != null ? formatPercent(item.trendPct1d) : '-'} | 7j: ${
                                item.trendPct7d != null ? formatPercent(item.trendPct7d) : '-'
                              } | 30j: ${item.trendPct30d != null ? formatPercent(item.trendPct30d) : '-'}`
                            : 'Tendance indisponible'
                        }
                      >
                        Tendance:{' '}
                        <strong
                          style={{
                            color:
                              item.trendDirection === 'down'
                                ? '#dc2626'
                                : item.trendDirection === 'up'
                                  ? '#15803d'
                                  : '#475569'
                          }}
                        >
                          {item.trendScore != null ? formatPercent(item.trendScore) : '-'}
                        </strong>
                      </div>
                      <div>
                        Indice:{' '}
                        <strong style={{ color: '#7c3aed' }}>
                          {item.interestIndex != null ? item.interestIndex.toFixed(1) : '-'}
                        </strong>
                      </div>
                      <a
                        href={buildCardmarketProductOrSearchUrl({
                          productId: item.cardmarketProductId,
                          search: String(item.print_code || '').split('_')[0] || item.name
                        })}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: '#0369a1', fontWeight: 700, textDecoration: 'none' }}
                      >
                        Voir sur Cardmarket
                      </a>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        ))
      )}
    </div>
  )
}
