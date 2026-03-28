'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/lib/auth'
import { isAdminEmail, parseAdminEmails } from '@/lib/admin'

type DonRow = {
  externalId: string
  cardName: string
  cardText: string
  rarity: string
  cardType: string
  imageUrl: string
  imageId: string
  baseCode: string
  optcgDonName: string
  suggestedSetCode: string | null
  suggestedSetLabel: string | null
  targetSetCode: string | null
  targetSetLabel: string | null
  isValidated: boolean
  notes: string
  status: 'validated' | 'pending' | 'unresolved'
}

type SetOption = {
  code: string
  label: string
}

type DraftState = {
  targetSetCode: string
  isValidated: boolean
  notes: string
}

export default function AdminDonCardsPage() {
  const { user, loading: authLoading } = useAuth()
  const adminEmails = parseAdminEmails(process.env.NEXT_PUBLIC_ADMIN_EMAILS)
  const canAccessAdmin = isAdminEmail(user?.email, adminEmails)
  const [rows, setRows] = useState<DonRow[]>([])
  const [availableSets, setAvailableSets] = useState<SetOption[]>([])
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [hideValidated, setHideValidated] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const getAuthHeader = async () => {
    const { data } = await supabase.auth.getSession()
    const accessToken = data.session?.access_token
    return accessToken
      ? ({ Authorization: `Bearer ${accessToken}` } as Record<string, string>)
      : ({} as Record<string, string>)
  }

  const loadData = async () => {
    setLoading(true)
    setError(null)

    try {
      const authHeaders = await getAuthHeader()
      const res = await fetch('/api/admin/don-cards', { headers: authHeaders })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data?.error || 'Erreur chargement DON')
        setRows([])
        setAvailableSets([])
        return
      }

      const nextRows = Array.isArray(data?.rows) ? (data.rows as DonRow[]) : []
      const nextSets = Array.isArray(data?.availableSets)
        ? (data.availableSets as SetOption[])
        : []

      setRows(nextRows)
      setAvailableSets(nextSets)
      setDrafts(
        nextRows.reduce<Record<string, DraftState>>((acc, row) => {
          acc[row.externalId] = {
            targetSetCode: row.targetSetCode || row.suggestedSetCode || '',
            isValidated: row.isValidated,
            notes: row.notes || ''
          }
          return acc
        }, {})
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!canAccessAdmin) {
      setLoading(false)
      return
    }
    loadData()
  }, [canAccessAdmin])

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()

    const statusWeight: Record<DonRow['status'], number> = {
      unresolved: 0,
      pending: 1,
      validated: 2
    }

    return rows
      .filter((row) => {
        if (hideValidated && row.isValidated) return false
        if (!query) return true

        return [
          row.cardName,
          row.optcgDonName,
          row.externalId,
          row.suggestedSetCode || '',
          row.targetSetCode || ''
        ].some((value) => value.toLowerCase().includes(query))
      })
      .sort((a, b) => {
        const statusDelta = statusWeight[a.status] - statusWeight[b.status]
        if (statusDelta !== 0) return statusDelta
        return a.cardName.localeCompare(b.cardName, 'fr')
      })
  }, [hideValidated, rows, search])

  const stats = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.total += 1
        acc[row.status] += 1
        return acc
      },
      { total: 0, unresolved: 0, pending: 0, validated: 0 }
    )
  }, [rows])

  const updateDraft = (externalId: string, patch: Partial<DraftState>) => {
    setDrafts((prev) => ({
      ...prev,
      [externalId]: {
        targetSetCode: prev[externalId]?.targetSetCode || '',
        isValidated: prev[externalId]?.isValidated || false,
        notes: prev[externalId]?.notes || '',
        ...patch
      }
    }))
  }

  const saveRow = async (row: DonRow) => {
    const draft = drafts[row.externalId]
    if (!draft) return

    setSavingId(row.externalId)
    setError(null)

    try {
      const authHeaders = await getAuthHeader()
      const res = await fetch('/api/admin/don-cards', {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          externalId: row.externalId,
          cardName: row.cardName,
          optcgDonName: row.optcgDonName,
          suggestedSetCode: row.suggestedSetCode,
          targetSetCode: draft.targetSetCode,
          isValidated: draft.isValidated,
          notes: draft.notes
        })
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || `Erreur sauvegarde pour ${row.cardName}`)
        return
      }

      await loadData()
    } finally {
      setSavingId(null)
    }
  }

  if (authLoading || loading) return <div style={{ padding: 40 }}>Chargement...</div>
  if (!canAccessAdmin) return <div style={{ padding: 40 }}>Acces refuse.</div>

  return (
    <div style={{ padding: 40 }}>
      <h1>Admin - Resolution des DON</h1>

      <div style={{ margin: '10px 0 20px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Link
          href="/admin"
          style={{
            background: '#111827',
            color: '#fff',
            padding: '6px 10px',
            borderRadius: 4,
            textDecoration: 'none'
          }}
        >
          Retour admin
        </Link>
        <Link
          href="/admin/decks"
          style={{
            background: '#374151',
            color: '#fff',
            padding: '6px 10px',
            borderRadius: 4,
            textDecoration: 'none'
          }}
        >
          Decks
        </Link>
      </div>

      <p style={{ maxWidth: 900, lineHeight: 1.5 }}>
        Le systeme propose un set a partir de <code>optcg_don_name</code>. Une carte
        DON n&apos;est importee dans un set que lorsqu&apos;un admin a valide la cible
        finale. L&apos;admin peut garder la suggestion ou la remplacer.
      </p>

      <div
        style={{
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          margin: '20px 0',
          alignItems: 'center'
        }}
      >
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Rechercher une DON, un set, un id..."
          style={{
            minWidth: 320,
            padding: '8px 10px',
            borderRadius: 6,
            border: '1px solid #cbd5e1'
          }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={hideValidated}
            onChange={(event) => setHideValidated(event.target.checked)}
          />
          Masquer les cartes deja validees
        </label>
        <button
          onClick={() => loadData()}
          style={{
            border: 'none',
            background: '#1d4ed8',
            color: '#fff',
            padding: '8px 12px',
            borderRadius: 6,
            cursor: 'pointer'
          }}
        >
          Recharger
        </button>
      </div>

      <div style={{ marginBottom: 16, color: '#334155' }}>
        {stats.total} DON au total, {stats.unresolved} sans cible, {stats.pending} en
        attente, {stats.validated} validees.
      </div>

      {error && (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 8,
            background: '#fee2e2',
            color: '#991b1b'
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {filteredRows.map((row) => {
          const draft = drafts[row.externalId] || {
            targetSetCode: row.targetSetCode || row.suggestedSetCode || '',
            isValidated: row.isValidated,
            notes: row.notes || ''
          }

          const changed =
            draft.targetSetCode !== (row.targetSetCode || row.suggestedSetCode || '') ||
            draft.isValidated !== row.isValidated ||
            draft.notes !== (row.notes || '')

          const borderColor =
            row.status === 'validated'
              ? '#16a34a'
              : row.status === 'pending'
                ? '#f59e0b'
                : '#dc2626'

          return (
            <div
              key={row.externalId}
              style={{
                border: `1px solid ${borderColor}`,
                borderRadius: 12,
                padding: 16,
                background: '#fff'
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1.6fr) minmax(260px, 1fr)',
                  gap: 16
                }}
              >
                <div>
                  <div
                    style={{
                      display: 'flex',
                      gap: 10,
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      marginBottom: 8
                    }}
                  >
                    <strong>{row.cardName}</strong>
                    <span
                      style={{
                        background:
                          row.status === 'validated'
                            ? '#dcfce7'
                            : row.status === 'pending'
                              ? '#fef3c7'
                              : '#fee2e2',
                        color:
                          row.status === 'validated'
                            ? '#166534'
                            : row.status === 'pending'
                              ? '#92400e'
                              : '#991b1b',
                        padding: '2px 8px',
                        borderRadius: 999,
                        fontSize: 12
                      }}
                    >
                      {row.status === 'validated'
                        ? 'Validee'
                        : row.status === 'pending'
                          ? 'Cible choisie'
                          : 'Sans validation'}
                    </span>
                    <span style={{ color: '#475569', fontSize: 13 }}>{row.baseCode}</span>
                  </div>

                  <div style={{ color: '#334155', lineHeight: 1.5 }}>
                    <div>
                      Suggestion: {row.suggestedSetCode || 'Aucune'}{' '}
                      {row.suggestedSetLabel ? `(${row.suggestedSetLabel})` : ''}
                    </div>
                    <div>
                      Cible actuelle: {row.targetSetCode || 'Non definie'}{' '}
                      {row.targetSetLabel ? `(${row.targetSetLabel})` : ''}
                    </div>
                    <div>Source: {row.optcgDonName || row.imageId || row.externalId}</div>
                    {row.cardText && <div>Texte: {row.cardText}</div>}
                    {row.imageUrl && (
                      <div>
                        <a href={row.imageUrl} target="_blank" rel="noreferrer">
                          Ouvrir image source
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gap: 10,
                    alignContent: 'start'
                  }}
                >
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span>Set cible</span>
                    <select
                      value={draft.targetSetCode}
                      onChange={(event) =>
                        updateDraft(row.externalId, {
                          targetSetCode: event.target.value
                        })
                      }
                      style={{
                        padding: '8px 10px',
                        borderRadius: 6,
                        border: '1px solid #cbd5e1'
                      }}
                    >
                      <option value="">Choisir un set</option>
                      {availableSets.map((setOption) => (
                        <option key={setOption.code} value={setOption.code}>
                          {setOption.code} - {setOption.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={draft.isValidated}
                      onChange={(event) =>
                        updateDraft(row.externalId, {
                          isValidated: event.target.checked
                        })
                      }
                    />
                    Valider l&apos;import dans ce set
                  </label>

                  <label style={{ display: 'grid', gap: 6 }}>
                    <span>Note admin</span>
                    <textarea
                      value={draft.notes}
                      onChange={(event) =>
                        updateDraft(row.externalId, {
                          notes: event.target.value
                        })
                      }
                      rows={3}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 6,
                        border: '1px solid #cbd5e1',
                        resize: 'vertical'
                      }}
                    />
                  </label>

                  <button
                    onClick={() => saveRow(row)}
                    disabled={savingId === row.externalId}
                    style={{
                      border: 'none',
                      background: changed ? '#0f766e' : '#64748b',
                      color: '#fff',
                      padding: '10px 12px',
                      borderRadius: 8,
                      cursor: 'pointer'
                    }}
                  >
                    {savingId === row.externalId ? 'Sauvegarde...' : 'Sauvegarder'}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
