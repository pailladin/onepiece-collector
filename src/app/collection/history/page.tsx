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

function formatCurrency(value: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency
  }).format(value)
}

function shortDate(value: string) {
  return value
}

export default function CollectionHistoryPage() {
  const { user, loading: authLoading } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [weeks, setWeeks] = useState<WeekRow[]>([])
  const [selectedSetCode, setSelectedSetCode] = useState('TOTAL')

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
          value:
            selectedSetCode === 'TOTAL'
              ? week.total?.value || 0
              : week.sets.find((row) => row.setCode === selectedSetCode)?.value || 0,
          currency: week.total?.currency || 'USD'
        }))
        .reverse(),
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
            Evolution hebdomadaire par set.
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
                  return { x, y, row }
                })
                const polyline = points.map((p) => `${p.x},${p.y}`).join(' ')
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
                        <text x={p.x} y={238} textAnchor="middle" fontSize="10" fill="#475569">
                          {p.row.x.slice(5)}
                        </text>
                      </g>
                    ))}
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
              {series.map((row) => (
                <div key={`legend-${row.x}`} style={{ fontSize: 12, color: '#334155' }}>
                  {shortDate(row.x)}: <strong>{formatCurrency(row.value, row.currency)}</strong>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
