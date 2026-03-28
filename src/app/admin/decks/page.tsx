'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/lib/auth'
import { isAdminEmail, parseAdminEmails } from '@/lib/admin'

type ApiDeckRow = {
  structure_deck_id?: string | null
  structure_deck_name?: string | null
}

function normalizeDeckCode(value: string | null | undefined) {
  return (value || '').replace(/-/g, '').trim().toUpperCase()
}

export default function AdminDecksPage() {
  const { user, loading: authLoading } = useAuth()
  const adminEmails = parseAdminEmails(process.env.NEXT_PUBLIC_ADMIN_EMAILS)
  const canAccessAdmin = isAdminEmail(user?.email, adminEmails)
  const [apiDecks, setApiDecks] = useState<ApiDeckRow[]>([])
  const [dbDecks, setDbDecks] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState<string[]>([])
  const [showModal, setShowModal] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean
    code: string
    forceDelete: boolean
    token: string
    confirmChecked: boolean
    error: string | null
  }>({
    open: false,
    code: '',
    forceDelete: false,
    token: '',
    confirmChecked: false,
    error: null
  })

  const getAuthHeader = async () => {
    const { data } = await supabase.auth.getSession()
    const accessToken = data.session?.access_token
    return accessToken
      ? ({ Authorization: `Bearer ${accessToken}` } as Record<string, string>)
      : ({} as Record<string, string>)
  }

  const loadData = async () => {
    const apiRes = await fetch('https://www.optcgapi.com/api/allDecks/')
    const apiData = await apiRes.json().catch(() => [])
    const { data: setsData } = await supabase.from('sets').select('code')

    setApiDecks(Array.isArray(apiData) ? (apiData as ApiDeckRow[]) : [])
    setDbDecks(
      (setsData?.map((row) => normalizeDeckCode(row.code)).filter((code) => /^ST\d{2}$/.test(code)) ||
        []) as string[]
    )
    setLoading(false)
  }

  useEffect(() => {
    if (!canAccessAdmin) {
      setLoading(false)
      return
    }
    loadData()
  }, [canAccessAdmin])

  const importDeck = async (
    code: string,
    options?: { skipImages?: boolean; missingImagesOnly?: boolean }
  ) => {
    setLogs([])
    setShowModal(true)

    const authHeaders = await getAuthHeader()
    const res = await fetch(`/api/admin/import-set/${code}`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        skipImages: Boolean(options?.skipImages),
        missingImagesOnly: Boolean(options?.missingImagesOnly)
      })
    })

    if (!res.body) {
      setLogs(['Erreur: flux de logs indisponible'])
      await loadData()
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
          if (parsed.log) {
            setLogs((prev) => [...prev, parsed.log])
          }
        } catch {
          setLogs((prev) => [...prev, line])
        }
      }
    }

    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer)
        if (parsed.log) {
          setLogs((prev) => [...prev, parsed.log])
        }
      } catch {
        setLogs((prev) => [...prev, buffer])
      }
    }

    await loadData()
  }

  const executeDeleteDeck = async (
    code: string,
    forceDelete = false,
    deleteToken: string
  ) => {
    setLogs([])
    setShowModal(true)

    const authHeaders = await getAuthHeader()
    const res = await fetch(`/api/admin/delete-set/${code}`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ forceDelete, deleteToken })
    })

    const data = await res.json()
    setLogs(data.logs || ['Erreur inconnue'])

    if (res.status === 409 && !forceDelete) {
      setDeleteDialog({
        open: true,
        code,
        forceDelete: true,
        token: deleteToken,
        confirmChecked: false,
        error:
          'Ce deck a des cartes dans des collections. Coche la confirmation pour forcer la suppression.'
      })
      return
    }

    await loadData()
  }

  const openDeleteDialog = (code: string) => {
    setDeleteDialog({
      open: true,
      code,
      forceDelete: false,
      token: '',
      confirmChecked: false,
      error: null
    })
  }

  const closeDeleteDialog = () => {
    setDeleteDialog((prev) => ({ ...prev, open: false }))
  }

  const submitDeleteDialog = async () => {
    if (!deleteDialog.code) return
    const token = deleteDialog.token.trim()
    if (!token) {
      setDeleteDialog((prev) => ({ ...prev, error: 'Token requis' }))
      return
    }
    if (!deleteDialog.confirmChecked) {
      setDeleteDialog((prev) => ({ ...prev, error: 'Confirmation requise' }))
      return
    }

    closeDeleteDialog()
    await executeDeleteDeck(deleteDialog.code, deleteDialog.forceDelete, token)
  }

  if (authLoading || loading) return <div style={{ padding: 40 }}>Chargement...</div>
  if (!canAccessAdmin) return <div style={{ padding: 40 }}>Acces refuse.</div>

  return (
    <div style={{ padding: 40 }}>
      <h1>Admin - Import Decks</h1>
      <div style={{ margin: '10px 0 20px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Link
          href="/admin"
          style={{
            background: '#111827',
            color: '#fff',
            padding: '6px 10px',
            borderRadius: 4,
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center'
          }}
        >
          Retour aux sets
        </Link>
        <Link
          href="/admin/users"
          style={{
            background: '#374151',
            color: '#fff',
            padding: '6px 10px',
            borderRadius: 4,
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center'
          }}
        >
          Gerer les utilisateurs
        </Link>
        <Link
          href="/admin/cardmarket-links"
          style={{
            background: '#1d4ed8',
            color: '#fff',
            padding: '6px 10px',
            borderRadius: 4,
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center'
          }}
        >
          Lier cartes Cardmarket
        </Link>
        <Link
          href="/admin/don-cards"
          style={{
            background: '#be123c',
            color: '#fff',
            padding: '6px 10px',
            borderRadius: 4,
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center'
          }}
        >
          Resoudre les DON
        </Link>
      </div>

      {apiDecks.map((deck) => {
        const code = normalizeDeckCode(deck?.structure_deck_id)
        const deckName = String(deck?.structure_deck_name || '')
        if (!code) return null
        const exists = dbDecks.includes(code)

        return (
          <div
            key={code}
            style={{
              marginBottom: 10,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <div>
              <strong>{code}</strong>
              {deckName ? <span style={{ marginLeft: 8, color: '#64748b' }}>{deckName}</span> : null}
            </div>

            {exists ? (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <span style={{ color: 'green' }}>Deja importe</span>

                <button
                  onClick={() => importDeck(code, { skipImages: true })}
                  style={{
                    background: '#2563eb',
                    color: '#fff',
                    border: 'none',
                    padding: '4px 8px',
                    borderRadius: 4
                  }}
                >
                  Recharger sans images
                </button>

                <button
                  onClick={() => importDeck(code, { missingImagesOnly: true })}
                  style={{
                    background: '#f59e0b',
                    color: '#111827',
                    border: 'none',
                    padding: '4px 8px',
                    borderRadius: 4
                  }}
                >
                  Reimporter images manquantes
                </button>

                <button
                  onClick={() => importDeck(code)}
                  style={{
                    background: '#0ea5e9',
                    color: '#fff',
                    border: 'none',
                    padding: '4px 8px',
                    borderRadius: 4
                  }}
                >
                  Mise a jour (avec images)
                </button>

                <Link
                  href={`/admin/import-missing/${code}`}
                  style={{
                    background: '#0f766e',
                    color: '#fff',
                    border: 'none',
                    padding: '4px 8px',
                    borderRadius: 4,
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center'
                  }}
                >
                  Importer manquantes
                </Link>

                <Link
                  href={`/admin/import-missing/${code}`}
                  style={{
                    background: '#7c3aed',
                    color: '#fff',
                    border: 'none',
                    padding: '4px 8px',
                    borderRadius: 4,
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center'
                  }}
                >
                  Gerer cartes
                </Link>

                <Link
                  href={`/admin/edit-card/${code}`}
                  style={{
                    background: '#1d4ed8',
                    color: '#fff',
                    border: 'none',
                    padding: '4px 8px',
                    borderRadius: 4,
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center'
                  }}
                >
                  Modifier carte
                </Link>

                <Link
                  href={`/admin/create-card/${code}`}
                  style={{
                    background: '#075985',
                    color: '#fff',
                    border: 'none',
                    padding: '4px 8px',
                    borderRadius: 4,
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center'
                  }}
                >
                  Creer carte
                </Link>

                <button
                  onClick={() => openDeleteDialog(code)}
                  style={{
                    background: '#d9534f',
                    color: '#fff',
                    border: 'none',
                    padding: '4px 8px',
                    borderRadius: 4
                  }}
                >
                  Supprimer
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => importDeck(code)}>Importer</button>
                <Link
                  href={`/admin/create-card/${code}`}
                  style={{
                    background: '#075985',
                    color: '#fff',
                    border: 'none',
                    padding: '4px 8px',
                    borderRadius: 4,
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center'
                  }}
                >
                  Creer carte
                </Link>
              </div>
            )}
          </div>
        )
      })}

      {showModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
          }}
        >
          <div
            style={{
              background: '#fff',
              padding: 20,
              width: 500,
              maxHeight: 400,
              overflowY: 'auto',
              borderRadius: 6
            }}
          >
            <h2>Logs</h2>

            <div style={{ fontSize: 14 }}>
              {logs.map((log, index) => (
                <div key={index}>{log}</div>
              ))}
            </div>

            <button style={{ marginTop: 20 }} onClick={() => setShowModal(false)}>
              Fermer
            </button>
          </div>
        </div>
      )}

      {deleteDialog.open && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1100
          }}
        >
          <div
            style={{
              background: '#fff',
              padding: 20,
              width: 520,
              borderRadius: 8,
              boxShadow: '0 10px 30px rgba(0,0,0,0.2)'
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: 10 }}>
              {deleteDialog.forceDelete ? 'Suppression forcee du deck' : 'Suppression du deck'}
            </h2>
            <div style={{ marginBottom: 10, color: '#334155' }}>
              Deck cible: <strong>{deleteDialog.code}</strong>
            </div>
            <div style={{ marginBottom: 10, color: deleteDialog.forceDelete ? '#b91c1c' : '#334155' }}>
              {deleteDialog.forceDelete
                ? 'Attention: la suppression forcee effacera aussi les entrees de collection liees.'
                : 'Cette action est irreversible.'}
            </div>

            <label style={{ display: 'block', marginBottom: 10, fontSize: 13, color: '#334155' }}>
              Token de suppression (CRON_SECRET)
            </label>
            <input
              type="password"
              value={deleteDialog.token}
              onChange={(e) =>
                setDeleteDialog((prev) => ({
                  ...prev,
                  token: e.target.value,
                  error: null
                }))
              }
              placeholder="Saisir le token"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '8px 10px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                marginBottom: 12
              }}
            />

            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 12 }}>
              <input
                type="checkbox"
                checked={deleteDialog.confirmChecked}
                onChange={(e) =>
                  setDeleteDialog((prev) => ({
                    ...prev,
                    confirmChecked: e.target.checked,
                    error: null
                  }))
                }
              />
              <span style={{ fontSize: 13, color: '#334155' }}>
                Je confirme vouloir supprimer {deleteDialog.forceDelete ? 'FORCEMENT' : ''} le deck{' '}
                <strong>{deleteDialog.code}</strong>.
              </span>
            </label>

            {deleteDialog.error && (
              <div style={{ marginBottom: 10, color: '#b91c1c', fontSize: 13 }}>{deleteDialog.error}</div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={closeDeleteDialog}>Annuler</button>
              <button
                onClick={submitDeleteDialog}
                style={{
                  background: '#d9534f',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  padding: '7px 12px'
                }}
              >
                {deleteDialog.forceDelete ? 'Confirmer suppression forcee' : 'Confirmer suppression'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
