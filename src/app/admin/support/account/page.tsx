'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type SupportUser = {
  id: string
  email: string
  createdAt: string | null
  lastSignInAt: string | null
  emailConfirmedAt: string | null
  username: string
  postalCode: string
  discordUsername: string
  identities: Array<{ id: string; provider: string; email: string }>
}

function formatDate(value: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('fr-FR')
}

export default function AdminSupportAccountPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<SupportUser | null>(null)

  const getAuthHeaders = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    const accessToken = data.session?.access_token
    return accessToken
      ? ({ Authorization: `Bearer ${accessToken}` } as Record<string, string>)
      : ({} as Record<string, string>)
  }, [])

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      setError(null)

      const authHeaders = await getAuthHeaders()
      const res = await fetch('/api/admin/support/account', { headers: authHeaders })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setUser(null)
        setError(data?.error || 'Erreur chargement compte support')
        setLoading(false)
        return
      }

      setUser(data?.user || null)
      setLoading(false)
    }

    void loadData()
  }, [getAuthHeaders])

  if (loading) return <div style={{ padding: 40 }}>Chargement...</div>

  return (
    <div style={{ padding: 40, display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Link href="/admin/users">Retour admin users</Link>
        <Link href="/admin/support/collection">Voir sa collection</Link>
      </div>

      <h1 style={{ margin: 0 }}>Support lecture seule - Compte</h1>

      {error && <div style={{ color: '#b91c1c' }}>{error}</div>}

      {!error && user && (
        <>
          <section style={{ border: '1px solid #d1d5db', borderRadius: 12, padding: 16, background: '#fff' }}>
            <div style={{ fontSize: 12, color: '#64748b' }}>Compte cible</div>
            <div style={{ fontWeight: 700, fontSize: 20 }}>{user.email}</div>
            <div style={{ marginTop: 8, color: '#334155' }}>Pseudo: {user.username || '-'}</div>
            <div style={{ color: '#334155' }}>Discord: {user.discordUsername || '-'}</div>
            <div style={{ color: '#334155' }}>Code postal: {user.postalCode || '-'}</div>
          </section>

          <section style={{ border: '1px solid #d1d5db', borderRadius: 12, padding: 16, background: '#fff' }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Etat du compte</div>
            <div>Cree le: {formatDate(user.createdAt)}</div>
            <div>Derniere connexion: {formatDate(user.lastSignInAt)}</div>
            <div>Email confirme: {formatDate(user.emailConfirmedAt)}</div>
          </section>

          <section style={{ border: '1px solid #d1d5db', borderRadius: 12, padding: 16, background: '#fff' }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Identites liees</div>
            {user.identities.length === 0 ? (
              <div style={{ color: '#64748b' }}>Aucune identite trouvee.</div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {user.identities.map((identity) => (
                  <div key={identity.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }}>
                    <div style={{ fontWeight: 700 }}>{identity.provider || 'provider inconnu'}</div>
                    <div style={{ fontSize: 13, color: '#475569' }}>{identity.email || '-'}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
