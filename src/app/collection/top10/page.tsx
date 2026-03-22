'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { DEFAULT_LOCALE } from '@/lib/locale'
import { supabase } from '@/lib/supabaseClient'
import { getDisplayPrintCode } from '@/lib/cards/printDisplay'
import { aggregateCollectionRows, fetchAllUserCollectionRows } from '@/lib/collections/quantities'
import { buildCardmarketProductOrSearchUrl } from '@/lib/cardmarketUrls'

const STORAGE_BASE_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/cards-images`
const MISSING_IMAGE_PATH = '__missing__'
const CARD_PLACEHOLDER_IMAGE =
  "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 360 500'%3E%3Crect width='360' height='500' fill='%23e2e8f0'/%3E%3Crect x='16' y='16' width='328' height='468' rx='16' fill='%23f8fafc' stroke='%23cbd5e1' stroke-width='2'/%3E%3Ctext x='180' y='235' text-anchor='middle' font-family='Arial' font-size='24' fill='%23475569'%3EPhoto a venir%3C/text%3E%3C/svg%3E"

type PriceSource = 'cardmarket' | 'us'

type PrintRow = {
  id: string
  print_code: string | null
  distribution_set_id: string
  card_id: string
  image_path: string | null
  variant_type: string | null
}

type SetRow = {
  id: string
  code: string
  name: string | null
}

type CardRow = {
  id: string
  base_code: string
  rarity: string | null
  card_translations?: Array<{
    name: string
    locale: string
  }> | null
}

type TopRow = {
  printId: string
  printCode: string
  displayCode: string
  name: string
  setCode: string
  quantity: number
  unitPrice: number
  totalPrice: number
  source: PriceSource
  cardmarketProductId: string | null
  imageUrl: string
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

function normalizePrintCode(value: string | null | undefined) {
  return (value || '').trim().toUpperCase()
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR'
  }).format(value)
}

export default function CollectionTop10Page() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<TopRow[]>([])
  const [isCompactView, setIsCompactView] = useState(false)

  useEffect(() => {
    const syncCompactView = () => {
      if (typeof window === 'undefined') return
      setIsCompactView(window.innerWidth <= 900)
    }

    syncCompactView()
    window.addEventListener('resize', syncCompactView)
    return () => window.removeEventListener('resize', syncCompactView)
  }, [])

  useEffect(() => {
    const run = async () => {
      if (!user) {
        setRows([])
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)

      try {
        const ownedRows = await fetchAllUserCollectionRows({
          supabase,
          userId: user.id
        })
        if (ownedRows.length === 0) {
          setRows([])
          setLoading(false)
          return
        }

        const { totalByPrintId } = aggregateCollectionRows(ownedRows)
        const printIds = [...new Set([...totalByPrintId.keys()])]
        const prints: PrintRow[] = []
        for (const idsChunk of chunkArray(printIds, 500)) {
          const { data, error: printsError } = await supabase
            .from('card_prints')
            .select('id, print_code, distribution_set_id, card_id, image_path, variant_type')
            .in('id', idsChunk)
          if (printsError) throw new Error(`Erreur prints: ${printsError.message}`)
          prints.push(...(((data as PrintRow[] | null) || []) as PrintRow[]))
        }

        const setIds = [...new Set(prints.map((row) => row.distribution_set_id))]
        const sets: SetRow[] = []
        for (const idsChunk of chunkArray(setIds, 200)) {
          const { data, error: setsError } = await supabase
            .from('sets')
            .select('id, code, name')
            .in('id', idsChunk)
          if (setsError) throw new Error(`Erreur sets: ${setsError.message}`)
          sets.push(...(((data as SetRow[] | null) || []) as SetRow[]))
        }

        const cardIds = [...new Set(prints.map((row) => row.card_id))]
        const cards: CardRow[] = []
        for (const idsChunk of chunkArray(cardIds, 200)) {
          const { data, error: cardsError } = await supabase
            .from('cards')
            .select(
              `
              id,
              base_code,
              rarity,
              card_translations (
                name,
                locale
              )
            `
            )
            .in('id', idsChunk)
          if (cardsError) throw new Error(`Erreur cards: ${cardsError.message}`)
          cards.push(...(((data as CardRow[] | null) || []) as CardRow[]))
        }

        const setById = new Map(sets.map((row) => [row.id, row]))
        const printById = new Map(prints.map((row) => [row.id, row]))
        const cardById = new Map(cards.map((row) => [row.id, row]))
        const pricesByPrintId = new Map<string, number>()
        const sourceByPrintId = new Map<string, PriceSource>()
        const productIdByPrintId = new Map<string, string>()

        const setCodes = [...new Set(sets.map((set) => set.code))]
        await Promise.all(
          setCodes.map(async (setCode) => {
            const res = await fetch(`/api/optcg/prices/${encodeURIComponent(setCode)}`)
            const data = await res.json().catch(() => ({}))
            if (!res.ok) return

            const prices: Record<string, number> = data?.pricesByPrintId || {}
            const sources: Record<string, PriceSource> = data?.sourcesByPrintId || {}
            const cardmarketProductIds: Record<string, string> = data?.cardmarketProductIdsByPrintId || {}

            for (const [printId, value] of Object.entries(prices)) {
              if (!Number.isFinite(value)) continue
              pricesByPrintId.set(printId, value)
              sourceByPrintId.set(printId, sources[printId] === 'cardmarket' ? 'cardmarket' : 'us')
            }

            for (const [printId, productId] of Object.entries(cardmarketProductIds)) {
              if (!productId) continue
              productIdByPrintId.set(printId, String(productId))
            }
          })
        )

        const nextRows: TopRow[] = []
        for (const [printId, quantity] of totalByPrintId.entries()) {
          const print = printById.get(printId)
          if (!print) continue

          const normalizedPrintCode = normalizePrintCode(print.print_code)
          if (!normalizedPrintCode) continue

          const unitPriceRaw = pricesByPrintId.get(print.id)
          if (!Number.isFinite(unitPriceRaw)) continue
          const unitPrice = Number(unitPriceRaw)

          const set = setById.get(print.distribution_set_id)
          const setCode = set?.code || ''
          const card = cardById.get(print.card_id)
          const name =
            card?.card_translations?.find((t) => t.locale === DEFAULT_LOCALE)?.name ||
            card?.card_translations?.[0]?.name ||
            card?.base_code ||
            normalizedPrintCode

          const imageUrl =
            print.image_path && print.image_path !== MISSING_IMAGE_PATH && setCode
              ? `${STORAGE_BASE_URL}/${setCode}/${print.image_path}`
              : CARD_PLACEHOLDER_IMAGE

          const totalPrice = unitPrice * quantity
          const source = sourceByPrintId.get(print.id) || 'us'
          const cardmarketProductId = productIdByPrintId.get(print.id) || null

          nextRows.push({
            printId: print.id,
            printCode: normalizedPrintCode,
            displayCode: getDisplayPrintCode({
              print_code: print.print_code,
              variant_type: print.variant_type
            }),
            name,
            setCode,
            quantity,
            unitPrice,
            totalPrice,
            source,
            cardmarketProductId,
            imageUrl
          })
        }

        nextRows.sort((a, b) => b.totalPrice - a.totalPrice || b.unitPrice - a.unitPrice)
        setRows(nextRows.slice(0, 10))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur inconnue')
      } finally {
        setLoading(false)
      }
    }

    void run()
  }, [user])

  if (loading) {
    return <div style={{ padding: 40 }}>Chargement TOP10...</div>
  }

  if (!user) {
    return <div style={{ padding: 40 }}>Connecte-toi pour voir ton TOP10.</div>
  }

  return (
    <div style={{ padding: isCompactView ? 12 : 40 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: isCompactView ? 'flex-start' : 'center',
          flexDirection: isCompactView ? 'column' : 'row',
          gap: isCompactView ? 8 : 0
        }}
      >
        <h1 style={{ margin: 0 }}>TOP 10 - Plus grosses valeurs (prix x quantite)</h1>
        <Link href="/collection" style={{ color: '#1d4ed8', textDecoration: 'none' }}>
          Retour collection
        </Link>
      </div>

      {error && <div style={{ marginTop: 12, color: '#b91c1c' }}>{error}</div>}

      {rows.length === 0 ? (
        <div style={{ marginTop: 20, color: '#475569' }}>
          Aucune carte pricee trouvee dans ta collection.
        </div>
      ) : (
        <div style={{ marginTop: 20, display: 'grid', gap: 10 }}>
          {rows.map((row, index) => {
            const baseCode = (row.printCode || '').split('_')[0] || ''
            const link = buildCardmarketProductOrSearchUrl({
              productId: row.cardmarketProductId,
              search: baseCode
            })

            return (
              <div
                key={row.printId}
                style={{
                  border: '1px solid #d1d5db',
                  borderRadius: 10,
                  padding: isCompactView ? 12 : 10,
                  display: 'grid',
                  gridTemplateColumns: isCompactView
                    ? '1fr'
                    : '34px 64px 1.7fr 0.8fr 0.7fr 0.9fr 0.9fr 0.9fr',
                  gap: 10,
                  alignItems: 'center',
                  background: '#fff'
                }}
              >
                {isCompactView ? (
                  <>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ fontWeight: 800, color: '#334155', minWidth: 28 }}>#{index + 1}</div>
                      <img
                        src={row.imageUrl}
                        alt={row.name}
                        style={{ width: 56, height: 78, objectFit: 'cover', borderRadius: 6, flex: '0 0 auto' }}
                        onError={(e) => {
                          e.currentTarget.src = CARD_PLACEHOLDER_IMAGE
                        }}
                      />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700 }}>{row.displayCode}</div>
                        <div>{row.name}</div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{row.setCode}</div>
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                        gap: 8,
                        fontSize: 13
                      }}
                    >
                      <div style={{ color: '#64748b' }}>
                        Prix <span style={{ fontWeight: 700, color: '#0f172a' }}>{formatCurrency(row.unitPrice)}</span>
                      </div>
                      <div style={{ color: '#64748b', textAlign: 'right' }}>
                        Qte <span style={{ fontWeight: 700, color: '#0f172a' }}>x{row.quantity}</span>
                      </div>
                      <div style={{ color: '#64748b' }}>
                        Total <span style={{ fontWeight: 700, color: '#0f172a' }}>{formatCurrency(row.totalPrice)}</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <a
                          href={link}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            color: row.source === 'cardmarket' ? '#047857' : '#92400e',
                            fontWeight: 700,
                            textDecoration: 'none'
                          }}
                        >
                          {row.source === 'cardmarket' ? 'Cardmarket' : 'US*'}
                        </a>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontWeight: 700, color: '#334155' }}>#{index + 1}</div>
                    <img
                      src={row.imageUrl}
                      alt={row.name}
                      style={{ width: 56, height: 78, objectFit: 'cover', borderRadius: 6 }}
                      onError={(e) => {
                        e.currentTarget.src = CARD_PLACEHOLDER_IMAGE
                      }}
                    />
                    <div>
                      <div style={{ fontWeight: 700 }}>{row.displayCode}</div>
                      <div>{row.name}</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>{row.setCode}</div>
                    </div>
                    <div style={{ fontWeight: 700 }}>{formatCurrency(row.unitPrice)}</div>
                    <div>x{row.quantity}</div>
                    <div style={{ fontWeight: 700 }}>{formatCurrency(row.totalPrice)}</div>
                    <a
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        fontSize: 12,
                        color: row.source === 'cardmarket' ? '#047857' : '#92400e',
                        fontWeight: 700,
                        textDecoration: 'none'
                      }}
                    >
                      {row.source === 'cardmarket' ? 'Cardmarket' : 'US*'}
                    </a>
                    <div />
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div style={{ marginTop: 10, fontSize: 12, color: '#64748b' }}>
        * Prix US (source externe), un ecart peut exister avec Cardmarket.
      </div>
    </div>
  )
}
