'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/lib/auth'
import { isAdminEmail, parseAdminEmails } from '@/lib/admin'

export default function AdminCreateCardPage() {
  const { user, loading: authLoading } = useAuth()
  const params = useParams<{ code: string }>()
  const code = (params?.code || '').toUpperCase()

  const adminEmails = parseAdminEmails(process.env.NEXT_PUBLIC_ADMIN_EMAILS)
  const canAccessAdmin = isAdminEmail(user?.email, adminEmails)

  const [baseCode, setBaseCode] = useState('')
  const [printCode, setPrintCode] = useState('')
  const [name, setName] = useState('')
  const [rarity, setRarity] = useState('')
  const [type, setType] = useState('')
  const [variantType, setVariantType] = useState('normal')
  const [imageUrl, setImageUrl] = useState('')
  const [cardmarketProductId, setCardmarketProductId] = useState('')
  const [jsonPayload, setJsonPayload] = useState('')
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [logs, setLogs] = useState<string[]>([])

  const canSubmit = useMemo(
    () => baseCode.trim() && printCode.trim() && name.trim(),
    [baseCode, printCode, name]
  )

  const getAuthHeader = async () => {
    const { data } = await supabase.auth.getSession()
    const accessToken = data.session?.access_token
    return accessToken
      ? ({ Authorization: `Bearer ${accessToken}` } as Record<string, string>)
      : ({} as Record<string, string>)
  }

  const handleSubmit = async () => {
    if (!canSubmit || isSaving) return

    setIsSaving(true)
    setLogs([])
    try {
      const authHeaders = await getAuthHeader()
      const res = await fetch(`/api/admin/import-set/${code}/manual-add`, {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          baseCode: baseCode.trim().toUpperCase(),
          printCode: printCode.trim().toUpperCase(),
          name: name.trim(),
          rarity: rarity.trim(),
          type: type.trim(),
          variantType: variantType.trim() || 'normal',
          imageUrl: imageUrl.trim(),
          cardmarketProductId: cardmarketProductId.trim()
        })
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setLogs([data?.error || 'Erreur ajout carte'])
        return
      }

      setLogs([
        `Carte creee: ${data?.card?.printCode || printCode} (${data?.card?.variantType || variantType})`
      ])
      setPrintCode('')
      setName('')
      setImageUrl('')
      setCardmarketProductId('')
    } finally {
      setIsSaving(false)
    }
  }

  const applyJsonPayload = () => {
    setJsonError(null)
    const raw = jsonPayload.trim()
    if (!raw) {
      setJsonError('JSON vide')
      return
    }

    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const toText = (value: unknown) => String(value || '').trim()

      const nextBaseCode = toText(parsed.base_code ?? parsed.baseCode)
      const nextPrintCode = toText(parsed.print_code ?? parsed.printCode)
      const nextName = toText(parsed.name)
      const nextRarity = toText(parsed.rarity)
      const nextType = toText(parsed.type)
      const nextVariant = toText(parsed.variant_type ?? parsed.variantType) || 'normal'
      const nextImage = toText(parsed.image_url ?? parsed.imageUrl)
      const nextCardmarketId = toText(
        parsed.cardmarket_product_id ?? parsed.cardmarketProductId ?? parsed.id_cardmarket
      )

      if (nextBaseCode) setBaseCode(nextBaseCode.toUpperCase())
      if (nextPrintCode) setPrintCode(nextPrintCode.toUpperCase())
      if (nextName) setName(nextName)
      if (nextRarity) setRarity(nextRarity)
      if (nextType) setType(nextType)
      setVariantType(nextVariant)
      setImageUrl(nextImage)
      setCardmarketProductId(nextCardmarketId)

      setLogs((prev) => ['JSON applique: champs pre-remplis', ...prev])
    } catch {
      setJsonError('JSON invalide')
    }
  }

  const copyCurrentJson = async () => {
    const payload = {
      base_code: baseCode.trim().toUpperCase(),
      print_code: printCode.trim().toUpperCase(),
      name: name.trim(),
      rarity: rarity.trim(),
      type: type.trim(),
      variant_type: variantType.trim() || 'normal',
      image_url: imageUrl.trim() || null,
      cardmarket_product_id: cardmarketProductId.trim() || null
    }

    const text = JSON.stringify(payload, null, 2)
    try {
      await navigator.clipboard.writeText(text)
      setLogs((prev) => ['JSON copie dans le presse-papiers', ...prev])
    } catch {
      setJsonPayload(text)
      setLogs((prev) => ['Impossible de copier automatiquement: JSON place dans la zone', ...prev])
    }
  }

  if (authLoading) return <div style={{ padding: 40 }}>Chargement...</div>
  if (!canAccessAdmin) return <div style={{ padding: 40 }}>Acces refuse.</div>

  return (
    <div style={{ padding: 40 }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/admin">Retour admin</Link>
      </div>

      <h1 style={{ marginBottom: 4 }}>Creation manuelle de carte</h1>
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
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, marginBottom: 6 }}>
            JSON pre-remplissage (script local Cardmarket)
          </div>
          <textarea
            placeholder='Colle ici le JSON {"base_code":"...","print_code":"...","name":"..."}'
            value={jsonPayload}
            onChange={(e) => setJsonPayload(e.target.value)}
            style={{
              width: '100%',
              minHeight: 90,
              resize: 'vertical',
              boxSizing: 'border-box',
              marginBottom: 8
            }}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={applyJsonPayload}>Pre-remplir depuis JSON</button>
            <button onClick={copyCurrentJson}>Copier JSON des champs</button>
          </div>
          {jsonError && <div style={{ color: '#b91c1c', marginTop: 6 }}>{jsonError}</div>}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 8
          }}
        >
          <input
            placeholder="Base code (ex: OP01-033)"
            value={baseCode}
            onChange={(e) => setBaseCode(e.target.value)}
          />
          <input
            placeholder="Print code (ex: OP01-033_P5)"
            value={printCode}
            onChange={(e) => setPrintCode(e.target.value)}
          />
          <input
            placeholder="Nom (ex: Izo)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            placeholder="Rarete (ex: UC)"
            value={rarity}
            onChange={(e) => setRarity(e.target.value)}
          />
          <input
            placeholder="Type (ex: Character)"
            value={type}
            onChange={(e) => setType(e.target.value)}
          />
          <input
            placeholder="Variant type (normal, Foil, Parallel...)"
            value={variantType}
            onChange={(e) => setVariantType(e.target.value)}
          />
          <input
            placeholder="ID Cardmarket (optionnel, ex: 870973)"
            value={cardmarketProductId}
            onChange={(e) => setCardmarketProductId(e.target.value)}
          />
          <input
            placeholder="Image URL (optionnel)"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            style={{ gridColumn: '1 / -1' }}
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={!canSubmit || isSaving}
          style={{
            marginTop: 10,
            background: '#0369a1',
            color: '#fff',
            border: 'none',
            padding: '6px 10px',
            borderRadius: 4,
            opacity: !canSubmit || isSaving ? 0.5 : 1
          }}
        >
          {isSaving ? 'Creation...' : 'Creer la carte'}
        </button>
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
