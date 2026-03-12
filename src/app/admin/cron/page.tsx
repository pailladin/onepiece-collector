'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/lib/auth'
import { isAdminEmail, parseAdminEmails } from '@/lib/admin'

type CronRow = {
  name: 'price-guide' | 'catalog' | 'collection-value-weekly'
  table: string
  lastSeenOn: string | null
  ageHours: number | null
  healthy: boolean
  error: string | null
  thresholdHours: number
}

export default function AdminCronPage() {
  const { user, loading: authLoading } = useAuth()
  const adminEmails = parseAdminEmails(process.env.NEXT_PUBLIC_ADMIN_EMAILS)
  const canAccessAdmin = isAdminEmail(user?.email, adminEmails)
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<CronRow[]>([])
  const [error, setError] = useState<string | null>(null)

  const getAuthHeader = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    const accessToken = data.session?.access_token
    return accessToken
      ? ({ Authorization: `Bearer ${accessToken}` } as Record<string, string>)
      : ({} as Record<string, string>)
  }, [])

  const loadStatus = useCallback(async () => {
    setLoading(true)
    setError(null)
    const authHeaders = await getAuthHeader()
    const res = await fetch('/api/admin/cron/status', { headers: authHeaders })
    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      setRows([])
      setError(data?.error || 'Erreur chargement cron')
      setLoading(false)
      return
    }

    setRows(Array.isArray(data?.rows) ? data.rows : [])
    setLoading(false)
  }, [getAuthHeader])

  useEffect(() => {
    if (!canAccessAdmin) {
      setLoading(false)
      return
    }
    loadStatus()
  }, [canAccessAdmin, loadStatus])

  if (authLoading || loading) return <div style={{ padding: 40 }}>Chargement...</div>
  if (!canAccessAdmin) return <div style={{ padding: 40 }}>Acces refuse.</div>

  return (
    <div style={{ padding: 40 }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/admin">Retour admin</Link>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Admin - Supervision cron</h1>
        <button onClick={loadStatus}>Rafraichir</button>
      </div>

      {error && <div style={{ marginBottom: 12, color: '#b91c1c' }}>{error}</div>}

      <div style={{ display: 'grid', gap: 10 }}>
        {rows.map((row) => (
          <div
            key={row.name}
            style={{
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              padding: 12,
              background: row.healthy ? '#ecfdf5' : '#fef2f2'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>{row.name}</strong>
              <span
                style={{
                  fontSize: 12,
                  color: row.healthy ? '#166534' : '#991b1b',
                  fontWeight: 700
                }}
              >
                {row.healthy ? `OK (<${row.thresholdHours}h)` : `ALERTE (>${row.thresholdHours}h)`}
              </span>
            </div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Table: {row.table}</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>
              Derniere maj: {row.lastSeenOn || 'N/A'} {row.ageHours != null ? `(${row.ageHours}h)` : ''}
            </div>
            {row.error && (
              <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 4 }}>Erreur: {row.error}</div>
            )}
          </div>
        ))}
        {rows.length === 0 && <div style={{ color: '#64748b' }}>Aucune donnee cron disponible.</div>}
      </div>
    </div>
  )
}
