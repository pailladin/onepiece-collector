'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
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

function normalizeValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).join(', ')
  }
  if (typeof value === 'boolean') {
    return value ? 'Oui' : 'Non'
  }
  return String(value || '').trim()
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

  if (authLoading || loading) {
    return <div style={{ padding: 40 }}>Chargement...</div>
  }

  if (!canAccessAdmin) {
    return <div style={{ padding: 40 }}>Acces refuse.</div>
  }

  return (
    <div style={{ padding: 24, display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0 }}>Admin - Contributions</h1>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/community">Voir l'espace contributions</Link>
          <Link href="/admin">Retour admin</Link>
        </div>
      </div>

      {message && <div style={{ color: '#0f172a', fontWeight: 600 }}>{message}</div>}

      <div style={{ display: 'grid', gap: 10 }}>
        {rows.length === 0 && (
          <div style={{ color: '#64748b' }}>Aucune proposition a moderer.</div>
        )}
        {rows.map((row) => (
          <section
            key={row.id}
            style={{
              border: '1px solid #d1d5db',
              borderRadius: 12,
              background: '#fff',
              padding: 14,
              display: 'grid',
              gap: 10
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 700, color: '#0f172a' }}>{row.title}</div>
                <div style={{ fontSize: 13, color: '#475569' }}>
                  {row.username} • {row.submission_type === 'card_add' ? 'Ajout' : 'Correction'} •{' '}
                  {new Date(row.created_at).toLocaleString('fr-FR')}
                </div>
              </div>
              <div
                style={{
                  fontWeight: 700,
                  color:
                    row.status === 'approved'
                      ? '#0f766e'
                      : row.status === 'rejected'
                        ? '#b91c1c'
                        : '#92400e'
                }}
              >
                {row.status === 'pending'
                  ? 'En attente'
                  : row.status === 'approved'
                    ? 'Validee'
                    : 'Refusee'}
              </div>
            </div>

            {row.message && (
              <div style={{ color: '#334155', whiteSpace: 'pre-wrap' }}>{row.message}</div>
            )}

            <div
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                background: '#f8fafc',
                padding: 10,
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

              {buildSubmissionDiff(row, payloadOverrides[row.id]).map((field) => (
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
                  <div style={{ color: '#475569', wordBreak: 'break-word' }}>
                    {field.before || '-'}
                  </div>
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

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
              {row.submission_type === 'card_edit' && (
                <input
                  value={payloadOverrides[row.id]?.currentPrintCode || ''}
                  placeholder="Print code actuel (admin)"
                  readOnly
                  disabled={row.status !== 'pending'}
                  style={{
                    padding: '9px 10px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
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
                disabled={row.status !== 'pending'}
                style={{
                  padding: '9px 10px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1'
                }}
              />
            </div>

            <textarea
              value={comments[row.id] || ''}
              onChange={(e) => setComments((prev) => ({ ...prev, [row.id]: e.target.value }))}
              placeholder="Commentaire admin (optionnel)"
              rows={3}
              disabled={row.status !== 'pending'}
              style={{
                padding: '9px 10px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                resize: 'vertical'
              }}
            />

            {row.status === 'pending' && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={() => void reviewSubmission(row.id, 'approve')}
                  disabled={busyId === row.id}
                  style={{
                    background: '#0f766e',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '8px 12px',
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
                    borderRadius: 8,
                    padding: '8px 12px',
                    cursor: 'pointer'
                  }}
                >
                  Refuser
                </button>
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}
