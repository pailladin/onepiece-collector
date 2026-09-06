'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabaseClient'
import { buildCardmarketProductOrSearchUrl } from '@/lib/cardmarketUrls'

const CARD_PLACEHOLDER_IMAGE =
  "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 360 500'%3E%3Crect width='360' height='500' fill='%23e2e8f0'/%3E%3Crect x='16' y='16' width='328' height='468' rx='16' fill='%23f8fafc' stroke='%23cbd5e1' stroke-width='2'/%3E%3Ctext x='180' y='235' text-anchor='middle' font-family='Arial' font-size='24' fill='%23475569'%3EPhoto a venir%3C/text%3E%3C/svg%3E"

type PriceSource = 'cardmarket' | 'us'

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

const TOP10_CLIENT_CACHE_MS = 30_000
const top10RowsCache = new Map<string, { expiresAt: number; rows: TopRow[] }>()

function formatCurrency(value: number) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR'
  }).format(value)
}

export default function CollectionTop10Page() {
  const { user, loading: authLoading } = useAuth()
  const userId = user?.id ?? null
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
    let cancelled = false

    const run = async () => {
      if (authLoading) return
      if (!userId) {
        setRows([])
        setLoading(false)
        return
      }

      const cached = top10RowsCache.get(userId)
      if (cached && cached.expiresAt > Date.now()) {
        setRows(cached.rows)
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)

      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const accessToken = sessionData.session?.access_token
        if (!accessToken) throw new Error('Session invalide. Reconnecte-toi.')

        const response = await fetch('/api/collection/top10', {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${accessToken}` }
        })
        const payload = (await response.json().catch(() => ({}))) as {
          rows?: Array<Omit<TopRow, 'imageUrl'> & { imageUrl: string | null }>
          error?: string
        }
        if (!response.ok) throw new Error(payload.error || 'Erreur chargement TOP10')

        const nextRows = (payload.rows || []).map((row) => ({
          ...row,
          imageUrl: row.imageUrl || CARD_PLACEHOLDER_IMAGE
        }))
        top10RowsCache.set(userId, {
          expiresAt: Date.now() + TOP10_CLIENT_CACHE_MS,
          rows: nextRows
        })
        if (!cancelled) setRows(nextRows)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erreur inconnue')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [authLoading, userId])

  if (authLoading || loading) {
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

      {!error && rows.length === 0 ? (
        <div style={{ marginTop: 20, color: '#475569' }}>
          Aucune carte pricee trouvee dans ta collection.
        </div>
      ) : rows.length > 0 ? (
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
      ) : null}

      <div style={{ marginTop: 10, fontSize: 12, color: '#64748b' }}>
        * Prix US (source externe), un ecart peut exister avec Cardmarket.
      </div>
    </div>
  )
}
