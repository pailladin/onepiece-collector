'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import {
  getLinkedProviders,
  getProviderLabel,
  linkOAuthProvider,
  updatePassword
} from '@/lib/authClient'
import { getAuthErrorMessage } from '@/lib/authMessages'

export function AccountPageClient() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [message, setMessage] = useState(() => {
    if (typeof window === 'undefined') return ''
    const searchParams = new URLSearchParams(window.location.search)
    return searchParams.get('linked') === 'google' ? 'Compte Google lie avec succes.' : ''
  })
  const [loading, setLoading] = useState(false)
  const [loadingProviders, setLoadingProviders] = useState(false)
  const [linkedProviders, setLinkedProviders] = useState<Set<'google' | 'discord'>>(new Set())
  const [nextPassword, setNextPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const canUpdatePassword =
    nextPassword.length >= 6 && confirmPassword.length >= 6 && nextPassword === confirmPassword
  const googleLinked = linkedProviders.has('google')

  useEffect(() => {
    if (!user) return

    const loadLinkedProviders = async () => {
      setLoadingProviders(true)
      const { providers } = await getLinkedProviders()
      setLinkedProviders(providers)
      setLoadingProviders(false)
    }

    void loadLinkedProviders()
  }, [user])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const searchParams = new URLSearchParams(window.location.search)
    if (searchParams.get('linked') === 'google') {
      router.replace('/account')
    }
  }, [router])

  const handleLinkGoogle = async () => {
    if (!user || loading) return
    setLoading(true)
    setMessage('')

    const { error } = await linkOAuthProvider(
      'google',
      `${window.location.origin}/auth?oauth=google-link`
    )

    if (error) {
      setMessage(getAuthErrorMessage(error.message))
      setLoading(false)
    }
  }

  const handleUpdatePassword = async () => {
    if (!canUpdatePassword || loading) return
    setLoading(true)
    setMessage('')

    const { error } = await updatePassword(nextPassword)

    if (error) {
      setMessage(getAuthErrorMessage(error.message))
      setLoading(false)
      return
    }

    setNextPassword('')
    setConfirmPassword('')
    setMessage('Mot de passe mis a jour avec succes.')
    setLoading(false)
  }

  if (authLoading) {
    return <div style={{ padding: 40 }}>Chargement...</div>
  }

  if (!user) {
    return (
      <div style={{ padding: 40 }}>
        Connecte-toi pour gerer ton compte. <Link href="/auth">Aller a la connexion</Link>
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: 'calc(100dvh - 70px)',
        background:
          'radial-gradient(circle at 12% 8%, #ffeedd 0%, #e0f2fe 45%, #eef2ff 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24
      }}
    >
      <div
        style={{
          width: 'min(560px, 100%)',
          background: '#fff',
          border: '1px solid #dbeafe',
          borderRadius: 14,
          boxShadow: '0 24px 40px -32px #0f172a',
          padding: 24,
          display: 'grid',
          gap: 16
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 28, color: '#0f172a', textAlign: 'center' }}>
            Mon compte
          </h1>
          <p style={{ marginTop: 8, color: '#475569', fontSize: 14, textAlign: 'center' }}>
            Gere tes moyens de connexion en separant clairement connexion, mot de passe et
            comptes externes lies.
          </p>
        </div>

        <section
          style={{
            display: 'grid',
            gap: 10,
            padding: 14,
            borderRadius: 12,
            border: '1px solid #dbeafe',
            background: '#f8fbff'
          }}
        >
          <div style={{ fontSize: 12, color: '#64748b' }}>Email du compte</div>
          <div style={{ fontWeight: 700, color: '#0f172a' }}>{user.email || ''}</div>
        </section>

        <section
          style={{
            display: 'grid',
            gap: 10,
            padding: 14,
            borderRadius: 12,
            border: '1px solid #e2e8f0',
            background: '#fff'
          }}
        >
          <div style={{ fontWeight: 700, color: '#0f172a' }}>Connexions externes</div>
          <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.4 }}>
            Si tu as deja un compte One Piece Collector, lie Google ici plutot que de cliquer
            directement sur &quot;Continuer avec Google&quot; depuis la page de connexion.
          </div>
          <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.4 }}>
            Important: le compte Google doit idealement utiliser la meme adresse email que ce
            compte ({user.email || 'email inconnu'}), sinon la liaison peut etre refusee par
            Supabase.
          </div>
          <div style={{ fontSize: 13, color: '#334155' }}>
            Google:{' '}
            <strong>{loadingProviders ? 'verification...' : googleLinked ? 'lie' : 'non lie'}</strong>
          </div>
          <button
            onClick={handleLinkGoogle}
            disabled={loading || loadingProviders || googleLinked}
            style={{
              justifySelf: 'start',
              background: googleLinked ? '#e2e8f0' : '#ffffff',
              color: googleLinked ? '#475569' : '#0f172a',
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              padding: '10px 14px',
              cursor: loading || loadingProviders || googleLinked ? 'not-allowed' : 'pointer',
              opacity: loading || loadingProviders || googleLinked ? 0.7 : 1
            }}
          >
            {googleLinked ? `${getProviderLabel('google')} deja lie` : `Lier ${getProviderLabel('google')}`}
          </button>
        </section>

        <section
          style={{
            display: 'grid',
            gap: 10,
            padding: 14,
            borderRadius: 12,
            border: '1px solid #e2e8f0',
            background: '#fff'
          }}
        >
          <div style={{ fontWeight: 700, color: '#0f172a' }}>Changer le mot de passe</div>
          <input
            type="password"
            placeholder="Nouveau mot de passe"
            value={nextPassword}
            onChange={(e) => setNextPassword(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
          <input
            type="password"
            placeholder="Confirmer le mot de passe"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
          <button
            onClick={handleUpdatePassword}
            disabled={!canUpdatePassword || loading}
            style={{
              justifySelf: 'start',
              background: '#0f766e',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '10px 14px',
              cursor: !canUpdatePassword || loading ? 'not-allowed' : 'pointer',
              opacity: !canUpdatePassword || loading ? 0.6 : 1
            }}
          >
            {loading ? 'Mise a jour...' : 'Mettre a jour'}
          </button>
        </section>

        <div style={{ textAlign: 'center', fontSize: 14, color: '#334155', minHeight: 20 }}>
          {message}
        </div>
      </div>
    </div>
  )
}
