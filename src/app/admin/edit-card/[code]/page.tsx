'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/lib/auth'
import { isAdminEmail, parseAdminEmails } from '@/lib/admin'

type SetPrintOption = {
  id: string
  printCode: string
  variantType: string
  imagePath: string | null
  cardId: string
  baseCode: string
  number: string | null
  rarity: string
  type: string
  name: string
}

type SetOption = {
  code: string
  name: string | null
}

const STORAGE_BASE_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/cards-images`

export default function AdminEditCardPage() {
  const { user, loading: authLoading } = useAuth()
  const params = useParams<{ code: string }>()
  const code = (params?.code || '').toUpperCase()

  const adminEmails = parseAdminEmails(process.env.NEXT_PUBLIC_ADMIN_EMAILS)
  const canAccessAdmin = isAdminEmail(user?.email, adminEmails)

  const [loading, setLoading] = useState(true)
  const [printOptions, setPrintOptions] = useState<SetPrintOption[]>([])
  const [setOptions, setSetOptions] = useState<SetOption[]>([])
  const [editPrintId, setEditPrintId] = useState('')
  const [editTargetSetCode, setEditTargetSetCode] = useState('')
  const [editBaseCode, setEditBaseCode] = useState('')
  const [editPrintCode, setEditPrintCode] = useState('')
  const [editName, setEditName] = useState('')
  const [editRarity, setEditRarity] = useState('')
  const [editType, setEditType] = useState('')
  const [editVariantType, setEditVariantType] = useState('normal')
  const [editImageUrl, setEditImageUrl] = useState('')
  const [editSetMissingImage, setEditSetMissingImage] = useState(false)
  const [isUpdatingCard, setIsUpdatingCard] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [imageVersion, setImageVersion] = useState(0)
  const selectedPrint = printOptions.find((row) => row.id === editPrintId) || null
  const currentImageBaseUrl =
    selectedPrint?.imagePath && selectedPrint.imagePath !== '__missing__'
      ? `${STORAGE_BASE_URL}/${code}/${selectedPrint.imagePath}`
      : '__missing__'
  const currentImageUrl =
    currentImageBaseUrl !== '__missing__' ? `${currentImageBaseUrl}?v=${imageVersion}` : '__missing__'

  const getAuthHeader = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    const accessToken = data.session?.access_token
    return accessToken
      ? ({ Authorization: `Bearer ${accessToken}` } as Record<string, string>)
      : ({} as Record<string, string>)
  }, [])

  const loadSetPrints = useCallback(async () => {
    setLoading(true)
    const authHeaders = await getAuthHeader()
    const res = await fetch(`/api/admin/import-set/${code}/prints`, {
      headers: authHeaders
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setPrintOptions([])
      setEditPrintId('')
      setLogs([data?.error || 'Erreur chargement prints'])
      setLoading(false)
      return
    }

    const prints: SetPrintOption[] = data.prints || []
    setPrintOptions(prints)

    if (prints.length === 0) {
      setEditPrintId('')
      setEditTargetSetCode(code)
      setLoading(false)
      return
    }

    setEditPrintId((prev) => (prev && prints.some((p) => p.id === prev) ? prev : prints[0].id))
    setEditTargetSetCode(code)
    setLoading(false)
  }, [code, getAuthHeader])

  const loadSetOptions = useCallback(async () => {
    const { data, error } = await supabase
      .from('sets')
      .select('code, name')
      .order('code', { ascending: true })

    if (error) {
      setLogs((prev) => [...prev, `Erreur chargement sets: ${error.message}`])
      return
    }

    const rows = ((data || []) as Array<{ code: string; name: string | null }>).map((row) => ({
      code: String(row.code || '').toUpperCase(),
      name: row.name
    }))
    setSetOptions(rows)
  }, [])

  useEffect(() => {
    const selectedPrint = printOptions.find((row) => row.id === editPrintId)
    if (!selectedPrint) return
    setEditBaseCode(selectedPrint.baseCode || '')
    setEditPrintCode(selectedPrint.printCode || '')
    setEditName(selectedPrint.name || '')
    setEditRarity(selectedPrint.rarity || '')
    setEditType(selectedPrint.type || '')
    setEditVariantType(selectedPrint.variantType || 'normal')
    setEditImageUrl('')
    setEditSetMissingImage(false)
  }, [editPrintId, printOptions])

  useEffect(() => {
    if (!canAccessAdmin) {
      setLoading(false)
      return
    }
    if (!code) return
    loadSetOptions()
    loadSetPrints()
  }, [canAccessAdmin, code, loadSetOptions, loadSetPrints])

  const updateSelectedPrint = async () => {
    if (!editPrintId || isUpdatingCard) return

    setIsUpdatingCard(true)
    setLogs([])

    try {
      const authHeaders = await getAuthHeader()
      const res = await fetch(`/api/admin/import-set/${code}/update-card`, {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          printId: editPrintId,
          baseCode: editBaseCode.trim().toUpperCase(),
          printCode: editPrintCode.trim().toUpperCase(),
          name: editName.trim(),
          rarity: editRarity.trim(),
          type: editType.trim(),
          variantType: editVariantType.trim() || 'normal',
          targetSetCode: editTargetSetCode.trim().toUpperCase() || code,
          imageUrl: editImageUrl.trim(),
          setMissingImage: editSetMissingImage
        })
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setLogs([data?.error || 'Erreur modification carte'])
        return
      }

      const movedToSet = String(data?.updated?.setCode || code).toUpperCase()
      if (movedToSet !== code) {
        setLogs([
          `Carte deplacee: ${data?.updated?.printCode || editPrintCode} vers ${movedToSet}`
        ])
      } else {
        setLogs([`Carte modifiee: ${data?.updated?.printCode || editPrintCode}`])
      }
      setImageVersion(Date.now())
      await loadSetPrints()
    } finally {
      setIsUpdatingCard(false)
    }
  }

  if (authLoading || loading) return <div style={{ padding: 40 }}>Chargement...</div>
  if (!canAccessAdmin) return <div style={{ padding: 40 }}>Acces refuse.</div>

  return (
    <div style={{ padding: 40 }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/admin">Retour admin</Link>
      </div>

      <h1 style={{ marginBottom: 4 }}>Modification manuelle de carte</h1>
      <div style={{ marginBottom: 16 }}>
        Set cible: <strong>{code || '-'}</strong>
      </div>

      <div
        style={{
          border: '1px solid #ddd',
          borderRadius: 6,
          padding: 12,
          marginBottom: 20
        }}
      >
        {printOptions.length === 0 ? (
          <div>Aucune print a modifier.</div>
        ) : (
          <>
            <div style={{ marginBottom: 8 }}>
              <select
                value={editPrintId}
                onChange={(e) => setEditPrintId(e.target.value)}
                style={{ minWidth: 360 }}
              >
                {printOptions.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.printCode} - {row.name}
                  </option>
                ))}
              </select>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 8
              }}
            >
              <input
                placeholder="Base code"
                value={editBaseCode}
                onChange={(e) => setEditBaseCode(e.target.value)}
              />
              <input
                placeholder="Print code"
                value={editPrintCode}
                onChange={(e) => setEditPrintCode(e.target.value)}
              />
              <input
                placeholder="Nom"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
              <input
                placeholder="Rarete"
                value={editRarity}
                onChange={(e) => setEditRarity(e.target.value)}
              />
              <input
                placeholder="Type"
                value={editType}
                onChange={(e) => setEditType(e.target.value)}
              />
              <input
                placeholder="Variant type"
                value={editVariantType}
                onChange={(e) => setEditVariantType(e.target.value)}
              />
              <select
                value={editTargetSetCode}
                onChange={(e) => setEditTargetSetCode(e.target.value.toUpperCase())}
              >
                {(setOptions.length > 0 ? setOptions : [{ code, name: null }]).map((row) => (
                  <option key={row.code} value={row.code}>
                    {row.code}
                    {row.name ? ` - ${row.name}` : ''}
                  </option>
                ))}
              </select>
              <input
                readOnly
                value={currentImageUrl}
                title={currentImageUrl}
                style={{ gridColumn: '1 / -1', background: '#f8fafc', color: '#475569' }}
              />
              <div style={{ gridColumn: '1 / -1', fontSize: 12, color: '#64748b' }}>
                URL stockee: {currentImageBaseUrl}. Elle peut rester identique apres remplacement.
              </div>
              <input
                placeholder="Nouvelle image URL (optionnel)"
                value={editImageUrl}
                onChange={(e) => setEditImageUrl(e.target.value)}
                style={{ gridColumn: '1 / -1' }}
              />
            </div>

            <label style={{ display: 'inline-flex', gap: 8, marginTop: 8 }}>
              <input
                type="checkbox"
                checked={editSetMissingImage}
                onChange={(e) => setEditSetMissingImage(e.target.checked)}
              />
              Marquer image manquante (__missing__)
            </label>

            <div>
              <button
                onClick={updateSelectedPrint}
                disabled={isUpdatingCard}
                style={{
                  marginTop: 10,
                  background: '#1d4ed8',
                  color: '#fff',
                  border: 'none',
                  padding: '6px 10px',
                  borderRadius: 4,
                  opacity: isUpdatingCard ? 0.5 : 1
                }}
              >
                {isUpdatingCard ? 'Modification...' : 'Enregistrer modifications'}
              </button>
            </div>
          </>
        )}
      </div>

      <div>
        <h2 style={{ marginBottom: 8 }}>Logs</h2>
        <div
          style={{
            border: '1px solid #ddd',
            borderRadius: 6,
            padding: 10,
            minHeight: 80,
            maxHeight: 260,
            overflowY: 'auto',
            fontSize: 14
          }}
        >
          {logs.length === 0 ? (
            <div style={{ color: '#666' }}>Pas de logs pour le moment.</div>
          ) : (
            logs.map((line, index) => <div key={`${index}-${line}`}>{line}</div>)
          )}
        </div>
      </div>
    </div>
  )
}
