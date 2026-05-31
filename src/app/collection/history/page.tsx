'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabaseClient'

type WeekRow = {
  periodStart: string
  periodEnd: string
  total: {
    value: number
    pricedCount: number
    expectedCount: number
    usFallbackCount: number
    currency: string
  } | null
  sets: Array<{
    setCode: string
    setName: string
    value: number
    pricedCount: number
    expectedCount: number
    usFallbackCount: number
  }>
}

type SetOption = {
  code: string
  name: string
}

function formatCurrency(value: number, currency = 'EUR') {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency
  }).format(value)
}

function shortDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat('fr-FR').format(parsed)
}

function weekLabel(start: string, end: string) {
  return `${shortDate(start)} -> ${shortDate(end)}`
}

function formatCardCount(count: number) {
  return `${count} ${count > 1 ? 'cartes' : 'carte'}`
}

export default function CollectionHistoryPage() {
  const { user, loading: authLoading } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [weeks, setWeeks] = useState<WeekRow[]>([])
  const [selectedSetCode, setSelectedSetCode] = useState('TOTAL')
  const [activePointIndex, setActivePointIndex] = useState<number | null>(null)

  const setOptions = useMemo<SetOption[]>(
    () => {
      const map = new Map<string, string>()
      for (const week of weeks) {
        for (const row of week.sets) {
          if (!map.has(row.setCode)) {
            map.set(row.setCode, row.setName || row.setCode)
          }
        }
      }
      return [...map.entries()]
        .map(([code, name]) => ({ code, name }))
        .sort((a, b) => a.code.localeCompare(b.code))
    },
    [weeks]
  )

  const series = useMemo(
    () =>
      weeks
        .map((week) => ({
          x: week.periodStart,
          periodStart: week.periodStart,
          periodEnd: week.periodEnd,
          value:
            selectedSetCode === 'TOTAL'
              ? week.total?.value || 0
              : week.sets.find((row) => row.setCode === selectedSetCode)?.value || 0,
          cardCount:
            selectedSetCode === 'TOTAL'
              ? week.total?.expectedCount || 0
              : week.sets.find((row) => row.setCode === selectedSetCode)?.expectedCount || 0,
          currency: week.total?.currency || 'EUR'
        })),
    [weeks, selectedSetCode]
  )

  const maxValue = Math.max(1, ...series.map((row) => row.value))
  const minValue = Math.min(...series.map((row) => row.value), maxValue)
  const selectedSetLabel =
    selectedSetCode === 'TOTAL'
      ? 'Collection complete'
      : setOptions.find((row) => row.code === selectedSetCode)?.name || selectedSetCode

  const loadHistory = async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      const res = await fetch('/api/collection/value-history', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(payload?.error || 'Erreur chargement historique')
        setWeeks([])
        setSelectedSetCode('TOTAL')
        return
      }
      const nextWeeks = Array.isArray(payload?.weeks) ? payload.weeks : []
      setWeeks(nextWeeks)
      setSelectedSetCode((prev) => (prev ? prev : 'TOTAL'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!user) {
      setLoading(false)
      setWeeks([])
      return
    }
    loadHistory()
  }, [user])

  if (authLoading || loading) {
    return <div style={{ padding: 40 }}>Chargement suivi valeur...</div>
  }
  if (!user) {
    return <div style={{ padding: 40 }}>Connecte-toi pour voir le suivi de valeur.</div>
  }

  return (
    <div style={{ padding: 40, display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div>
          <h1 style={{ margin: 0 }}>Suivi valeur collection</h1>
          <div style={{ marginTop: 4, color: '#475569', fontSize: 14 }}>
            Evolution hebdomadaire par set. Chaque point correspond a un snapshot pris en fin de semaine.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/collection" style={{ color: '#1d4ed8', textDecoration: 'none', alignSelf: 'center' }}>
            Retour collection
          </Link>
        </div>
      </div>

      {error && (
        <div style={{ border: '1px solid #fecaca', color: '#b91c1c', background: '#fef2f2', borderRadius: 8, padding: 10 }}>
          {error}
        </div>
      )}

      <div style={{ border: '1px solid #cbd5e1', borderRadius: 12, padding: 14, background: '#fff' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 700 }}>Set</div>
          <select
            value={selectedSetCode}
            onChange={(event) => setSelectedSetCode(event.target.value)}
            style={{ minWidth: 240, padding: '6px 8px' }}
          >
            <option value="TOTAL">Collection complete</option>
            {setOptions.map((row) => (
              <option key={row.code} value={row.code}>
                {row.code} - {row.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ fontWeight: 700, marginBottom: 8 }}>Evolution: {selectedSetLabel}</div>
        <div style={{ marginBottom: 12, color: '#64748b', fontSize: 13 }}>
          Date affichee = date du snapshot hebdomadaire, pas date de debut de semaine.
        </div>
        {series.length === 0 ? (
          <div style={{ color: '#64748b' }}>Aucune semaine sauvegardee.</div>
        ) : (
          <div>
            <svg viewBox="0 0 760 260" style={{ width: '100%', height: 'auto', display: 'block' }}>
              <rect x="0" y="0" width="760" height="260" fill="#f8fafc" rx="10" />
              <line x1="56" y1="20" x2="56" y2="220" stroke="#cbd5e1" />
              <line x1="56" y1="220" x2="740" y2="220" stroke="#cbd5e1" />
              {(() => {
                const points = series.map((row, index) => {
                  const x = 56 + (series.length === 1 ? 0 : (index / (series.length - 1)) * 684)
                  const span = Math.max(1, maxValue - minValue)
                  const y = 220 - ((row.value - minValue) / span) * 180
                  return { x, y, row, index }
                })
                const polyline = points.map((p) => `${p.x},${p.y}`).join(' ')
                const activePoint =
                  activePointIndex === null ? null : points.find((point) => point.index === activePointIndex) || null
                const bubbleWidth = 116
                const bubbleHeight = 48
                const bubbleX = activePoint
                  ? Math.min(Math.max(activePoint.x - bubbleWidth / 2, 8), 760 - bubbleWidth - 8)
                  : 0
                const bubbleY = activePoint
                  ? activePoint.y < 78
                    ? activePoint.y + 14
                    : activePoint.y - bubbleHeight - 14
                  : 0
                return (
                  <>
                    <polyline
                      points={polyline}
                      fill="none"
                      stroke="#2563eb"
                      strokeWidth="3"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                    {points.map((p) => (
                      <g key={p.row.x}>
                        <circle cx={p.x} cy={p.y} r="4" fill="#0ea5e9" />
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r="13"
                          fill="transparent"
                          style={{ cursor: 'pointer' }}
                          tabIndex={0}
                          role="img"
                          aria-label={`${shortDate(p.row.periodEnd)}: ${formatCurrency(
                            p.row.value,
                            p.row.currency
                          )}, ${formatCardCount(p.row.cardCount)}`}
                          onPointerEnter={() => setActivePointIndex(p.index)}
                          onPointerLeave={() => setActivePointIndex(null)}
                          onFocus={() => setActivePointIndex(p.index)}
                          onBlur={() => setActivePointIndex(null)}
                          onClick={() => setActivePointIndex((current) => (current === p.index ? null : p.index))}
                        />
                        <text x={p.x} y={238} textAnchor="middle" fontSize="10" fill="#475569">
                          {shortDate(p.row.periodEnd)}
                        </text>
                      </g>
                    ))}
                    {activePoint && (
                      <g pointerEvents="none">
                        <rect
                          x={bubbleX}
                          y={bubbleY}
                          width={bubbleWidth}
                          height={bubbleHeight}
                          rx="6"
                          fill="#0f172a"
                          opacity="0.94"
                        />
                        <text x={bubbleX + 8} y={bubbleY + 16} fontSize="10" fill="#e2e8f0">
                          {shortDate(activePoint.row.periodEnd)}
                        </text>
                        <text x={bubbleX + 8} y={bubbleY + 31} fontSize="11" fontWeight="700" fill="#ffffff">
                          {formatCurrency(activePoint.row.value, activePoint.row.currency)}
                        </text>
                        <text x={bubbleX + 8} y={bubbleY + 43} fontSize="9" fill="#cbd5e1">
                          {formatCardCount(activePoint.row.cardCount)}
                        </text>
                      </g>
                    )}
                  </>
                )
              })()}
              <text x="8" y="24" fontSize="11" fill="#334155">
                {formatCurrency(maxValue, series[0]?.currency || 'USD')}
              </text>
              <text x="8" y="222" fontSize="11" fill="#334155">
                {formatCurrency(minValue, series[0]?.currency || 'USD')}
              </text>
            </svg>
            <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
              {[...series].reverse().map((row) => (
                <div key={`legend-${row.x}`} style={{ fontSize: 12, color: '#334155' }}>
                  Snapshot du {shortDate(row.periodEnd)} ({weekLabel(row.periodStart, row.periodEnd)}):{' '}
                  <strong>{formatCurrency(row.value, row.currency)}</strong> ({formatCardCount(row.cardCount)})
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
