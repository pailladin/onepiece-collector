'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { isAdminEmail, parseAdminEmails } from '@/lib/admin'
import { useAuth } from '@/lib/auth'
import { PLACE_ACTIVITY_OPTIONS } from '@/lib/places'
import { supabase } from '@/lib/supabaseClient'
import { type CommunitySubmissionType } from '@/lib/community'
import { SET_LANGUAGE_CODES, getCollectionLanguageShortLabel } from '@/lib/collections/languages'

type SetOption = {
  code: string
  name: string | null
}

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
  setCode?: string
  nextSetCode?: string
  baseCode?: string
  currentPrintCode?: string
  printCode?: string
  name?: string
  rarity?: string
  type?: string
  variantType?: string
  imageUrl?: string
  cardmarketProductId?: string
  availableLanguages?: string[]
  addressLine?: string
  city?: string
  postalCode?: string
  country?: string
  discordUrl?: string
  websiteUrl?: string
  googleMapsUrl?: string
  activities?: string[]
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
  if (type === 'card_add') return 'Ajout de carte'
  if (type === 'place_add') return 'Ajout de lieu'
  return 'Correction'
}

function buildSubmissionDiff(
  row: AdminSubmissionRow,
  overrides: PayloadOverrides | undefined
): DiffField[] {
  const payload = row.payload || {}
  const currentValues = row.currentValues || {}
  const mergedPayload = {
    ...payload,
    ...(overrides || {})
  }
  if (row.submission_type === 'place_add') {
    const fields: Array<{ key: string; label: string; before: string; after: string }> = [
      { key: 'name', label: 'Nom', before: '', after: normalizeValue(mergedPayload.name) },
      { key: 'city', label: 'Ville', before: '', after: normalizeValue(mergedPayload.city) },
      { key: 'postalCode', label: 'Code postal', before: '', after: normalizeValue(mergedPayload.postalCode) },
      { key: 'addressLine', label: 'Adresse', before: '', after: normalizeValue(mergedPayload.addressLine) },
      { key: 'country', label: 'Pays', before: '', after: normalizeValue(mergedPayload.country) },
      { key: 'activities', label: 'Activites', before: '', after: normalizeValue(mergedPayload.activities) },
      { key: 'discordUrl', label: 'Discord', before: '', after: normalizeValue(mergedPayload.discordUrl) },
      { key: 'websiteUrl', label: 'Site web', before: '', after: normalizeValue(mergedPayload.websiteUrl) },
      { key: 'googleMapsUrl', label: 'Maps', before: '', after: normalizeValue(mergedPayload.googleMapsUrl) },
      { key: 'imageUrl', label: 'Image URL', before: '', after: normalizeValue(mergedPayload.imageUrl) }
    ]

    return fields
      .map((field) => ({
        ...field,
        changed: field.before !== field.after
      }))
      .filter((field) => field.after)
  }

  const effectiveCurrentPrintCode = String(
    mergedPayload.currentPrintCode || ''
  ).trim()
  const effectivePrintCode = String(mergedPayload.printCode || '').trim()

  const fields: Array<{ key: string; label: string; before: string; after: string }> = [
    {
      key: 'setCode',
      label: 'Set',
      before: normalizeValue(currentValues.setCode),
      after: normalizeValue(mergedPayload.setCode)
    },
    {
      key: 'nextSetCode',
      label: 'Set cible',
      before: normalizeValue(currentValues.setCode),
      after: normalizeValue(mergedPayload.nextSetCode || mergedPayload.setCode)
    },
    {
      key: 'baseCode',
      label: 'Base code',
      before: normalizeValue(currentValues.baseCode),
      after: normalizeValue(mergedPayload.baseCode)
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
      after: normalizeValue(mergedPayload.name)
    },
    {
      key: 'rarity',
      label: 'Rarete',
      before: normalizeValue(currentValues.rarity),
      after: normalizeValue(mergedPayload.rarity)
    },
    {
      key: 'type',
      label: 'Type',
      before: normalizeValue(currentValues.type),
      after: normalizeValue(mergedPayload.type)
    },
    {
      key: 'variantType',
      label: 'Variant',
      before: normalizeValue(currentValues.variantType),
      after: normalizeValue(mergedPayload.variantType)
    },
    {
      key: 'availableLanguages',
      label: 'Langues',
      before: normalizeValue(currentValues.availableLanguages),
      after: normalizeValue(mergedPayload.availableLanguages)
    },
    {
      key: 'cardmarketProductId',
      label: 'ID Cardmarket',
      before: normalizeValue(currentValues.cardmarketProductId),
      after: normalizeValue(mergedPayload.cardmarketProductId)
    },
    {
      key: 'imageUrl',
      label: 'Image URL',
      before: normalizeValue(currentValues.imageUrl),
      after: normalizeValue(mergedPayload.imageUrl)
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
  const [sets, setSets] = useState<SetOption[]>([])
  const [rarityOptions, setRarityOptions] = useState<string[]>([])
  const [typeOptions, setTypeOptions] = useState<string[]>([])
  const [variantOptions, setVariantOptions] = useState<string[]>([])

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
    const [setsData, raritiesData, typesData, variantsData] = await Promise.all([
      supabase.from('sets').select('code, name').order('code', { ascending: true }),
      supabase.from('cards').select('rarity').not('rarity', 'is', null),
      supabase.from('cards').select('type').not('type', 'is', null),
      supabase.from('card_prints').select('variant_type').not('variant_type', 'is', null)
    ])

    const rarityValues = (((raritiesData.data as Array<{ rarity: string | null }> | null) || []) as Array<{
      rarity: string | null
    }>)
      .map((row) => String(row.rarity || '').trim())
      .filter(Boolean)
    const typeValues = (((typesData.data as Array<{ type: string | null }> | null) || []) as Array<{
      type: string | null
    }>)
      .map((row) => String(row.type || '').trim())
      .filter(Boolean)
    const variantValues = (((variantsData.data as Array<{ variant_type: string | null }> | null) || []) as Array<{
      variant_type: string | null
    }>)
      .map((row) => String(row.variant_type || '').trim())
      .filter(Boolean)

    setRows(submissions)
    setSets((((setsData.data as SetOption[] | null) || []) as SetOption[]))
    setRarityOptions([...new Set(rarityValues)].sort((a, b) => a.localeCompare(b, 'fr')))
    setTypeOptions([...new Set([...typeValues, 'DON!!'])].sort((a, b) => a.localeCompare(b, 'fr')))
    setVariantOptions([...new Set(variantValues)].sort((a, b) => a.localeCompare(b, 'fr')))
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
            setCode: String(row.payload?.setCode || ''),
            nextSetCode: String(row.payload?.nextSetCode || row.payload?.setCode || ''),
            baseCode: String(row.payload?.baseCode || ''),
            currentPrintCode: String(row.payload?.currentPrintCode || ''),
            printCode: String(row.payload?.printCode || ''),
            name: String(row.payload?.name || ''),
            rarity: String(row.payload?.rarity || ''),
            type: String(row.payload?.type || ''),
            variantType: String(row.payload?.variantType || ''),
            imageUrl: String(row.payload?.imageUrl || ''),
            cardmarketProductId: String(row.payload?.cardmarketProductId || ''),
            availableLanguages: Array.isArray(row.payload?.availableLanguages)
              ? (row.payload.availableLanguages as string[])
              : [],
            addressLine: String(row.payload?.addressLine || ''),
            city: String(row.payload?.city || ''),
            postalCode: String(row.payload?.postalCode || ''),
            country: String(row.payload?.country || ''),
            discordUrl: String(row.payload?.discordUrl || ''),
            websiteUrl: String(row.payload?.websiteUrl || ''),
            googleMapsUrl: String(row.payload?.googleMapsUrl || ''),
            activities: Array.isArray(row.payload?.activities)
              ? (row.payload.activities as string[])
              : []
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
              <option value="place_add">Lieux</option>
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
                      {row.submission_type !== 'place_add' && (
                        <>
                          <select
                            value={payloadOverrides[row.id]?.setCode || ''}
                            onChange={(e) =>
                              setPayloadOverrides((prev) => ({
                                ...prev,
                                [row.id]: { ...prev[row.id], setCode: e.target.value.toUpperCase() }
                              }))
                            }
                            style={fieldStyle()}
                          >
                            <option value="">Set source</option>
                            {sets.map((setRow) => (
                              <option key={`source-${setRow.code}`} value={setRow.code}>
                                {setRow.code}{setRow.name ? ` - ${setRow.name}` : ''}
                              </option>
                            ))}
                          </select>
                          <select
                            value={payloadOverrides[row.id]?.nextSetCode || ''}
                            onChange={(e) =>
                              setPayloadOverrides((prev) => ({
                                ...prev,
                                [row.id]: {
                                  ...prev[row.id],
                                  nextSetCode: e.target.value.toUpperCase()
                                }
                              }))
                            }
                            style={fieldStyle()}
                          >
                            <option value="">Set cible</option>
                            {sets.map((setRow) => (
                              <option key={`target-${setRow.code}`} value={setRow.code}>
                                {setRow.code}{setRow.name ? ` - ${setRow.name}` : ''}
                              </option>
                            ))}
                          </select>
                          <input
                            value={payloadOverrides[row.id]?.baseCode || ''}
                            onChange={(e) =>
                              setPayloadOverrides((prev) => ({
                                ...prev,
                                [row.id]: { ...prev[row.id], baseCode: e.target.value.toUpperCase() }
                              }))
                            }
                            placeholder="Base code"
                            style={fieldStyle()}
                          />
                        </>
                      )}
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
                      {row.submission_type !== 'place_add' && (
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
                      )}
                      {row.submission_type !== 'place_add' && (
                        <>
                          <input
                            value={payloadOverrides[row.id]?.name || ''}
                            onChange={(e) =>
                              setPayloadOverrides((prev) => ({
                                ...prev,
                                [row.id]: { ...prev[row.id], name: e.target.value }
                              }))
                            }
                            placeholder="Nom"
                            style={fieldStyle()}
                          />
                          <select
                            value={payloadOverrides[row.id]?.rarity || ''}
                            onChange={(e) =>
                              setPayloadOverrides((prev) => ({
                                ...prev,
                                [row.id]: { ...prev[row.id], rarity: e.target.value }
                              }))
                            }
                            style={fieldStyle()}
                          >
                            <option value="">Rarete</option>
                            {rarityOptions.map((option) => (
                              <option key={`${row.id}-rarity-${option}`} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                          <select
                            value={payloadOverrides[row.id]?.type || ''}
                            onChange={(e) =>
                              setPayloadOverrides((prev) => ({
                                ...prev,
                                [row.id]: { ...prev[row.id], type: e.target.value }
                              }))
                            }
                            style={fieldStyle()}
                          >
                            <option value="">Type</option>
                            {typeOptions.map((option) => (
                              <option key={`${row.id}-type-${option}`} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                          <select
                            value={payloadOverrides[row.id]?.variantType || ''}
                            onChange={(e) =>
                              setPayloadOverrides((prev) => ({
                                ...prev,
                                [row.id]: { ...prev[row.id], variantType: e.target.value }
                              }))
                            }
                            style={fieldStyle()}
                          >
                            <option value="">Variant</option>
                            {variantOptions.map((option) => (
                              <option key={`${row.id}-variant-${option}`} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                          <input
                            value={payloadOverrides[row.id]?.cardmarketProductId || ''}
                            onChange={(e) =>
                              setPayloadOverrides((prev) => ({
                                ...prev,
                                [row.id]: {
                                  ...prev[row.id],
                                  cardmarketProductId: e.target.value
                                }
                              }))
                            }
                            placeholder="ID Cardmarket"
                            style={fieldStyle()}
                          />
                          <input
                            value={payloadOverrides[row.id]?.imageUrl || ''}
                            onChange={(e) =>
                              setPayloadOverrides((prev) => ({
                                ...prev,
                                [row.id]: { ...prev[row.id], imageUrl: e.target.value }
                              }))
                            }
                            placeholder="Image URL"
                            style={fieldStyle()}
                          />
                          <div
                            style={{
                              border: '1px solid #e2e8f0',
                              borderRadius: 10,
                              padding: '10px 12px',
                              display: 'flex',
                              gap: 10,
                              flexWrap: 'wrap'
                            }}
                          >
                            {SET_LANGUAGE_CODES.map((language) => {
                              const checked = Boolean(
                                payloadOverrides[row.id]?.availableLanguages?.includes(language)
                              )

                              return (
                                <label
                                  key={`${row.id}-${language}`}
                                  style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) =>
                                      setPayloadOverrides((prev) => {
                                        const current =
                                          prev[row.id]?.availableLanguages || []
                                        return {
                                          ...prev,
                                          [row.id]: {
                                            ...prev[row.id],
                                            availableLanguages: e.target.checked
                                              ? [...current, language]
                                              : current.filter((entry) => entry !== language)
                                          }
                                        }
                                      })
                                    }
                                  />
                                  <span>{getCollectionLanguageShortLabel(language)}</span>
                                </label>
                              )
                            })}
                          </div>
                        </>
                      )}
                      {row.submission_type === 'place_add' && (
                        <>
                          <input
                            value={payloadOverrides[row.id]?.name || ''}
                            onChange={(e) =>
                              setPayloadOverrides((prev) => ({
                                ...prev,
                                [row.id]: { ...prev[row.id], name: e.target.value }
                              }))
                            }
                            placeholder="Nom du lieu"
                            style={fieldStyle()}
                          />
                          <input
                            value={payloadOverrides[row.id]?.city || ''}
                            onChange={(e) =>
                              setPayloadOverrides((prev) => ({
                                ...prev,
                                [row.id]: { ...prev[row.id], city: e.target.value }
                              }))
                            }
                            placeholder="Ville"
                            style={fieldStyle()}
                          />
                          <input
                            value={payloadOverrides[row.id]?.postalCode || ''}
                            onChange={(e) =>
                              setPayloadOverrides((prev) => ({
                                ...prev,
                                [row.id]: { ...prev[row.id], postalCode: e.target.value }
                              }))
                            }
                            placeholder="Code postal"
                            style={fieldStyle()}
                          />
                          <input
                            value={payloadOverrides[row.id]?.addressLine || ''}
                            onChange={(e) =>
                              setPayloadOverrides((prev) => ({
                                ...prev,
                                [row.id]: { ...prev[row.id], addressLine: e.target.value }
                              }))
                            }
                            placeholder="Adresse"
                            style={fieldStyle()}
                          />
                          <input
                            value={payloadOverrides[row.id]?.discordUrl || ''}
                            onChange={(e) =>
                              setPayloadOverrides((prev) => ({
                                ...prev,
                                [row.id]: { ...prev[row.id], discordUrl: e.target.value }
                              }))
                            }
                            placeholder="Discord"
                            style={fieldStyle()}
                          />
                          <input
                            value={payloadOverrides[row.id]?.websiteUrl || ''}
                            onChange={(e) =>
                              setPayloadOverrides((prev) => ({
                                ...prev,
                                [row.id]: { ...prev[row.id], websiteUrl: e.target.value }
                              }))
                            }
                            placeholder="Site web"
                            style={fieldStyle()}
                          />
                          <input
                            value={payloadOverrides[row.id]?.googleMapsUrl || ''}
                            onChange={(e) =>
                              setPayloadOverrides((prev) => ({
                                ...prev,
                                [row.id]: { ...prev[row.id], googleMapsUrl: e.target.value }
                              }))
                            }
                            placeholder="Google Maps"
                            style={fieldStyle()}
                          />
                          <input
                            value={payloadOverrides[row.id]?.imageUrl || ''}
                            onChange={(e) =>
                              setPayloadOverrides((prev) => ({
                                ...prev,
                                [row.id]: { ...prev[row.id], imageUrl: e.target.value }
                              }))
                            }
                            placeholder="Image URL"
                            style={fieldStyle()}
                          />
                        </>
                      )}
                    </div>

                    {row.submission_type === 'place_add' && (
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {PLACE_ACTIVITY_OPTIONS.map((activity) => {
                          const checked = Boolean(
                            payloadOverrides[row.id]?.activities?.includes(activity.value)
                          )

                          return (
                            <label
                              key={`${row.id}-${activity.value}`}
                              style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) =>
                                  setPayloadOverrides((prev) => {
                                    const current = prev[row.id]?.activities || []
                                    return {
                                      ...prev,
                                      [row.id]: {
                                        ...prev[row.id],
                                        activities: e.target.checked
                                          ? [...current, activity.value]
                                          : current.filter((entry) => entry !== activity.value)
                                      }
                                    }
                                  })
                                }
                              />
                              <span>{activity.label}</span>
                            </label>
                          )
                        })}
                      </div>
                    )}

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
