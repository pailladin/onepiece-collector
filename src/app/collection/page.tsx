'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabaseClient'
import {
  fetchUserSetStats,
  type SetRow,
  type SetStats
} from '@/lib/collections/fetchUserSetStats'
import { CollectionSetsGrid } from '@/components/CollectionSetsGrid'
import { aggregateCollectionRows, fetchAllUserCollectionRows } from '@/lib/collections/quantities'
import { buildCardmarketProductOrSearchUrl } from '@/lib/cardmarketUrls'

type CardPrintLookupRow = {
  id: string
  distribution_set_id: string
  print_code: string | null
}

type SetPriceRow = {
  setCode: string
  setName: string
  total: number
  pricedCount: number
  expectedCount: number
  usFallbackCount: number
}

type OpportunityTrend = {
  direction: 'up' | 'down' | 'flat' | 'unknown'
  score: number | null
  pct1d: number | null
  pct7d: number | null
  pct30d: number | null
}

type OpportunityRow = {
  id: string
  setCode: string
  printCode: string
  cardName: string
  cardmarketProductId: string | null
  unitPrice: number
  low: number | null
  avg: number | null
  trend: OpportunityTrend
  dropScore: number
  spreadScore: number
  priceAccessibility: number
  interestIndex: number
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

export default function CollectionPage() {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [sets, setSets] = useState<SetRow[]>([])
  const [stats, setStats] = useState<Record<string, SetStats>>({})
  const [loading, setLoading] = useState(true)
  const [priceLoading, setPriceLoading] = useState(false)
  const [priceError, setPriceError] = useState<string | null>(null)
  const [showPriceModal, setShowPriceModal] = useState(false)
  const [priceTotal, setPriceTotal] = useState<number | null>(null)
  const [priceSetRows, setPriceSetRows] = useState<SetPriceRow[]>([])
  const [pricePricedCount, setPricePricedCount] = useState(0)
  const [priceExpectedCount, setPriceExpectedCount] = useState(0)
  const [opportunityLoading, setOpportunityLoading] = useState(false)
  const [opportunityError, setOpportunityError] = useState<string | null>(null)
  const [showOpportunityModal, setShowOpportunityModal] = useState(false)
  const [opportunityRows, setOpportunityRows] = useState<OpportunityRow[]>([])

  useEffect(() => {
    const fetchData = async () => {
      if (!userId) {
        setLoading(false)
        setSets([])
        setStats({})
        return
      }

      setLoading(true)
      const data = await fetchUserSetStats(userId)
      setSets(data.sets)
      setStats(data.stats)
      setLoading(false)
    }

    fetchData()
  }, [userId])

  if (loading) {
    return <div style={{ padding: 40 }}>Chargement...</div>
  }

  if (!user) {
    return <div style={{ padding: 40 }}>Connecte-toi pour voir ta collection.</div>
  }

  const visibleSets = sets.filter((set) => (stats[set.code]?.owned || 0) > 0)
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR'
    }).format(value)
  const formatPercent = (value: number) =>
    `${value >= 0 ? '+' : ''}${new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }).format(value * 100)}%`

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
  const asFinite = (value: unknown) => {
    const num = Number(value)
    return Number.isFinite(num) ? num : null
  }
  const getDropMagnitude = (value: number | null) => (value != null && value < 0 ? -value : 0)

  const calculateInterestIndex = (params: {
    trend: OpportunityTrend
    low: number | null
    avg: number | null
    unitPrice: number
  }) => {
    const baseDrop = getDropMagnitude(params.trend.score)
    const drop1d = getDropMagnitude(params.trend.pct1d)
    const drop7d = getDropMagnitude(params.trend.pct7d)
    const drop30d = getDropMagnitude(params.trend.pct30d)
    const snapshotDrop = drop1d * 0.5 + drop7d * 0.3 + drop30d * 0.2
    const dropScore = baseDrop * 0.7 + snapshotDrop * 0.3

    const spreadScore =
      params.avg && params.avg > 0 && params.low != null && params.low >= 0
        ? clamp((params.avg - params.low) / params.avg, 0, 0.6)
        : 0

    // Favor cards that are still affordable for quick buy opportunities.
    const priceAccessibility = clamp(1 / (1 + params.unitPrice / 60), 0, 1)

    const interestRaw = dropScore * 0.75 + spreadScore * 0.15 + priceAccessibility * 0.1
    const interestIndex = clamp(Math.round(interestRaw * 1000) / 10, 0, 100)

    return {
      dropScore,
      spreadScore,
      priceAccessibility,
      interestIndex
    }
  }

  const calculateCollectionPrice = async () => {
    if (!user) return

    setPriceLoading(true)
    setPriceError(null)
    setShowPriceModal(false)

    try {
      const ownedRows = await fetchAllUserCollectionRows({
        supabase,
        userId: user.id
      }).catch((error) => {
        setPriceError(
          `Erreur collection: ${error instanceof Error ? error.message : 'lecture impossible'}`
        )
        setPriceTotal(null)
        setPriceSetRows([])
        return null
      })

      if (!ownedRows) return
      if (ownedRows.length === 0) {
        setPriceTotal(0)
        setPriceSetRows([])
        setPricePricedCount(0)
        setPriceExpectedCount(0)
        setShowPriceModal(true)
        return
      }

      const { totalByPrintId } = aggregateCollectionRows(ownedRows)
      const printIds = [...new Set([...totalByPrintId.keys()])]
      const printRows: CardPrintLookupRow[] = []

      for (const chunk of chunkArray(printIds, 500)) {
        const { data, error } = await supabase
          .from('card_prints')
          .select('id, distribution_set_id, print_code')
          .in('id', chunk)

        if (error) {
          setPriceError(`Erreur prints: ${error.message}`)
          setPriceTotal(null)
          setPriceSetRows([])
          return
        }

        printRows.push(...((data as CardPrintLookupRow[] | null) || []))
      }

      const setById = new Map(sets.map((set) => [set.id, set]))
      const printById = new Map(printRows.map((row) => [row.id, row]))
      const bySet = new Map<string, Array<{ printId: string; printCode: string; quantity: number }>>()

      for (const [printId, quantity] of totalByPrintId.entries()) {
        const print = printById.get(printId)
        if (!print) continue

        const setRow = setById.get(print.distribution_set_id)
        if (!setRow) continue

        const printCode = (print.print_code || '').trim().toUpperCase()
        if (!printCode) continue

        if (!bySet.has(setRow.code)) bySet.set(setRow.code, [])
        bySet.get(setRow.code)?.push({
          printId,
          printCode,
          quantity
        })
      }

      let globalTotal = 0
      let globalPricedCount = 0
      let globalExpectedCount = 0
      const rows: SetPriceRow[] = []

      await Promise.all(
        [...bySet.entries()].map(async ([setCode, ownedPrints]) => {
          const setRow = sets.find((set) => set.code === setCode)
          const expectedCount = ownedPrints.length
          globalExpectedCount += expectedCount

          const res = await fetch(`/api/optcg/prices/${setCode}`)
          const data = await res.json().catch(() => ({}))
          const pricesByPrintId: Record<string, number> = res.ok ? data?.pricesByPrintId || {} : {}
          const prices: Record<string, number> = res.ok ? data?.prices || {} : {}
          const sourcesByPrintId: Record<string, 'cardmarket' | 'us'> = res.ok ? data?.sourcesByPrintId || {} : {}
          const sources: Record<string, 'cardmarket' | 'us'> = res.ok ? data?.sources || {} : {}

          let setTotal = 0
          let setPricedCount = 0
          let setUsFallbackCount = 0

          for (const ownedPrint of ownedPrints) {
            const unitPrice = pricesByPrintId[ownedPrint.printId] ?? prices[ownedPrint.printCode]
            if (!Number.isFinite(unitPrice)) continue

            setPricedCount += 1
            setTotal += unitPrice * ownedPrint.quantity
            if ((sourcesByPrintId[ownedPrint.printId] ?? sources[ownedPrint.printCode]) !== 'cardmarket') {
              setUsFallbackCount += 1
            }
          }

          globalPricedCount += setPricedCount
          globalTotal += setTotal

          rows.push({
            setCode,
            setName: setRow?.name || setCode,
            total: setTotal,
            pricedCount: setPricedCount,
            expectedCount,
            usFallbackCount: setUsFallbackCount
          })
        })
      )

      rows.sort((a, b) => b.total - a.total || a.setCode.localeCompare(b.setCode))

      setPriceTotal(globalTotal)
      setPriceSetRows(rows)
      setPricePricedCount(globalPricedCount)
      setPriceExpectedCount(globalExpectedCount)
      setShowPriceModal(true)
    } catch {
      setPriceError('Erreur serveur pendant le calcul')
      setPriceTotal(null)
      setPriceSetRows([])
    } finally {
      setPriceLoading(false)
    }
  }

  const calculateOpportunities = async () => {
    if (!user || visibleSets.length === 0) return

    setOpportunityLoading(true)
    setOpportunityError(null)
    setShowOpportunityModal(false)

    try {
      const ownedRows = await fetchAllUserCollectionRows({
        supabase,
        userId: user.id
      })
      const ownedAggregate = aggregateCollectionRows(ownedRows)

      const rowsBySet = await Promise.all(
        visibleSets.map(async (setRow) => {
          const { data: printsData, error: printsError } = await supabase
            .from('card_prints')
            .select('id, print_code, card_id')
            .eq('distribution_set_id', setRow.id)

          if (printsError) throw new Error(`Erreur prints (${setRow.code}): ${printsError.message}`)

          const prints =
            ((printsData as Array<{ id: string; print_code: string | null; card_id: string }> | null) ||
              []) as Array<{ id: string; print_code: string | null; card_id: string }>
          if (prints.length === 0) return [] as OpportunityRow[]

          const printIds = prints.map((row) => row.id)
          const ownedByPrintId = new Map<string, number>()

          for (const printId of printIds) {
            const quantity = ownedAggregate.totalByPrintId.get(printId)
            if (quantity && quantity > 0) {
              ownedByPrintId.set(printId, quantity)
            }
          }

          const cardIds = [...new Set(prints.map((row) => row.card_id).filter(Boolean))]
          const cardNameById = new Map<string, string>()
          for (const idsChunk of chunkArray(cardIds, 300)) {
            const { data: cardsData, error: cardsError } = await supabase
              .from('cards')
              .select('id, base_code, card_translations(name, locale)')
              .in('id', idsChunk)
            if (cardsError) throw new Error(`Erreur cards (${setRow.code}): ${cardsError.message}`)

            ;(
              ((cardsData as Array<{
                id: string
                base_code: string | null
                card_translations?: Array<{ name: string; locale: string }> | null
              }> | null) || []) as Array<{
                id: string
                base_code: string | null
                card_translations?: Array<{ name: string; locale: string }> | null
              }>
            ).forEach((card) => {
              const fr =
                card.card_translations?.find((t) => t.locale === 'fr')?.name ||
                card.card_translations?.[0]?.name
              cardNameById.set(card.id, fr || card.base_code || 'Carte')
            })
          }

          const res = await fetch(`/api/optcg/prices/${encodeURIComponent(setRow.code)}`)
          const pricing = await res.json().catch(() => ({}))
          if (!res.ok) return [] as OpportunityRow[]

          const pricesByPrintId: Record<string, number> = pricing?.pricesByPrintId || {}
          const prices: Record<string, number> = pricing?.prices || {}
          const sourcesByPrintId: Record<string, 'cardmarket' | 'us'> = pricing?.sourcesByPrintId || {}
          const sources: Record<string, 'cardmarket' | 'us'> = pricing?.sources || {}
          const rangesByPrintId: Record<string, { low: number | null; avg: number | null }> =
            pricing?.cardmarketRangesByPrintId || {}
          const ranges: Record<string, { low: number | null; avg: number | null }> =
            pricing?.cardmarketRanges || {}
          const cardmarketProductIdsByPrintId: Record<string, string> =
            pricing?.cardmarketProductIdsByPrintId || {}
          const cardmarketProductIds: Record<string, string> = pricing?.cardmarketProductIds || {}
          const trendsByPrintId: Record<string, OpportunityTrend> = pricing?.cardmarketTrendsByPrintId || {}
          const trends: Record<string, OpportunityTrend> = pricing?.cardmarketTrends || {}

          const localRows: OpportunityRow[] = []
          for (const print of prints) {
            const quantity = ownedByPrintId.get(print.id) || 0
            if (quantity > 0) continue

            const printCode = (print.print_code || '').trim().toUpperCase()
            if (!printCode) continue

            const unitPrice = asFinite(pricesByPrintId[print.id] ?? prices[printCode])
            if (unitPrice == null) continue
            if ((sourcesByPrintId[print.id] ?? sources[printCode]) !== 'cardmarket') continue

            const trend = trendsByPrintId[print.id] || trends[printCode] || {
              direction: 'unknown',
              score: null,
              pct1d: null,
              pct7d: null,
              pct30d: null
            }
            const low = asFinite((rangesByPrintId[print.id] || ranges[printCode])?.low)
            const avg = asFinite((rangesByPrintId[print.id] || ranges[printCode])?.avg)

            const scoring = calculateInterestIndex({
              trend,
              low,
              avg,
              unitPrice
            })

            // Keep only real downward opportunities.
            if (scoring.dropScore < 0.01) continue

            localRows.push({
              id: `${setRow.code}:${print.id}`,
              setCode: setRow.code,
              printCode,
              cardName: cardNameById.get(print.card_id) || printCode,
              cardmarketProductId:
                cardmarketProductIdsByPrintId[print.id] || cardmarketProductIds[printCode] || null,
              unitPrice,
              low,
              avg,
              trend,
              dropScore: scoring.dropScore,
              spreadScore: scoring.spreadScore,
              priceAccessibility: scoring.priceAccessibility,
              interestIndex: scoring.interestIndex
            })
          }

          return localRows
        })
      )

      const flattened = rowsBySet
        .flat()
        .sort(
          (a, b) =>
            b.interestIndex - a.interestIndex ||
            b.dropScore - a.dropScore ||
            a.unitPrice - b.unitPrice ||
            a.printCode.localeCompare(b.printCode)
        )

      setOpportunityRows(flattened)
      setShowOpportunityModal(true)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur serveur'
      setOpportunityError(message)
      setOpportunityRows([])
    } finally {
      setOpportunityLoading(false)
    }
  }

  return (
    <>
      <CollectionSetsGrid
        title="Ma Collection"
        sets={visibleSets}
        stats={stats}
        getSetHref={(setCode) => `/collection/${setCode}`}
        headerActions={
          <div className="collection-page-actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Link
              href="/collection/wishlist"
              className="collection-page-action collection-page-action-pink"
              style={{
                border: '1px solid #db2777',
                background: '#db2777',
                color: '#fff',
                borderRadius: 8,
                padding: '8px 12px',
                textDecoration: 'none'
              }}
            >
              Wishlist
            </Link>
            <Link
              href="/collection/history"
              className="collection-page-action collection-page-action-blue"
              style={{
                border: '1px solid #1d4ed8',
                background: '#1d4ed8',
                color: '#fff',
                borderRadius: 8,
                padding: '8px 12px',
                textDecoration: 'none'
              }}
            >
              Suivi valeur
            </Link>
            <Link
              href="/collection/top10"
              className="collection-page-action collection-page-action-green"
              style={{
                border: '1px solid #0f766e',
                background: '#0f766e',
                color: '#fff',
                borderRadius: 8,
                padding: '8px 12px',
                textDecoration: 'none'
              }}
            >
              TOP10 cartes
            </Link>
            <button
              onClick={calculateCollectionPrice}
              disabled={priceLoading || visibleSets.length === 0}
              className="collection-page-action collection-page-action-blue"
              style={{
                border: '1px solid #2563eb',
                background: '#2563eb',
                color: '#fff',
                borderRadius: 8,
                padding: '8px 12px',
                cursor: priceLoading || visibleSets.length === 0 ? 'not-allowed' : 'pointer',
                opacity: priceLoading || visibleSets.length === 0 ? 0.6 : 1
              }}
            >
              {priceLoading ? 'Calcul en cours...' : 'Calculer prix collection'}
            </button>
            <button
              onClick={calculateOpportunities}
              disabled={opportunityLoading || visibleSets.length === 0}
              className="collection-page-action collection-page-action-purple"
              style={{
                border: '1px solid #7c3aed',
                background: '#7c3aed',
                color: '#fff',
                borderRadius: 8,
                padding: '8px 12px',
                cursor: opportunityLoading || visibleSets.length === 0 ? 'not-allowed' : 'pointer',
                opacity: opportunityLoading || visibleSets.length === 0 ? 0.6 : 1
              }}
            >
              {opportunityLoading ? 'Analyse en cours...' : "Opportunites d'achat"}
            </button>
          </div>
        }
      />

      {priceError && (
        <div style={{ padding: '0 40px 24px', color: '#b91c1c', fontSize: 13 }}>
          {priceError}
        </div>
      )}
      {opportunityError && (
        <div style={{ padding: '0 40px 24px', color: '#b91c1c', fontSize: 13 }}>
          {opportunityError}
        </div>
      )}

      {showPriceModal && (
        <div
          onClick={() => setShowPriceModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 12,
              width: 'min(760px, 100%)',
              maxHeight: '85vh',
              overflow: 'auto',
              padding: 18
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
              <div>
                <h2 style={{ margin: 0, fontSize: 18 }}>Valeur de la collection</h2>
                <div style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>
                  Total estime: <strong>{formatCurrency(priceTotal || 0)}</strong> (
                  {pricePricedCount}/{priceExpectedCount} cartes pricees)
                </div>
                {priceSetRows.some((row) => row.usFallbackCount > 0) && (
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                    * Prix US (source externe), un ecart peut exister avec Cardmarket.
                  </div>
                )}
              </div>
              <button onClick={() => setShowPriceModal(false)}>Fermer</button>
            </div>

            <div
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                overflow: 'hidden'
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '120px 1fr 140px 130px',
                  gap: 10,
                  padding: '10px 12px',
                  background: '#f8fafc',
                  fontWeight: 700,
                  fontSize: 13
                }}
              >
                <div>Set</div>
                <div>Nom</div>
                <div>Couverture</div>
                <div style={{ textAlign: 'right' }}>Total</div>
              </div>

              {priceSetRows.length === 0 ? (
                <div style={{ padding: 12 }}>Aucun detail disponible.</div>
              ) : (
                priceSetRows.map((row) => (
                  <div
                    key={row.setCode}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '120px 1fr 140px 130px',
                      gap: 10,
                      padding: '10px 12px',
                      borderTop: '1px solid #e2e8f0',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <strong>{row.setCode}</strong>
                    </div>
                    <div>{row.setName}</div>
                    <div style={{ fontSize: 13, color: '#475569' }}>
                      {row.pricedCount}/{row.expectedCount}
                    </div>
                    <div style={{ textAlign: 'right', fontWeight: 700 }}>
                      <span
                        title={
                          row.usFallbackCount > 0
                            ? 'Inclut des prix US (source externe), un ecart peut exister'
                            : 'Prix Cardmarket (avg_price)'
                        }
                      >
                        {formatCurrency(row.total)}
                        {row.usFallbackCount > 0 ? '*' : ''}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      {showOpportunityModal && (
        <div
          onClick={() => setShowOpportunityModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 12,
              width: 'min(1080px, 100%)',
              maxHeight: '85vh',
              overflow: 'auto',
              padding: 18
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
              <div>
                <h2 style={{ margin: 0, fontSize: 18 }}>Opportunites d'achat (cartes en baisse)</h2>
                <div style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>
                  Tri par indice d'interet (baisse + spread + accessibilite prix).
                </div>
              </div>
              <button onClick={() => setShowOpportunityModal(false)}>Fermer</button>
            </div>

            <div
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                overflow: 'hidden'
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '90px 130px 1.4fr 110px 140px 110px 130px',
                  gap: 10,
                  padding: '10px 12px',
                  background: '#f8fafc',
                  fontWeight: 700,
                  fontSize: 13
                }}
              >
                <div>Indice</div>
                <div>Set</div>
                <div>Carte</div>
                <div>Prix</div>
                <div>Baisse</div>
                <div>Lien</div>
                <div>Signal</div>
              </div>

              {opportunityRows.length === 0 ? (
                <div style={{ padding: 12 }}>
                  Aucune opportunite detectee pour l'instant sur les cartes manquantes.
                </div>
              ) : (
                opportunityRows.map((row) => (
                  <div
                    key={row.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '90px 130px 1.4fr 110px 140px 110px 130px',
                      gap: 10,
                      padding: '10px 12px',
                      borderTop: '1px solid #e2e8f0',
                      alignItems: 'center'
                    }}
                  >
                    <div style={{ fontWeight: 800, color: '#7c3aed' }}>
                      {new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(
                        row.interestIndex
                      )}
                    </div>
                    <div>
                      <strong>{row.setCode}</strong>
                    </div>
                    <div>
                      <div style={{ fontWeight: 700 }}>{row.printCode}</div>
                      <div>{row.cardName}</div>
                    </div>
                    <div>{formatCurrency(row.unitPrice)}</div>
                    <div
                      title={`1j: ${
                        row.trend.pct1d != null ? formatPercent(row.trend.pct1d) : '-'
                      } | 7j: ${row.trend.pct7d != null ? formatPercent(row.trend.pct7d) : '-'} | 30j: ${
                        row.trend.pct30d != null ? formatPercent(row.trend.pct30d) : '-'
                      }`}
                      style={{ color: '#dc2626', fontWeight: 700 }}
                    >
                      {row.trend.score != null ? formatPercent(row.trend.score) : '-'}
                    </div>
                    <a
                      href={buildCardmarketProductOrSearchUrl({
                        productId: row.cardmarketProductId,
                        search: row.printCode.split('_')[0] || row.printCode
                      })}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: '#0369a1', fontWeight: 700 }}
                    >
                      Cardmarket
                    </a>
                    <div
                      title={`Low: ${
                        row.low != null ? formatCurrency(row.low) : '-'
                      } | Avg: ${row.avg != null ? formatCurrency(row.avg) : '-'}`}
                      style={{
                        fontWeight: 700,
                        color:
                          row.trend.direction === 'down'
                            ? '#dc2626'
                            : row.trend.direction === 'up'
                              ? '#15803d'
                              : '#64748b'
                      }}
                    >
                      {row.trend.direction === 'down'
                        ? 'baisse'
                        : row.trend.direction === 'up'
                          ? 'hausse'
                          : row.trend.direction === 'flat'
                            ? 'stable'
                            : '-'}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

