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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [weeks, setWeeks] = useState<WeekRow[]>([])

  const totals = useMemo(
    () =>
      weeks
        .map((week) => ({
          x: week.periodStart,
          value: week.total?.value || 0
        }))
        .reverse(),
    [weeks]
  )

  const maxValue = Math.max(1, ...totals.map((row) => row.value))

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
        return
      }
      setWeeks(Array.isArray(payload?.weeks) ? payload.weeks : [])
    } finally {
      setLoading(false)
    }
  }

  const saveSnapshot = async () => {
    if (!user || saving) return
    setSaving(true)
    setError(null)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      const res = await fetch('/api/collection/value-history/snapshot', {
        method: 'POST',
        headers: token
          ? {
              Authorization: `Bearer ${token}`
            }
          : {}
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(payload?.error || 'Erreur sauvegarde snapshot')
        return
      }
      await loadHistory()
    } finally {
      setSaving(false)
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
            Historique hebdomadaire par set + total.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={saveSnapshot}
            disabled={saving}
            style={{
              border: '1px solid #2563eb',
              background: '#2563eb',
              color: '#fff',
              borderRadius: 8,
              padding: '8px 12px',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1
            }}
          >
            {saving ? 'Sauvegarde...' : 'Sauvegarder cette semaine'}
          </button>
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
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Evolution du total</div>
        {totals.length === 0 ? (
          <div style={{ color: '#64748b' }}>Aucune semaine sauvegardee.</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {totals.map((row) => (
              <div key={row.x} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 120px', gap: 10, alignItems: 'center' }}>
                <div style={{ color: '#475569', fontSize: 13 }}>{shortDate(row.x)}</div>
                <div style={{ height: 10, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${Math.max(2, Math.round((row.value / maxValue) * 100))}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #0ea5e9, #2563eb)'
                    }}
                  />
                </div>
                <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 13 }}>{formatCurrency(row.value)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ border: '1px solid #cbd5e1', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '10px 12px', background: '#f8fafc', fontWeight: 700 }}>Details hebdomadaires</div>
        {weeks.length === 0 ? (
          <div style={{ padding: 12, color: '#64748b' }}>Aucune donnee.</div>
        ) : (
          weeks.map((week) => (
            <div key={week.periodStart} style={{ borderTop: '1px solid #e2e8f0', padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                <div>
                  <strong>Semaine {week.periodStart}</strong>
                  <div style={{ fontSize: 12, color: '#64748b' }}>jusqu au {week.periodEnd}</div>
                </div>
                <div style={{ fontWeight: 700 }}>
                  {formatCurrency(week.total?.value || 0, week.total?.currency || 'USD')}
                </div>
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                {week.sets.slice(0, 12).map((setRow) => (
                  <div
                    key={`${week.periodStart}-${setRow.setCode}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '110px 1fr 130px 130px',
                      gap: 8,
                      alignItems: 'center',
                      fontSize: 13
                    }}
                  >
                    <div>
                      <strong>{setRow.setCode}</strong>
                    </div>
                    <div>{setRow.setName}</div>
                    <div style={{ color: '#475569' }}>
                      {setRow.pricedCount}/{setRow.expectedCount}
                    </div>
                    <div style={{ textAlign: 'right', fontWeight: 700 }}>
                      {formatCurrency(setRow.value, week.total?.currency || 'USD')}
                      {setRow.usFallbackCount > 0 ? '*' : ''}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
