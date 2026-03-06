'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/lib/auth'
import { isAdminEmail, parseAdminEmails } from '@/lib/admin'

type MissingCard = {
  printCode: string
  baseCode: string
  name: string
  rarity: string
  type: string
}

type SetCardOption = {
  id: string
  baseCode: string
  number: string | null
  name: string
  ownersCount: number
  printsCount: number
}

export default function ImportMissingCardsPage() {
  const { user, loading: authLoading } = useAuth()
  const params = useParams<{ code: string }>()
  const code = (params?.code || '').toUpperCase()

  const adminEmails = parseAdminEmails(process.env.NEXT_PUBLIC_ADMIN_EMAILS)
  const canAccessAdmin = isAdminEmail(user?.email, adminEmails)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [setName, setSetName] = useState('')
  const [missingCards, setMissingCards] = useState<MissingCard[]>([])
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [logs, setLogs] = useState<string[]>([])
  const [isImporting, setIsImporting] = useState(false)
  const [cardOptions, setCardOptions] = useState<SetCardOption[]>([])
  const [selectedCardCodes, setSelectedCardCodes] = useState<Record<string, boolean>>({})
  const [isDeleting, setIsDeleting] = useState(false)

  const selectedPrintCodes = useMemo(
    () => Object.entries(selected).filter(([, value]) => value).map(([key]) => key),
    [selected]
  )
  const selectedCards = useMemo(
    () => cardOptions.filter((card) => Boolean(selectedCardCodes[card.baseCode])),
    [cardOptions, selectedCardCodes]
  )

  const getAuthHeader = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    const accessToken = data.session?.access_token
    return accessToken
      ? ({ Authorization: `Bearer ${accessToken}` } as Record<string, string>)
      : ({} as Record<string, string>)
  }, [])

  const loadMissingCards = useCallback(async (options?: { keepLogs?: boolean }) => {
    setLoading(true)
    setError(null)
    if (!options?.keepLogs) {
      setLogs([])
    }

    const authHeaders = await getAuthHeader()
    const res = await fetch(`/api/admin/import-set/${code}/missing`, {
      headers: authHeaders
    })
    const data = await res.json()

    if (!res.ok) {
      setError(data?.error || 'Erreur lors du chargement des cartes manquantes')
      setLoading(false)
      return
    }

    const list: MissingCard[] = data.missing || []
    setSetName(data?.set?.name || code)
    setMissingCards(list)
    setSelected(
      Object.fromEntries(list.map((card) => [card.printCode, true])) as Record<
        string,
        boolean
      >
    )
    setLoading(false)
  }, [code, getAuthHeader])

  const loadSetCards = useCallback(async () => {
    const authHeaders = await getAuthHeader()
    const res = await fetch(`/api/admin/import-set/${code}/cards`, {
      headers: authHeaders
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setCardOptions([])
      setSelectedCardCodes({})
      return
    }

    const cards: SetCardOption[] = data.cards || []
    setCardOptions(cards)
    setSelectedCardCodes(
      Object.fromEntries(cards.map((card) => [card.baseCode, false])) as Record<
        string,
        boolean
      >
    )
  }, [code, getAuthHeader])

  useEffect(() => {
    if (!canAccessAdmin) {
      setLoading(false)
      return
    }
    if (!code) return
    Promise.all([loadMissingCards(), loadSetCards()])
  }, [canAccessAdmin, code, loadMissingCards, loadSetCards])

  const toggleAll = (value: boolean) => {
    setSelected(
      Object.fromEntries(missingCards.map((card) => [card.printCode, value])) as Record<
        string,
        boolean
      >
    )
  }

  const importSelected = async () => {
    if (selectedPrintCodes.length === 0 || isImporting) return

    setIsImporting(true)
    setLogs([])

    try {
      const authHeaders = await getAuthHeader()
      const res = await fetch(`/api/admin/import-set/${code}`, {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          onlyPrintCodes: selectedPrintCodes
        })
      })

      if (!res.body) {
        setLogs(['Erreur: flux de logs indisponible'])
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const parsed = JSON.parse(line)
            if (parsed.log) setLogs((prev) => [...prev, parsed.log])
          } catch {
            setLogs((prev) => [...prev, line])
          }
        }
      }

      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer)
          if (parsed.log) setLogs((prev) => [...prev, parsed.log])
        } catch {
          setLogs((prev) => [...prev, buffer])
        }
      }

      await loadMissingCards()
    } finally {
      setIsImporting(false)
    }
  }

  const deleteCardFromSet = async () => {
    const targetCodes = selectedCards.map((card) => card.baseCode.trim().toUpperCase())
    if (targetCodes.length === 0 || isDeleting) return

    const ownersCount = selectedCards.reduce((sum, card) => sum + card.ownersCount, 0)
    const confirmed = confirm(
      `Supprimer ${targetCodes.length} carte(s) du set ${code} ?\nUtilisateurs impactes (somme): ${ownersCount}`
    )
    if (!confirmed) return

    setIsDeleting(true)
    setLogs([])

    try {
      const authHeaders = await getAuthHeader()
      const nextLogs: string[] = []

      for (const targetCode of targetCodes) {
        nextLogs.push(`--- Suppression ${targetCode} ---`)
        const res = await fetch(`/api/admin/import-set/${code}/delete-card`, {
          method: 'POST',
          headers: {
            ...authHeaders,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            mode: 'base',
            targetCode
          })
        })

        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          nextLogs.push(data?.error || 'Erreur inconnue')
        }
        const entryLogs = Array.isArray(data?.logs) ? data.logs : []
        if (entryLogs.length === 0 && res.ok) {
          nextLogs.push('Suppression terminee')
        } else {
          nextLogs.push(...entryLogs)
        }
      }

      setLogs(nextLogs)

      await loadSetCards()
      await loadMissingCards({ keepLogs: true })
    } finally {
      setIsDeleting(false)
    }
  }


  if (authLoading || loading) return <div style={{ padding: 40 }}>Chargement...</div>
  if (!canAccessAdmin) return <div style={{ padding: 40 }}>Acces refuse.</div>
  if (error) return <div style={{ padding: 40 }}>{error}</div>

  return (
    <div style={{ padding: 40 }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/admin">Retour admin</Link>
      </div>

      <h1 style={{ marginBottom: 4 }}>Import cartes manquantes</h1>
      <div style={{ marginBottom: 20 }}>
        Set: <strong>{code}</strong> ({setName}) - {missingCards.length} carte(s) manquante(s)
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <button onClick={() => toggleAll(true)}>Tout cocher</button>
        <button onClick={() => toggleAll(false)}>Tout decocher</button>
        <button
          onClick={importSelected}
          disabled={selectedPrintCodes.length === 0 || isImporting}
          style={{
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            padding: '6px 10px',
            borderRadius: 4,
            opacity: selectedPrintCodes.length === 0 || isImporting ? 0.5 : 1
          }}
        >
          {isImporting
            ? 'Import en cours...'
            : `Importer la selection (${selectedPrintCodes.length})`}
        </button>
      </div>

      <div
        style={{
          border: '1px solid #ddd',
          borderRadius: 6,
          maxHeight: 420,
          overflowY: 'auto',
          marginBottom: 20
        }}
      >
        {missingCards.length === 0 ? (
          <div style={{ padding: 12 }}>Aucune carte manquante.</div>
        ) : (
          missingCards.map((card) => (
            <label
              key={card.printCode}
              style={{
                display: 'grid',
                gridTemplateColumns: '24px 140px 1fr',
                gap: 8,
                alignItems: 'start',
                padding: '8px 10px',
                borderBottom: '1px solid #eee'
              }}
            >
              <input
                type="checkbox"
                checked={Boolean(selected[card.printCode])}
                onChange={(e) =>
                  setSelected((prev) => ({
                    ...prev,
                    [card.printCode]: e.target.checked
                  }))
                }
              />
              <code>{card.printCode}</code>
              <div>
                <div>{card.name}</div>
                <div style={{ fontSize: 12, color: '#666' }}>
                  {card.baseCode} {card.rarity ? `- ${card.rarity}` : ''}{' '}
                  {card.type ? `- ${card.type}` : ''}
                </div>
              </div>
            </label>
          ))
        )}
      </div>

      <div
        style={{
          border: '1px solid #ddd',
          borderRadius: 6,
          padding: 12,
          marginBottom: 20
        }}
      >
        <h2 style={{ margin: '0 0 10px' }}>Supprimer une carte du set</h2>
        <div style={{ marginBottom: 10, fontSize: 13, color: '#334155' }}>
          {selectedCards.length} carte(s) selectionnee(s)
        </div>
        <div
          style={{
            border: '1px solid #ddd',
            borderRadius: 6,
            maxHeight: 280,
            overflowY: 'auto',
            marginBottom: 10
          }}
        >
          {cardOptions.length === 0 ? (
            <div style={{ padding: 12 }}>Aucune carte.</div>
          ) : (
            cardOptions.map((card) => (
              <label
                key={card.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '24px 1fr',
                  gap: 8,
                  alignItems: 'start',
                  padding: '8px 10px',
                  borderBottom: '1px solid #eee'
                }}
              >
                <input
                  type="checkbox"
                  checked={Boolean(selectedCardCodes[card.baseCode])}
                  onChange={(e) =>
                    setSelectedCardCodes((prev) => ({
                      ...prev,
                      [card.baseCode]: e.target.checked
                    }))
                  }
                />
                <div>
                  <div>
                    <code>{card.baseCode}</code> - {card.name}
                  </div>
                  <div style={{ fontSize: 12, color: '#666' }}>
                    Numero {card.number || '-'} - {card.ownersCount} possesseur(s) -{' '}
                    {card.printsCount} print(s)
                  </div>
                </div>
              </label>
            ))
          )}
        </div>

        <button
          onClick={deleteCardFromSet}
          disabled={selectedCards.length === 0 || isDeleting}
          style={{
            background: '#b91c1c',
            color: '#fff',
            border: 'none',
            padding: '6px 10px',
            borderRadius: 4,
            opacity: selectedCards.length === 0 || isDeleting ? 0.5 : 1
          }}
        >
          {isDeleting
            ? 'Suppression...'
            : `Supprimer la selection (${selectedCards.length})`}
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
