'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/lib/auth'
import { isAdminEmail, parseAdminEmails } from '@/lib/admin'

type AdminUser = {
  id: string
  email: string
  username: string
  createdAt: string | null
  lastSignInAt: string | null
  emailConfirmedAt: string | null
}

function formatDate(value: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('fr-FR')
}

export default function AdminUsersPage() {
  const { user, loading: authLoading } = useAuth()
  const adminEmails = parseAdminEmails(process.env.NEXT_PUBLIC_ADMIN_EMAILS)
  const canAccessAdmin = isAdminEmail(user?.email, adminEmails)

  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [logs, setLogs] = useState<string[]>([])
  const [isDeleting, setIsDeleting] = useState(false)

  const selectedIds = useMemo(
    () =>
      Object.entries(selected)
        .filter(([, checked]) => checked)
        .map(([id]) => id),
    [selected]
  )

  const getAuthHeader = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    const accessToken = data.session?.access_token
    return accessToken
      ? ({ Authorization: `Bearer ${accessToken}` } as Record<string, string>)
      : ({} as Record<string, string>)
  }, [])

  const loadUsers = useCallback(async () => {
    setLoading(true)
    const authHeaders = await getAuthHeader()
    const res = await fetch('/api/admin/users', { headers: authHeaders })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setUsers([])
      setSelected({})
      setLogs([data?.error || 'Erreur chargement users'])
      setLoading(false)
      return
    }

    const rows: AdminUser[] = Array.isArray(data?.users) ? data.users : []
    setUsers(rows)
    setSelected(
      Object.fromEntries(rows.map((row) => [row.id, false])) as Record<string, boolean>
    )
    setLoading(false)
  }, [getAuthHeader])

  useEffect(() => {
    if (!canAccessAdmin) {
      setLoading(false)
      return
    }
    loadUsers()
  }, [canAccessAdmin, loadUsers])

  const toggleAll = (checked: boolean) => {
    setSelected(
      Object.fromEntries(users.map((row) => [row.id, checked])) as Record<string, boolean>
    )
  }

  const deleteSelected = async () => {
    if (selectedIds.length === 0 || isDeleting) return

    const confirmed = confirm(
      `Supprimer ${selectedIds.length} utilisateur(s) ? Cette action est irreversible.`
    )
    if (!confirmed) return

    setIsDeleting(true)
    setLogs([])

    try {
      const authHeaders = await getAuthHeader()
      const res = await fetch('/api/admin/users/delete', {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userIds: selectedIds })
      })

      const data = await res.json().catch(() => ({}))
      const nextLogs = Array.isArray(data?.logs) ? data.logs : []
      setLogs(nextLogs.length > 0 ? nextLogs : [data?.error || 'Erreur suppression'])
      await loadUsers()
    } finally {
      setIsDeleting(false)
    }
  }

  if (authLoading || loading) return <div style={{ padding: 40 }}>Chargement...</div>
  if (!canAccessAdmin) return <div style={{ padding: 40 }}>Acces refuse.</div>

  return (
    <div style={{ padding: 40 }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/admin">Retour admin</Link>
      </div>

      <h1 style={{ marginBottom: 8 }}>Admin - Utilisateurs</h1>
      <div style={{ marginBottom: 14 }}>{users.length} utilisateur(s)</div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <button onClick={() => toggleAll(true)}>Tout cocher</button>
        <button onClick={() => toggleAll(false)}>Tout decocher</button>
        <button
          onClick={deleteSelected}
          disabled={selectedIds.length === 0 || isDeleting}
          style={{
            background: '#b91c1c',
            color: '#fff',
            border: 'none',
            padding: '6px 10px',
            borderRadius: 4,
            opacity: selectedIds.length === 0 || isDeleting ? 0.5 : 1
          }}
        >
          {isDeleting ? 'Suppression...' : `Supprimer la selection (${selectedIds.length})`}
        </button>
      </div>

      <div
        style={{
          border: '1px solid #ddd',
          borderRadius: 6,
          overflow: 'hidden',
          marginBottom: 20
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '30px minmax(220px,1.3fr) minmax(150px,1fr) minmax(150px,1fr) minmax(150px,1fr)',
            gap: 10,
            padding: '8px 10px',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            fontWeight: 600
          }}
        >
          <div />
          <div>Email / Username</div>
          <div>Cree le</div>
          <div>Derniere connexion</div>
          <div>Email confirme</div>
        </div>

        {users.length === 0 ? (
          <div style={{ padding: 12 }}>Aucun utilisateur.</div>
        ) : (
          users.map((row) => (
            <label
              key={row.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '30px minmax(220px,1.3fr) minmax(150px,1fr) minmax(150px,1fr) minmax(150px,1fr)',
                gap: 10,
                padding: '10px',
                borderBottom: '1px solid #eee',
                alignItems: 'start'
              }}
            >
              <input
                type="checkbox"
                checked={Boolean(selected[row.id])}
                onChange={(e) =>
                  setSelected((prev) => ({
                    ...prev,
                    [row.id]: e.target.checked
                  }))
                }
                disabled={row.id === user?.id}
              />
              <div>
                <div>{row.email || '-'}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  @{row.username || '-'} - {row.id}
                  {row.id === user?.id ? ' (toi)' : ''}
                </div>
              </div>
              <div>{formatDate(row.createdAt)}</div>
              <div>{formatDate(row.lastSignInAt)}</div>
              <div>{formatDate(row.emailConfirmedAt)}</div>
            </label>
          ))
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

