'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/lib/auth'
import { isAdminEmail, parseAdminEmails } from '@/lib/admin'

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth()
  const adminEmails = parseAdminEmails(process.env.NEXT_PUBLIC_ADMIN_EMAILS)
  const canAccessAdmin = isAdminEmail(user?.email, adminEmails)
  const [apiSets, setApiSets] = useState<any[]>([])
  const [dbSets, setDbSets] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState<string[]>([])
  const [showModal, setShowModal] = useState(false)
  const [cronRows, setCronRows] = useState<
    Array<{
      name: 'price-guide' | 'catalog'
      table: string
      lastSeenOn: string | null
      ageHours: number | null
      healthy: boolean
      error: string | null
    }>
  >([])
  const [cronLoading, setCronLoading] = useState(false)
  const [backupLoading, setBackupLoading] = useState(false)
  const [backupResult, setBackupResult] = useState<{
    ok: boolean
    bucket?: string
    filePath?: string
    bytes?: number
    generatedAt?: string
    tableCounts?: Record<string, number>
    error?: string
  } | null>(null)
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
    setCronLoading(true)
    const apiRes = await fetch('https://www.optcgapi.com/api/allSets/')
    const apiData = await apiRes.json()

    const { data: setsData } = await supabase.from('sets').select('code')
    const authHeaders = await getAuthHeader()
    const cronRes = await fetch('/api/admin/cron/status', {
      headers: authHeaders
    })
    const cronData = await cronRes.json().catch(() => ({}))

    const baseSets = Array.isArray(apiData) ? apiData : []
    const hasPromoSet = baseSets.some(
      (set: any) => String(set?.set_id || '').replace('-', '').toUpperCase() === 'PROMO'
    )
    const mergedSets = hasPromoSet
      ? baseSets
      : [...baseSets, { set_id: 'PROMO', set_name: 'Promos Speciales' }]

    setApiSets(mergedSets)
    setDbSets(setsData?.map((s) => s.code) || [])
    setCronRows(Array.isArray(cronData?.rows) ? cronData.rows : [])
    setCronLoading(false)
    setLoading(false)
  }

  useEffect(() => {
    if (!canAccessAdmin) {
      setLoading(false)
      return
    }
    loadData()
  }, [canAccessAdmin])

  const importSet = async (
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

  const executeDeleteSet = async (
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
          'Ce set a des cartes dans des collections. Coche la confirmation pour forcer la suppression.'
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
    await executeDeleteSet(deleteDialog.code, deleteDialog.forceDelete, token)
  }

  const runDatabaseBackup = async () => {
    setBackupLoading(true)
    setBackupResult(null)

    try {
      const authHeaders = await getAuthHeader()
      const res = await fetch('/api/admin/backup/database', {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        }
      })
      const data = await res.json().catch(() => ({}))
      setBackupResult({
        ok: Boolean(data?.ok),
        bucket: data?.bucket,
        filePath: data?.filePath,
        bytes: data?.bytes,
        generatedAt: data?.generatedAt,
        tableCounts: data?.tableCounts,
        error: data?.error || (!res.ok ? 'Erreur sauvegarde' : undefined)
      })
    } finally {
      setBackupLoading(false)
    }
  }

  if (authLoading || loading) return <div style={{ padding: 40 }}>Chargement...</div>
  if (!canAccessAdmin) return <div style={{ padding: 40 }}>Acces refuse.</div>

  return (
    <div style={{ padding: 40 }}>
      <h1>Admin - Import Sets</h1>
      <div style={{ margin: '10px 0 20px' }}>
        <Link
          href="/admin/users"
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
            alignItems: 'center',
            marginLeft: 8
          }}
        >
          Lier cartes Cardmarket
        </Link>
      </div>

      <div
        style={{
          marginBottom: 16,
          border: '1px solid #d1d5db',
          borderRadius: 8,
          padding: 12,
          background: '#fff'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Supervision cron</h2>
          <button onClick={loadData} disabled={cronLoading}>
            {cronLoading ? 'Chargement...' : 'Rafraichir'}
          </button>
        </div>
        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
          {cronRows.map((row) => (
            <div
              key={row.name}
              style={{
                border: '1px solid #cbd5e1',
                borderRadius: 6,
                padding: 10,
                background: row.healthy ? '#ecfdf5' : '#fef2f2'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>{row.name}</strong>
                <span
                  style={{
                    fontSize: 12,
                    color: row.healthy ? '#166534' : '#991b1b',
                    fontWeight: 700
                  }}
                >
                  {row.healthy ? 'OK (<48h)' : 'ALERTE (>48h)'}
                </span>
              </div>
              <div style={{ fontSize: 13, marginTop: 4 }}>
                Derniere maj: {row.lastSeenOn || 'N/A'}{' '}
                {row.ageHours != null ? `(${row.ageHours}h)` : ''}
              </div>
              {row.error && (
                <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 4 }}>Erreur: {row.error}</div>
              )}
            </div>
          ))}
          {cronRows.length === 0 && (
            <div style={{ fontSize: 13, color: '#64748b' }}>Aucune donnee cron disponible.</div>
          )}
        </div>
      </div>

      <div
        style={{
          marginBottom: 16,
          border: '1px solid #d1d5db',
          borderRadius: 8,
          padding: 12,
          background: '#fff'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Sauvegarde base</h2>
          <button onClick={runDatabaseBackup} disabled={backupLoading}>
            {backupLoading ? 'Sauvegarde en cours...' : 'Sauvegarder maintenant'}
          </button>
        </div>

        {backupResult && (
          <div
            style={{
              marginTop: 10,
              fontSize: 13,
              color: backupResult.ok ? '#166534' : '#b91c1c'
            }}
          >
            {backupResult.ok ? (
              <>
                <div>Bucket: {backupResult.bucket}</div>
                <div>Fichier: {backupResult.filePath}</div>
                <div>Taille: {backupResult.bytes} bytes</div>
                <div>Date: {backupResult.generatedAt}</div>
                <div>
                  Tables:{' '}
                  {backupResult.tableCounts
                    ? Object.entries(backupResult.tableCounts)
                        .map(([table, count]) => `${table}=${count}`)
                        .join(', ')
                    : 'N/A'}
                </div>
              </>
            ) : (
              <div>Erreur: {backupResult.error || 'Erreur inconnue'}</div>
            )}
          </div>
        )}
      </div>

      {apiSets.map((set: any) => {
        const code = String(set?.set_id || '').replace('-', '').toUpperCase()
        const setName = String(set?.set_name || '')
        if (!code) return null
        const exists = dbSets.includes(code)

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
              {setName ? <span style={{ marginLeft: 8, color: '#64748b' }}>{setName}</span> : null}
            </div>

            {exists ? (
              <div style={{ display: 'flex', gap: 10 }}>
                <span style={{ color: 'green' }}>Deja importe</span>

                <button
                  onClick={() => importSet(code, { skipImages: true })}
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
                  onClick={() => importSet(code, { missingImagesOnly: true })}
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
                  onClick={() => importSet(code)}
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
                <button onClick={() => importSet(code)}>Importer</button>
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

            <button
              style={{ marginTop: 20 }}
              onClick={() => setShowModal(false)}
            >
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
              {deleteDialog.forceDelete ? 'Suppression forcee du set' : 'Suppression du set'}
            </h2>
            <div style={{ marginBottom: 10, color: '#334155' }}>
              Set cible: <strong>{deleteDialog.code}</strong>
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
                Je confirme vouloir supprimer {deleteDialog.forceDelete ? 'FORCEMENT' : ''} le set{' '}
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
