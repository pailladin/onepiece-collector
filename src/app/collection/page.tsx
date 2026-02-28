'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabaseClient'
import {
  fetchUserSetStats,
  type SetRow,
  type SetStats
} from '@/lib/collections/fetchUserSetStats'
import { CollectionSetsGrid } from '@/components/CollectionSetsGrid'

type CollectionOwnedRow = {
  card_print_id: string
  quantity: number
}

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

  useEffect(() => {
    const fetchData = async () => {
      if (!user) {
        setLoading(false)
        setSets([])
        setStats({})
        return
      }

      setLoading(true)
      const data = await fetchUserSetStats(user.id)
      setSets(data.sets)
      setStats(data.stats)
      setLoading(false)
    }

    fetchData()
  }, [user])

  if (loading) {
    return <div style={{ padding: 40 }}>Chargement...</div>
  }

  if (!user) {
    return <div style={{ padding: 40 }}>Connecte-toi pour voir ta collection.</div>
  }

  const visibleSets = sets.filter((set) => (stats[set.code]?.owned || 0) > 0)
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(value)

  const calculateCollectionPrice = async () => {
    if (!user) return

    setPriceLoading(true)
    setPriceError(null)
    setShowPriceModal(false)

    try {
      const { data: ownedData, error: ownedError } = await supabase
        .from('collections')
        .select('card_print_id, quantity')
        .eq('user_id', user.id)
        .gt('quantity', 0)

      if (ownedError) {
        setPriceError(`Erreur collection: ${ownedError.message}`)
        setPriceTotal(null)
        setPriceSetRows([])
        return
      }

      const ownedRows = (ownedData as CollectionOwnedRow[] | null) || []
      if (ownedRows.length === 0) {
        setPriceTotal(0)
        setPriceSetRows([])
        setPricePricedCount(0)
        setPriceExpectedCount(0)
        setShowPriceModal(true)
        return
      }

      const printIds = [...new Set(ownedRows.map((row) => row.card_print_id))]
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
      const bySet = new Map<string, Array<{ printCode: string; quantity: number }>>()

      for (const owned of ownedRows) {
        const print = printById.get(owned.card_print_id)
        if (!print) continue

        const setRow = setById.get(print.distribution_set_id)
        if (!setRow) continue

        const printCode = (print.print_code || '').trim().toUpperCase()
        if (!printCode) continue

        if (!bySet.has(setRow.code)) bySet.set(setRow.code, [])
        bySet.get(setRow.code)?.push({
          printCode,
          quantity: owned.quantity || 0
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
          const prices: Record<string, number> = res.ok ? data?.prices || {} : {}

          let setTotal = 0
          let setPricedCount = 0

          for (const ownedPrint of ownedPrints) {
            const unitPrice = prices[ownedPrint.printCode]
            if (!Number.isFinite(unitPrice)) continue

            setPricedCount += 1
            setTotal += unitPrice * ownedPrint.quantity
          }

          globalPricedCount += setPricedCount
          globalTotal += setTotal

          rows.push({
            setCode,
            setName: setRow?.name || setCode,
            total: setTotal,
            pricedCount: setPricedCount,
            expectedCount
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

  return (
    <>
      <CollectionSetsGrid
        title="Ma Collection"
        sets={visibleSets}
        stats={stats}
        getSetHref={(setCode) => `/collection/${setCode}`}
        headerActions={
          <button
            onClick={calculateCollectionPrice}
            disabled={priceLoading || visibleSets.length === 0}
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
        }
      />

      {priceError && (
        <div style={{ padding: '0 40px 24px', color: '#b91c1c', fontSize: 13 }}>
          {priceError}
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
                      {formatCurrency(row.total)}
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
