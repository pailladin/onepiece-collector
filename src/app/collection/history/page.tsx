'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabaseClient'
import { CollectionHistoryChart, historyDate, historyMoney, type HistoryPoint } from '@/components/CollectionHistoryChart'

type ValueRow = { value: number; expectedCount: number; currency?: string }
type WeekRow = {
  periodStart: string
  periodEnd: string
  total: ValueRow | null
  sets: Array<ValueRow & { setCode: string; setName: string }>
}
type HistoryWindow = { year: number; firstYear: number; lastYear: number }
const PAGE_SIZE = 10

export default function CollectionHistoryPage() {
  const { user, loading: authLoading } = useAuth()
  const userId = user?.id
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [weeks, setWeeks] = useState<WeekRow[]>([])
  const [selectedSetCode, setSelectedSetCode] = useState('TOTAL')
  const [year, setYear] = useState('latest')
  const [window, setWindow] = useState<HistoryWindow | null>(null)
  const [page, setPage] = useState(0)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    if (authLoading) return () => controller.abort()
    if (!userId) { setWeeks([]); setLoading(false); return () => controller.abort() }
    setLoading(true)
    setError(null)
    setWeeks([])
    setPage(0)
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token
        if (!token) throw new Error('Session expirée. Reconnecte-toi.')
        const response = await fetch(`/api/collection/value-history?year=${encodeURIComponent(year)}`, {
          signal: controller.signal,
          headers: { Authorization: `Bearer ${token}` }
        })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || 'Erreur de chargement')
        if (controller.signal.aborted) return
        setWeeks(payload.weeks || [])
        setWindow(payload.window)
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Historique indisponible')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    })()
    return () => controller.abort()
  }, [authLoading, userId, year, retry])

  const setOptions = useMemo(() => {
    const options = new Map<string, string>()
    weeks.forEach((week) => week.sets.forEach((set) => options.set(set.setCode, set.setName)))
    if (selectedSetCode !== 'TOTAL' && !options.has(selectedSetCode)) options.set(selectedSetCode, selectedSetCode)
    return [...options].sort(([a], [b]) => a.localeCompare(b))
  }, [weeks, selectedSetCode])
  const series = useMemo<HistoryPoint[]>(() => weeks.map((week) => {
    const row = selectedSetCode === 'TOTAL' ? week.total : week.sets.find((set) => set.setCode === selectedSetCode)
    return { date: week.periodEnd, value: row?.value ?? null, cardCount: row?.expectedCount ?? 0, currency: row?.currency || week.total?.currency || 'EUR' }
  }).sort((a, b) => a.date.localeCompare(b.date)), [weeks, selectedSetCode])
  const measured = series.filter((point) => point.value !== null)
  const first = measured[0]
  const last = measured[measured.length - 1]
  const delta = first && last ? last.value! - first.value! : null
  const pageCount = Math.ceil(series.length / PAGE_SIZE)
  const details = [...series].reverse().slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const busy = authLoading || loading

  if (!authLoading && !user) return <div style={{ padding: 24 }}>Connecte-toi pour voir le suivi de valeur.</div>
  return <div data-history-page style={{ maxWidth: 1200, margin: '0 auto', padding: '24px clamp(12px, 3vw, 32px)', display: 'grid', gap: 20, minWidth: 0 }}>
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 16, flexWrap: 'wrap' }}>
      <div><h1 style={{ margin: 0, fontSize: 26 }}>Évolution de ma collection</h1>
        <p style={{ color: '#64748b', marginBottom: 0 }}>Vos estimations hebdomadaires, année après année.</p></div>
      <Link href="/collection" style={{ color: '#1d4ed8' }}>Retour collection</Link>
    </header>
    <section aria-label="Période et collection" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'end' }}>
      <label style={{ display: 'grid', gap: 6, flex: '1 1 240px', minWidth: 0 }}>Collection
        <select value={selectedSetCode} onChange={(event) => { setSelectedSetCode(event.target.value); setPage(0) }} style={{ padding: 10, width: '100%', minWidth: 0 }}>
          <option value="TOTAL">Collection complète</option>
          {setOptions.map(([code, name]) => <option key={code} value={code}>{code} · {name}</option>)}
        </select>
      </label>
      <label style={{ display: 'grid', gap: 6 }}>Année
        <select aria-label="Année" value={window?.year ?? 'latest'} disabled={!window} onChange={(event) => setYear(event.target.value)} style={{ padding: 10 }}>
          {!window && <option value="latest">La plus récente</option>}
          {window && Array.from({ length: window.lastYear - window.firstYear + 1 }, (_, i) => window.lastYear - i).map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button aria-label="Année précédente" disabled={busy || !window || window.year <= window.firstYear} onClick={() => setYear(String(window!.year - 1))} style={{ padding: 10 }}>←</button>
        <button aria-label="Année suivante" disabled={busy || !window || window.year >= window.lastYear} onClick={() => setYear(String(window!.year + 1))} style={{ padding: 10 }}>→</button>
      </div>
    </section>
    {error ? <div role="alert">{error} <button onClick={() => setRetry((value) => value + 1)}>Réessayer</button></div>
      : busy ? <p role="status">Chargement de l’historique…</p>
        : <>
          {last && <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
            <div><div style={{ color: '#64748b', fontSize: 13 }}>Dernière estimation de la période · {historyDate(last.date)}</div><strong style={{ fontSize: 28 }}>{historyMoney(last.value!, last.currency)}</strong></div>
            <div><div style={{ color: '#64748b', fontSize: 13 }}>Variation entre la première et la dernière mesure</div><strong style={{ fontSize: 24 }}>{measured.length < 2 ? '—' : `${delta! > 0 ? '+' : ''}${historyMoney(delta!, last.currency)}`}</strong></div>
          </div>}
          <section style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: '16px clamp(8px, 2vw, 20px)', minWidth: 0, background: '#fff' }}>
            <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>{window?.year} · {selectedSetCode === 'TOTAL' ? 'Collection complète' : selectedSetCode}</h2>
            <CollectionHistoryChart key={`${window?.year}-${selectedSetCode}`} series={series} />
            <p style={{ fontSize: 12, color: '#64748b', marginBottom: 0 }}>La valeur évolue avec les prix et les cartes ajoutées ou retirées. Les interruptions de la courbe signalent des mesures manquantes.</p>
          </section>
          {series.length > 0 && <section aria-label="Détail des mesures">
            <h2 style={{ fontSize: 18 }}>Détail des mesures · {series.length}</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead><tr><th style={{ textAlign: 'left', padding: 8 }}>Date</th><th style={{ textAlign: 'right', padding: 8 }}>Valeur</th><th style={{ textAlign: 'right', padding: 8 }}>Cartes</th></tr></thead>
              <tbody>{details.map((point) => <tr key={point.date} style={{ borderTop: '1px solid #e2e8f0' }}><td style={{ padding: 8 }}>{historyDate(point.date)}</td><td style={{ padding: 8, textAlign: 'right' }}>{point.value === null ? 'Non disponible' : historyMoney(point.value, point.currency)}</td><td style={{ padding: 8, textAlign: 'right' }}>{point.value === null ? '—' : point.cardCount}</td></tr>)}</tbody>
            </table>
            {pageCount > 1 && <nav aria-label="Pages des mesures" style={{ display: 'flex', alignItems: 'center', justifyContent: 'end', gap: 12, marginTop: 12 }}>
              <button disabled={page === 0} onClick={() => setPage(page - 1)}>Précédent</button><span>{page + 1} / {pageCount}</span><button disabled={page + 1 >= pageCount} onClick={() => setPage(page + 1)}>Suivant</button>
            </nav>}
          </section>}
        </>}
  </div>
}
