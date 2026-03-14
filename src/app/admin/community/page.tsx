'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { isAdminEmail, parseAdminEmails } from '@/lib/admin'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabaseClient'
import { type CommunitySubmissionType } from '@/lib/community'

type AdminSubmissionRow = {
  id: string
  user_id: string
  username: string
  submission_type: CommunitySubmissionType
  title: string
  message: string | null
  payload: Record<string, unknown>
  status: 'pending' | 'approved' | 'rejected'
  admin_comment: string | null
  created_at: string
  reviewed_at: string | null
  currentValues?: Record<string, unknown> | null
}

type PayloadOverrides = {
  currentPrintCode?: string
  printCode?: string
}

type DiffField = {
  key: string
  label: string
  before: string
  after: string
  changed: boolean
}

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected'
type TypeFilter = 'all' | CommunitySubmissionType

function normalizeValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).join(', ')
  }
  if (typeof value === 'boolean') {
    return value ? 'Oui' : 'Non'
  }
  return String(value || '').trim()
}

function normalizeSearchText(value: unknown) {
  return normalizeValue(value).toLowerCase()
}

function getStatusLabel(status: AdminSubmissionRow['status']) {
  if (status === 'pending') return 'En attente'
  if (status === 'approved') return 'Validee'
  return 'Refusee'
}

function getStatusColors(status: AdminSubmissionRow['status']) {
  if (status === 'pending') {
    return { color: '#92400e', background: '#fef3c7', border: '#f59e0b' }
  }
  if (status === 'approved') {
    return { color: '#166534', background: '#dcfce7', border: '#22c55e' }
  }
  return { color: '#991b1b', background: '#fee2e2', border: '#ef4444' }
}

function getTypeLabel(type: CommunitySubmissionType) {
  return type === 'card_add' ? 'Ajout de carte' : 'Correction'
}

function buildSubmissionDiff(
  row: AdminSubmissionRow,
  overrides: PayloadOverrides | undefined
): DiffField[] {
  const payload = row.payload || {}
  const currentValues = row.currentValues || {}
  const effectiveCurrentPrintCode = String(
    overrides?.currentPrintCode || payload.currentPrintCode || ''
  ).trim()
  const effectivePrintCode = String(overrides?.printCode || payload.printCode || '').trim()

  const fields: Array<{ key: string; label: string; before: string; after: string }> = [
    {
      key: 'setCode',
      label: 'Set',
      before: normalizeValue(currentValues.setCode),
      after: normalizeValue(payload.setCode)
    },
    {
      key: 'baseCode',
      label: 'Base code',
      before: normalizeValue(currentValues.baseCode),
      after: normalizeValue(payload.baseCode)
    },
    {
      key: 'printCode',
      label: row.submission_type === 'card_add' ? 'Print code' : 'Nouveau print code',
      before: normalizeValue(currentValues.currentPrintCode || effectiveCurrentPrintCode),
      after: effectivePrintCode
    },
    {
      key: 'name',
      label: 'Nom',
      before: normalizeValue(currentValues.name),
      after: normalizeValue(payload.name)
    },
    {
      key: 'rarity',
      label: 'Rarete',
      before: normalizeValue(currentValues.rarity),
      after: normalizeValue(payload.rarity)
    },
    {
      key: 'type',
      label: 'Type',
      before: normalizeValue(currentValues.type),
      after: normalizeValue(payload.type)
    },
    {
      key: 'variantType',
      label: 'Variant',
      before: normalizeValue(currentValues.variantType),
      after: normalizeValue(payload.variantType)
    },
    {
      key: 'availableLanguages',
      label: 'Langues',
      before: normalizeValue(currentValues.availableLanguages),
      after: normalizeValue(payload.availableLanguages)
    },
    {
      key: 'cardmarketProductId',
      label: 'ID Cardmarket',
      before: normalizeValue(currentValues.cardmarketProductId),
      after: normalizeValue(payload.cardmarketProductId)
    },
    {
      key: 'imageUrl',
      label: 'Image URL',
      before: normalizeValue(currentValues.imageUrl),
      after: normalizeValue(payload.imageUrl)
    }
  ]

  return fields
    .map((field) => ({
      ...field,
      changed: field.before !== field.after
    }))
    .filter((field) => field.before || field.after)
}

