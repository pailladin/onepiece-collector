'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

import { useAuth } from '@/lib/auth'
import { isAdminEmail, parseAdminEmails } from '@/lib/admin'
import { supabase } from '@/lib/supabaseClient'

type SetOption = {
  id: string
  code: string
  name: string | null
}

type PrintRow = {
  printId: string
  printCode: string
  variantType: string
  cardId: string
  cardName: string
  baseCode: string
  cardNumber: string | null
  rarity: string
  imagePath: string | null
  linkedProductId: string | null
}

type Candidate = {
  imageUrl: string
  imageFallbackUrls?: string[]
  proxyImageUrl?: string
  proxyImageFallbackUrls?: string[]
  imageCode: string
  productId: string
  cardmarketUrl: string
}

const MISSING_IMAGE_PATH = '__missing__'

export default function AdminCardmarketLinksPage() {
  const { user, loading: authLoading } = useAuth()
  const adminEmails = parseAdminEmails(process.env.NEXT_PUBLIC_ADMIN_EMAILS)
  const canAccessAdmin = isAdminEmail(user?.email, adminEmails)

  const [sets, setSets] = useState<SetOption[]>([])
  const [selectedSetCode, setSelectedSetCode] = useState('')
  const [setSearch, setSetSearch] = useState('')
  const [onlyUnlinked, setOnlyUnlinked] = useState(true)
  const [rows, setRows] = useState<PrintRow[]>([])
  const [expansionIdOverride, setExpansionIdOverride] = useState('')
  const [loadingRows, setLoadingRows] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedPrintId, setSelectedPrintId] = useState<string | null>(null)
  const [candidatesByPrintId, setCandidatesByPrintId] = useState<Record<string, Candidate[]>>({})
  const [searchUrlByPrintId, setSearchUrlByPrintId] = useState<Record<string, string>>({})
  const [blockedStatusByPrintId, setBlockedStatusByPrintId] = useState<Record<string, number>>({})
  const [loadingCandidatesFor, setLoadingCandidatesFor] = useState<string | null>(null)
  const [manualProductIdByPrint, setManualProductIdByPrint] = useState<Record<string, string>>({})
  const [manualSourceUrlByPrint, setManualSourceUrlByPrint] = useState<Record<string, string>>({})
  const [savingPrintId, setSavingPrintId] = useState<string | null>(null)
  const [hoveredPrintId, setHoveredPrintId] = useState<string | null>(null)

  const selectedRow = useMemo(
    () => rows.find((row) => row.printId === selectedPrintId) || null,
    [rows, selectedPrintId]
  )

  const getAuthHeaders = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    const accessToken = data.session?.access_token
    return accessToken
      ? ({ Authorization: `Bearer ${accessToken}` } as Record<string, string>)
      : ({} as Record<string, string>)
  }, [])

  const loadSets = useCallback(async () => {
    const { data: setsData } = await supabase
      .from('sets')
      .select('id, code, name')
      .order('code')
    const { data: printsData } = await supabase
      .from('card_prints')
      .select('id, distribution_set_id')
    const { data: linksData } = await supabase
      .from('cardmarket_print_links')
      .select('card_print_id')

    const allSets = ((setsData as SetOption[] | null) || []).map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name
    }))

    const linkedPrintIds = new Set(
      (((linksData as Array<{ card_print_id: string }> | null) || []) as Array<{
        card_print_id: string
      }>).map((row) => row.card_print_id)
    )

    const unlinkedCountBySetId = new Map<string, number>()
    for (const print of
      (((printsData as Array<{ id: string; distribution_set_id: string }> | null) ||
        []) as Array<{ id: string; distribution_set_id: string }>)) {
      if (linkedPrintIds.has(print.id)) continue
      unlinkedCountBySetId.set(
        print.distribution_set_id,
        (unlinkedCountBySetId.get(print.distribution_set_id) || 0) + 1
      )
    }

    const next = allSets.filter((set) => (unlinkedCountBySetId.get(set.id) || 0) > 0)
    setSets(next)
    if (!selectedSetCode && next.length > 0) {
      setSelectedSetCode(next[0].code)
    } else if (
      selectedSetCode &&
      !next.some((set) => set.code === selectedSetCode)
    ) {
      setSelectedSetCode(next[0]?.code || '')
    }
  }, [selectedSetCode])

  const loadRows = useCallback(async () => {
    if (!selectedSetCode) return
    const isPromoSet = selectedSetCode.toUpperCase() === 'PROMO'

    setLoadingRows(true)
    setError(null)

    try {
      const authHeaders = await getAuthHeaders()
      const params = new URLSearchParams({
        setCode: selectedSetCode,
        onlyUnlinked: onlyUnlinked ? '1' : '0'
      })
      if (setSearch.trim()) {
        params.set('q', setSearch.trim())
      }
      if (isPromoSet) {
        params.set('requireQuery', '1')
      }
      const res = await fetch(
        `/api/admin/cardmarket-links/prints?${params.toString()}`,
        {
          headers: authHeaders
        }
      )
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data?.error || 'Erreur chargement prints')
      }

      const nextRows = (data?.rows || []) as PrintRow[]
      setRows(nextRows)
      setSelectedPrintId(nextRows[0]?.printId || null)
      setCandidatesByPrintId({})
      setManualProductIdByPrint({})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setLoadingRows(false)
    }
  }, [getAuthHeaders, onlyUnlinked, selectedSetCode, setSearch])

  const loadCandidates = useCallback(async (printId: string) => {
    setLoadingCandidatesFor(printId)
    setError(null)

    try {
      const authHeaders = await getAuthHeaders()
      const params = new URLSearchParams({ printId })
      if (expansionIdOverride.trim()) {
        params.set('expansionId', expansionIdOverride.trim())
      }
      const res = await fetch(`/api/admin/cardmarket-links/candidates?${params.toString()}`, {
        headers: authHeaders
      })
      const data = await res.json()

      if (!res.ok && !data?.searchUrl) {
        throw new Error(data?.error || 'Erreur suggestions')
      }

      const candidates = (data?.candidates || []) as Candidate[]
      setCandidatesByPrintId((prev) => ({ ...prev, [printId]: candidates }))
      if (candidates.length === 1 && candidates[0]?.productId) {
        setManualProductIdByPrint((prev) => ({
          ...prev,
          [printId]: candidates[0].productId
        }))
      }
      if (typeof data?.searchUrl === 'string') {
        setSearchUrlByPrintId((prev) => ({ ...prev, [printId]: data.searchUrl }))
      }
      if (data?.blocked && Number.isFinite(data?.blockedStatus)) {
        setBlockedStatusByPrintId((prev) => ({ ...prev, [printId]: Number(data.blockedStatus) }))
      } else {
        setBlockedStatusByPrintId((prev) => {
          const next = { ...prev }
          delete next[printId]
          return next
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setLoadingCandidatesFor(null)
    }
  }, [expansionIdOverride, getAuthHeaders])

  const saveLink = async (printId: string, productId: string, source: string, confidence: number) => {
    if (!productId.trim()) return
    setSavingPrintId(printId)
    setError(null)

    try {
      const authHeaders = await getAuthHeaders()
      const res = await fetch('/api/admin/cardmarket-links/link', {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          printId,
          productId: productId.trim(),
          source,
          confidence
        })
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'Erreur sauvegarde')
      }

      setRows((prev) =>
        prev.map((row) =>
          row.printId === printId ? { ...row, linkedProductId: productId.trim() } : row
        )
      )
      if (onlyUnlinked) {
        setRows((prev) => {
          const nextRows = prev.filter((row) => row.printId !== printId)
          const nextSelectedId = nextRows[0]?.printId || null
          setSelectedPrintId(nextSelectedId)
          return nextRows
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setSavingPrintId(null)
    }
  }

  useEffect(() => {
    if (!canAccessAdmin) return
    loadSets()
  }, [canAccessAdmin, loadSets])

  useEffect(() => {
    if (!canAccessAdmin || !selectedSetCode) return
    loadRows()
  }, [canAccessAdmin, selectedSetCode, onlyUnlinked, loadRows])

  useEffect(() => {
    if (!selectedPrintId) return
    if (loadingCandidatesFor === selectedPrintId) return
    if (candidatesByPrintId[selectedPrintId]) return
    void loadCandidates(selectedPrintId)
  }, [selectedPrintId, loadingCandidatesFor, candidatesByPrintId, loadCandidates])

  if (authLoading) return <div style={{ padding: 40 }}>Chargement...</div>
  if (!canAccessAdmin) return <div style={{ padding: 40 }}>Acces refuse.</div>

  const selectedCandidates = selectedPrintId ? candidatesByPrintId[selectedPrintId] || [] : []
  const selectedSearchUrl = selectedPrintId ? searchUrlByPrintId[selectedPrintId] || null : null
  const selectedBlockedStatus = selectedPrintId ? blockedStatusByPrintId[selectedPrintId] : undefined
  const isPromoSet = selectedSetCode.toUpperCase() === 'PROMO'

  const extractProductIdFromText = (value: string): string | null => {
    const raw = value.trim()
    if (!raw) return null

    try {
      const asUrl = new URL(raw)
      const idProduct = asUrl.searchParams.get('idProduct')
      if (idProduct && /^\d+$/.test(idProduct)) return idProduct
    } catch {
      // Not an URL, continue with regexes.
    }

    const fromImage = raw.match(/\/(\d+)\/\1\.(?:jpg|jpeg|png|webp)(?:[?#].*)?$/i)
    if (fromImage?.[1]) return fromImage[1]

    const fromAny = raw.match(/idProduct=(\d+)/i)
    if (fromAny?.[1]) return fromAny[1]

    return null
  }

  const localStorageBaseUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/cards-images`
  const getLocalImageUrl = (row: PrintRow): string | null =>
    row.imagePath && row.imagePath !== MISSING_IMAGE_PATH
      ? `${localStorageBaseUrl}/${selectedSetCode}/${row.imagePath}`
      : null

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>Admin - Liens Cardmarket</h1>
        <Link href="/admin" style={{ color: '#1d4ed8', textDecoration: 'none' }}>
          Retour admin
        </Link>
      </div>

      <div
        style={{
          border: '1px solid #d1d5db',
          borderRadius: 8,
          padding: 12,
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: 16
        }}
      >
        <label>
          Set:{' '}
          <select
            value={selectedSetCode}
            onChange={(e) => setSelectedSetCode(e.target.value)}
            style={{ padding: 4 }}
          >
            {sets.map((set) => (
              <option key={set.code} value={set.code}>
                {set.code} - {set.name || set.code}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={onlyUnlinked}
            onChange={(e) => setOnlyUnlinked(e.target.checked)}
          />
          Non lies uniquement
        </label>

        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          idExpansion:
          <input
            type="text"
            value={expansionIdOverride}
            onChange={(e) => setExpansionIdOverride(e.target.value)}
            placeholder="auto"
            style={{ width: 90, padding: 4 }}
          />
        </label>

        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          Recherche:
          <input
            type="text"
            value={setSearch}
            onChange={(e) => setSetSearch(e.target.value)}
            placeholder={isPromoSet ? 'Obligatoire pour PROMO (code ou nom)' : 'Code ou nom'}
            style={{ width: 240, padding: 4 }}
          />
        </label>

        <button onClick={loadRows} disabled={loadingRows}>
          {loadingRows ? 'Chargement...' : 'Rafraichir'}
        </button>
      </div>

      {isPromoSet && !setSearch.trim() && (
        <div style={{ marginBottom: 12, color: '#92400e', fontSize: 13 }}>
          Set PROMO: la liste est volontairement vide tant que tu n as pas saisi une recherche.
        </div>
      )}

      {error && (
        <div style={{ marginBottom: 12, color: '#b91c1c', fontSize: 14 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16 }}>
        <div style={{ border: '1px solid #d1d5db', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: 10, borderBottom: '1px solid #e5e7eb', background: '#f8fafc' }}>
            Cartes ({rows.length})
          </div>
          <div style={{ maxHeight: 560, overflow: 'auto' }}>
            {rows.length === 0 ? (
              <div style={{ padding: 12, color: '#475569' }}>Aucune carte a afficher.</div>
            ) : (
              rows.map((row) => {
                const selected = row.printId === selectedPrintId
                return (
                  <button
                    key={row.printId}
                    onClick={() => {
                      setSelectedPrintId(row.printId)
                      void loadCandidates(row.printId)
                    }}
                    onMouseEnter={() => setHoveredPrintId(row.printId)}
                    onMouseLeave={() => setHoveredPrintId((current) => (current === row.printId ? null : current))}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      border: 'none',
                      borderBottom: '1px solid #e5e7eb',
                      background: selected ? '#eff6ff' : '#fff',
                      padding: 10,
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>{row.printCode}</div>
                    <div style={{ fontSize: 13, color: '#334155' }}>{row.cardName}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      {row.baseCode} | {row.rarity || 'n/a'} | {row.variantType}
                    </div>
                    {(() => {
                      const previewUrl = getLocalImageUrl(row)
                      const showPreview = Boolean(previewUrl) && (selected || hoveredPrintId === row.printId)
                      if (!showPreview || !previewUrl) return null
                      return (
                        <div style={{ marginTop: 8 }}>
                          <img
                            src={previewUrl}
                            alt={`Preview ${row.printCode}`}
                            style={{
                              width: 72,
                              height: 100,
                              objectFit: 'cover',
                              border: '1px solid #cbd5e1',
                              borderRadius: 4,
                              background: '#fff'
                            }}
                          />
                        </div>
                      )
                    })()}
                    {row.linkedProductId && (
                      <div style={{ fontSize: 12, color: '#047857' }}>
                        Lie: {row.linkedProductId}
                      </div>
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>

        <div style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: 12 }}>
          {!selectedRow ? (
            <div style={{ color: '#475569' }}>Selectionne une carte.</div>
          ) : (
            <>
              <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 18 }}>{selectedRow.printCode}</h2>
              <div style={{ fontSize: 14, color: '#334155', marginBottom: 10 }}>
                {selectedRow.cardName}
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button
                  onClick={() => loadCandidates(selectedRow.printId)}
                  disabled={loadingCandidatesFor === selectedRow.printId}
                >
                  {loadingCandidatesFor === selectedRow.printId
                    ? 'Recherche...'
                    : 'Charger suggestions'}
                </button>
                {selectedSearchUrl && (
                  <a
                    href={selectedSearchUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 13, color: '#1d4ed8', alignSelf: 'center' }}
                  >
                    Ouvrir recherche Cardmarket
                  </a>
                )}
              </div>

              {selectedBlockedStatus && (
                <div style={{ fontSize: 12, color: '#b45309', marginBottom: 10 }}>
                  Cardmarket bloque le parsing serveur (HTTP {selectedBlockedStatus}). Utilise
                  l ouverture de recherche puis colle une URL image/produit ci-dessous.
                </div>
              )}

              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 13, marginBottom: 6 }}>Saisie manuelle idProduct</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    value={manualProductIdByPrint[selectedRow.printId] || ''}
                    onChange={(e) =>
                      setManualProductIdByPrint((prev) => ({
                        ...prev,
                        [selectedRow.printId]: e.target.value
                      }))
                    }
                    placeholder="ex: 870973"
                    style={{ flex: 1, padding: 6 }}
                  />
                  <button
                    onClick={() =>
                      saveLink(
                        selectedRow.printId,
                        manualProductIdByPrint[selectedRow.printId] || '',
                        'manual',
                        100
                      )
                    }
                    disabled={savingPrintId === selectedRow.printId}
                  >
                    Associer
                  </button>
                </div>
                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    value={manualSourceUrlByPrint[selectedRow.printId] || ''}
                    onChange={(e) =>
                      setManualSourceUrlByPrint((prev) => ({
                        ...prev,
                        [selectedRow.printId]: e.target.value
                      }))
                    }
                    placeholder="Colle URL image S3 ou URL produit Cardmarket"
                    style={{ flex: 1, padding: 6 }}
                  />
                  <button
                    onClick={() => {
                      const parsed = extractProductIdFromText(
                        manualSourceUrlByPrint[selectedRow.printId] || ''
                      )
                      if (!parsed) {
                        setError('Impossible d extraire idProduct depuis cette URL')
                        return
                      }
                      setError(null)
                      setManualProductIdByPrint((prev) => ({
                        ...prev,
                        [selectedRow.printId]: parsed
                      }))
                    }}
                  >
                    Extraire idProduct
                  </button>
                </div>
              </div>

              <div style={{ maxHeight: 330, overflow: 'auto' }}>
                {selectedCandidates.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#64748b' }}>
                    Aucune suggestion chargee.
                  </div>
                ) : (
                  selectedCandidates.map((candidate) => (
                    <div
                      key={`${candidate.productId}-${candidate.imageCode}`}
                      style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: 6,
                        padding: 8,
                        marginBottom: 8
                      }}
                    >
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>idProduct #{candidate.productId}</div>
                      <div style={{ marginBottom: 8 }}>
                        <img
                          src={candidate.proxyImageUrl || candidate.imageUrl}
                          alt={`Cardmarket ${candidate.productId}`}
                          onError={(e) => {
                            const target = e.currentTarget
                            const fallbacks = candidate.proxyImageFallbackUrls || candidate.imageFallbackUrls || []
                            const idx = Number.parseInt(target.dataset.fallbackIndex || '0', 10)
                            if (!Number.isFinite(idx) || idx < 0 || idx >= fallbacks.length) return
                            target.dataset.fallbackIndex = String(idx + 1)
                            target.src = fallbacks[idx]
                          }}
                          style={{
                            width: 120,
                            height: 168,
                            objectFit: 'cover',
                            border: '1px solid #e5e7eb',
                            borderRadius: 4
                          }}
                        />
                      </div>
                      <div style={{ fontSize: 11, color: '#334155', marginBottom: 6 }}>
                        URL image:{' '}
                        <a
                          href={candidate.imageUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: '#1d4ed8', wordBreak: 'break-all' }}
                        >
                          {candidate.imageUrl}
                        </a>
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
                        Code image: {candidate.imageCode}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() =>
                            setManualProductIdByPrint((prev) => ({
                              ...prev,
                              [selectedRow.printId]: candidate.productId
                            }))
                          }
                        >
                          Utiliser ce code
                        </button>
                        <a
                          href={candidate.cardmarketUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: 13, color: '#1d4ed8', alignSelf: 'center' }}
                        >
                          Ouvrir Cardmarket
                        </a>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
