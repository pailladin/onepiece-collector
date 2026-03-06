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

  const getAuthHeader = async () => {
    const { data } = await supabase.auth.getSession()
    const accessToken = data.session?.access_token
    return accessToken
      ? ({ Authorization: `Bearer ${accessToken}` } as Record<string, string>)
      : ({} as Record<string, string>)
  }

  const loadData = async () => {
    const apiRes = await fetch('https://www.optcgapi.com/api/allSets/')
    const apiData = await apiRes.json()

    const { data: setsData } = await supabase.from('sets').select('code')

    setApiSets(apiData)
    setDbSets(setsData?.map((s) => s.code) || [])
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

  const deleteSet = async (code: string, forceDelete = false) => {
    if (!forceDelete && !confirm(`Supprimer le set ${code} ?`)) return

    setLogs([])
    setShowModal(true)

    const authHeaders = await getAuthHeader()
    const res = await fetch(`/api/admin/delete-set/${code}`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ forceDelete })
    })

    const data = await res.json()
    setLogs(data.logs || ['Erreur inconnue'])

    if (res.status === 409 && !forceDelete) {
      const confirmForce = confirm(
        `Le set ${code} a des cartes dans des collections. Forcer la suppression et supprimer aussi ces entrees ?`
      )
      if (confirmForce) {
        await deleteSet(code, true)
        return
      }
    }

    await loadData()
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

      {apiSets.map((set: any) => {
        const code = set.set_id.replace('-', '')
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
            <div>{code}</div>

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
                  onClick={() => deleteSet(code)}
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
    </div>
  )
}