function sectionStyle() {
  return {
    border: '1px solid #d1d5db',
    borderRadius: 16,
    background: 'rgba(255,255,255,0.92)',
    padding: 16
  } as const
}

function fieldStyle() {
  return {
    width: '100%',
    boxSizing: 'border-box',
    padding: '9px 10px',
    borderRadius: 10,
    border: '1px solid #cbd5e1',
    background: '#fff'
  } as const
}

export default function AdminCommunityPage() {
  const { user, loading: authLoading } = useAuth()
  const adminEmails = parseAdminEmails(process.env.NEXT_PUBLIC_ADMIN_EMAILS)
  const canAccessAdmin = isAdminEmail(user?.email, adminEmails)
  const [rows, setRows] = useState<AdminSubmissionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [comments, setComments] = useState<Record<string, string>>({})
  const [payloadOverrides, setPayloadOverrides] = useState<Record<string, PayloadOverrides>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({})

  const getAuthHeader = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    const accessToken = data.session?.access_token
    return accessToken
      ? ({ Authorization: `Bearer ${accessToken}` } as Record<string, string>)
      : ({} as Record<string, string>)
  }, [])

  const loadRows = useCallback(async () => {
    setLoading(true)
    const authHeaders = await getAuthHeader()
    const res = await fetch('/api/admin/community/submissions', { headers: authHeaders })
    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      setMessage(data?.error || 'Erreur chargement moderation')
      setRows([])
      setLoading(false)
      return
    }

    const submissions = Array.isArray(data?.submissions) ? data.submissions : []
    setRows(submissions)
    setComments(
      Object.fromEntries(
        submissions.map((row: AdminSubmissionRow) => [row.id, row.admin_comment || ''])
      )
    )
    setPayloadOverrides(
      Object.fromEntries(
        submissions.map((row: AdminSubmissionRow) => [
          row.id,
          {
            currentPrintCode: String(row.payload?.currentPrintCode || ''),
            printCode: String(row.payload?.printCode || '')
          }
        ])
      )
    )
    setExpandedRows(
      Object.fromEntries(
        submissions.map((row: AdminSubmissionRow) => [row.id, row.status === 'pending'])
      )
    )
    setLoading(false)
  }, [getAuthHeader])

  useEffect(() => {
    if (!canAccessAdmin) {
      setLoading(false)
      return
    }
    void loadRows()
  }, [canAccessAdmin, loadRows])

  const reviewSubmission = async (submissionId: string, action: 'approve' | 'reject') => {
    setBusyId(submissionId)
    setMessage('')

    try {
      const authHeaders = await getAuthHeader()
      const res = await fetch('/api/admin/community/submissions', {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          submissionId,
          action,
          adminComment: comments[submissionId] || '',
          payloadPatch: payloadOverrides[submissionId] || {}
        })
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || 'Erreur moderation')
      }

      setMessage(action === 'approve' ? 'Proposition validee.' : 'Proposition refusee.')
      await loadRows()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erreur moderation')
    } finally {
      setBusyId(null)
    }
  }

  const counts = useMemo(
    () => ({
      total: rows.length,
      pending: rows.filter((row) => row.status === 'pending').length,
      approved: rows.filter((row) => row.status === 'approved').length,
      rejected: rows.filter((row) => row.status === 'rejected').length
    }),
    [rows]
  )

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false
      if (typeFilter !== 'all' && row.submission_type !== typeFilter) return false

      if (!query) return true

      const haystack = [
        row.title,
        row.username,
        row.message,
        row.admin_comment,
        row.payload?.setCode,
        row.payload?.baseCode,
        row.payload?.currentPrintCode,
        row.payload?.printCode,
        row.payload?.name
      ]
        .map((value) => normalizeSearchText(value))
        .join(' ')

      return haystack.includes(query)
    })
  }, [rows, searchQuery, statusFilter, typeFilter])

  const pendingRows = filteredRows.filter((row) => row.status === 'pending')
  const reviewedRows = filteredRows.filter((row) => row.status !== 'pending')

  if (authLoading || loading) {
    return <div style={{ padding: 40 }}>Chargement...</div>
  }

  if (!canAccessAdmin) {
    return <div style={{ padding: 40 }}>Acces refuse.</div>
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '18px 24px 28px',
        background:
          'radial-gradient(circle at 12% 8%, #fff7ed 0%, #eff6ff 38%, #eef2ff 100%)',
        display: 'grid',
        gap: 14,
        alignContent: 'start'
      }}
    >
      <section
        style={{
          border: '1px solid #cfe4ff',
          borderRadius: 18,
          background: 'linear-gradient(145deg, #ffffff 0%, #eff6ff 100%)',
          padding: 18,
          display: 'grid',
          gap: 12
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 34, color: '#0f172a' }}>Admin - Contributions</h1>
            <div style={{ marginTop: 6, color: '#475569' }}>
              Pilote les validations, filtre rapidement et garde les demandes en attente visibles.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'start' }}>
            <Link href="/community">Voir l&apos;espace contributions</Link>
            <Link href="/admin">Retour admin</Link>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 10
          }}
        >
          {[
            { label: 'Total', value: counts.total, color: '#1d4ed8', bg: '#dbeafe' },
            { label: 'En attente', value: counts.pending, color: '#b45309', bg: '#fef3c7' },
            { label: 'Validees', value: counts.approved, color: '#15803d', bg: '#dcfce7' },
            { label: 'Refusees', value: counts.rejected, color: '#b91c1c', bg: '#fee2e2' }
          ].map((item) => (
            <div
              key={item.label}
              style={{
                borderRadius: 14,
                border: '1px solid #dbeafe',
                background: '#fff',
                padding: '12px 14px'
              }}
            >
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{item.label}</div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 26,
                  fontWeight: 800,
                  color: item.color
                }}
              >
                <span>{item.value}</span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: item.color,
                    background: item.bg,
                    borderRadius: 999,
                    padding: '3px 8px'
                  }}
                >
                  {item.label}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={sectionStyle()}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(260px, 1.2fr) repeat(2, minmax(180px, 0.4fr)) auto',
            gap: 10,
            alignItems: 'end'
          }}
        >
          <div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Recherche</div>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Titre, pseudo, set, code, print code..."
              style={fieldStyle()}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Statut</div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              style={fieldStyle()}
            >
              <option value="all">Tous les statuts</option>
              <option value="pending">En attente</option>
              <option value="approved">Validees</option>
              <option value="rejected">Refusees</option>
            </select>
          </div>

          <div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>Type</div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
              style={fieldStyle()}
            >
              <option value="all">Tous les types</option>
              <option value="card_edit">Corrections</option>
              <option value="card_add">Ajouts</option>
            </select>
          </div>

          <button
            onClick={() => {
              setSearchQuery('')
              setStatusFilter('all')
              setTypeFilter('all')
            }}
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid #cbd5e1',
              background: '#fff',
              cursor: 'pointer'
            }}
          >
            Reinitialiser
          </button>
        </div>
      </section>

      {message && <div style={{ color: '#0f172a', fontWeight: 700 }}>{message}</div>}

      <section style={sectionStyle()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, color: '#0f172a' }}>A traiter d&apos;abord</h2>
          <div style={{ fontSize: 13, color: '#64748b' }}>{pendingRows.length} proposition(s)</div>
        </div>

        <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
          {pendingRows.length === 0 && (
            <div style={{ color: '#64748b' }}>Aucune proposition en attente avec les filtres actuels.</div>
          )}

          {pendingRows.map((row) => {
            const isExpanded = expandedRows[row.id] ?? true
            const diffFields = buildSubmissionDiff(row, payloadOverrides[row.id])
            const statusColors = getStatusColors(row.status)

            return (
              <article
                key={row.id}
                style={{
                  border: '1px solid #fcd34d',
                  borderRadius: 16,
                  background: '#fffdf7',
                  padding: 14,
                  display: 'grid',
                  gap: 12
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ display: 'grid', gap: 6 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 18 }}>{row.title}</div>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: '#1d4ed8',
                          background: '#dbeafe',
                          borderRadius: 999,
                          padding: '3px 8px'
                        }}
                      >
                        {getTypeLabel(row.submission_type)}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: statusColors.color,
                          background: statusColors.background,
                          border: `1px solid ${statusColors.border}`,
                          borderRadius: 999,
                          padding: '3px 8px'
                        }}
                      >
                        {getStatusLabel(row.status)}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: '#475569' }}>
                      {row.username} • {new Date(row.created_at).toLocaleString('fr-FR')}
                    </div>
                    {row.message && (
                      <div style={{ color: '#334155', whiteSpace: 'pre-wrap' }}>{row.message}</div>
                    )}
                  </div>

                  <button
                    onClick={() =>
                      setExpandedRows((prev) => ({ ...prev, [row.id]: !(prev[row.id] ?? true) }))
                    }
                    style={{
                      padding: '8px 12px',
                      borderRadius: 10,
                      border: '1px solid #cbd5e1',
                      background: '#fff',
                      cursor: 'pointer',
                      height: 'fit-content'
                    }}
                  >
                    {isExpanded ? 'Masquer details' : 'Voir details'}
                  </button>
                </div>

                {isExpanded && (
                  <>
                    <div
                      style={{
                        border: '1px solid #e2e8f0',
                        borderRadius: 12,
                        background: '#f8fafc',
                        padding: 12,
                        display: 'grid',
                        gap: 8
                      }}
                    >
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '180px 1fr 1fr',
                          gap: 8,
                          fontSize: 12,
                          color: '#475569',
                          fontWeight: 700
                        }}
                      >
                        <div>Champ</div>
                        <div>Avant</div>
                        <div>Apres</div>
                      </div>

                      {diffFields.map((field) => (
                        <div
                          key={`${row.id}-${field.key}`}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '180px 1fr 1fr',
                            gap: 8,
                            alignItems: 'start',
                            fontSize: 13
                          }}
                        >
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>{field.label}</div>
                          <div style={{ color: '#475569', wordBreak: 'break-word' }}>{field.before || '-'}</div>
                          <div
                            style={{
                              color: field.changed ? '#15803d' : '#0f172a',
                              fontWeight: field.changed ? 700 : 400,
                              wordBreak: 'break-word'
                            }}
                          >
                            {field.after || '-'}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                        gap: 8
                      }}
                    >
                      {row.submission_type === 'card_edit' && (
                        <input
                          value={payloadOverrides[row.id]?.currentPrintCode || ''}
                          placeholder="Print code actuel (admin)"
                          readOnly
                          style={{
                            ...fieldStyle(),
                            background: '#f8fafc',
                            color: '#475569'
                          }}
                        />
                      )}
                      <input
                        value={payloadOverrides[row.id]?.printCode || ''}
                        onChange={(e) =>
                          setPayloadOverrides((prev) => ({
                            ...prev,
                            [row.id]: {
                              ...prev[row.id],
                              printCode: e.target.value.toUpperCase()
                            }
                          }))
                        }
                        placeholder={
                          row.submission_type === 'card_add'
                            ? 'Print code (admin)'
                            : 'Nouveau print code (admin, optionnel)'
                        }
                        style={fieldStyle()}
                      />
                    </div>

                    <textarea
                      value={comments[row.id] || ''}
                      onChange={(e) => setComments((prev) => ({ ...prev, [row.id]: e.target.value }))}
                      placeholder="Commentaire admin (optionnel)"
                      rows={3}
                      style={{ ...fieldStyle(), resize: 'vertical' }}
                    />

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        onClick={() => void reviewSubmission(row.id, 'approve')}
                        disabled={busyId === row.id}
                        style={{
                          background: '#0f766e',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 10,
                          padding: '9px 14px',
                          cursor: 'pointer'
                        }}
                      >
                        Approuver et appliquer
                      </button>
                      <button
                        onClick={() => void reviewSubmission(row.id, 'reject')}
                        disabled={busyId === row.id}
                        style={{
                          background: '#fff',
                          color: '#b91c1c',
                          border: '1px solid #fca5a5',
                          borderRadius: 10,
                          padding: '9px 14px',
                          cursor: 'pointer'
                        }}
                      >
                        Refuser
                      </button>
                    </div>
                  </>
                )}
              </article>
            )
          })}
        </div>
      </section>

      <section style={sectionStyle()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, color: '#0f172a' }}>Historique</h2>
          <div style={{ fontSize: 13, color: '#64748b' }}>{reviewedRows.length} proposition(s)</div>
        </div>

        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          {reviewedRows.length === 0 && (
            <div style={{ color: '#64748b' }}>Aucune contribution historisee avec les filtres actuels.</div>
          )}

          {reviewedRows.map((row) => {
            const isExpanded = expandedRows[row.id] ?? false
            const diffFields = buildSubmissionDiff(row, payloadOverrides[row.id]).filter((field) => field.changed)
            const statusColors = getStatusColors(row.status)

            return (
              <article
                key={row.id}
                style={{
                  border: '1px solid #dbe4ee',
                  borderRadius: 14,
                  background: '#fff',
                  padding: 14,
                  display: 'grid',
                  gap: 10
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ display: 'grid', gap: 6 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{row.title}</div>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: '#1d4ed8',
                          background: '#dbeafe',
                          borderRadius: 999,
                          padding: '3px 8px'
                        }}
                      >
                        {getTypeLabel(row.submission_type)}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: statusColors.color,
                          background: statusColors.background,
                          border: `1px solid ${statusColors.border}`,
                          borderRadius: 999,
                          padding: '3px 8px'
                        }}
                      >
                        {getStatusLabel(row.status)}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: '#475569' }}>
                      {row.username} • Creee le {new Date(row.created_at).toLocaleString('fr-FR')}
                      {row.reviewed_at ? ` • Traitee le ${new Date(row.reviewed_at).toLocaleString('fr-FR')}` : ''}
                    </div>
                    {row.admin_comment && (
                      <div style={{ fontSize: 13, color: '#475569' }}>
                        Commentaire admin: {row.admin_comment}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() =>
                      setExpandedRows((prev) => ({ ...prev, [row.id]: !(prev[row.id] ?? false) }))
                    }
                    style={{
                      padding: '8px 12px',
                      borderRadius: 10,
                      border: '1px solid #cbd5e1',
                      background: '#fff',
                      cursor: 'pointer',
                      height: 'fit-content'
                    }}
                  >
                    {isExpanded ? 'Masquer diff' : 'Voir diff'}
                  </button>
                </div>

                {isExpanded && (
                  <div
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: 12,
                      background: '#f8fafc',
                      padding: 12,
                      display: 'grid',
                      gap: 8
                    }}
                  >
                    {diffFields.length === 0 ? (
                      <div style={{ color: '#64748b' }}>Aucun ecart a afficher.</div>
                    ) : (
                      <>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '180px 1fr 1fr',
                            gap: 8,
                            fontSize: 12,
                            color: '#475569',
                            fontWeight: 700
                          }}
                        >
                          <div>Champ</div>
                          <div>Avant</div>
                          <div>Apres</div>
                        </div>
                        {diffFields.map((field) => (
                          <div
                            key={`${row.id}-${field.key}`}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '180px 1fr 1fr',
                              gap: 8,
                              alignItems: 'start',
                              fontSize: 13
                            }}
                          >
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>{field.label}</div>
                            <div style={{ color: '#475569', wordBreak: 'break-word' }}>{field.before || '-'}</div>
                            <div style={{ color: '#15803d', fontWeight: 700, wordBreak: 'break-word' }}>
                              {field.after || '-'}
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      </section>
    </div>
  )
}
