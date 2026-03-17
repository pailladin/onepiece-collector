'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/lib/auth'
import {
  sendPasswordResetEmail,
  signInWithOAuthProvider,
  signInWithPassword,
  signUpWithPassword,
  updatePassword
} from '@/lib/authClient'
import { getAuthErrorMessage } from '@/lib/authMessages'

export function AuthPageClient() {
  const router = useRouter()
  const { user } = useAuth()
  const getInitialSearchParams = () =>
    typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search)
  const [authMode, setAuthMode] = useState<'signin' | 'forgot' | 'reset'>(() => {
    if (typeof window === 'undefined') return 'signin'
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const searchParams = getInitialSearchParams()
    return hashParams.get('type') === 'recovery' || searchParams.get('type') === 'recovery'
      ? 'reset'
      : 'signin'
  })
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nextPassword, setNextPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState(() => {
    return ''
  })
  const [loading, setLoading] = useState(false)
  const [googleRiskAccepted, setGoogleRiskAccepted] = useState(false)

  const canSubmit = email.trim().length > 3 && password.length >= 6
  const canSendReset = email.trim().length > 3
  const canUpdatePassword =
    nextPassword.length >= 6 && confirmPassword.length >= 6 && nextPassword === confirmPassword

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setAuthMode('reset')
        setMessage('Choisis maintenant un nouveau mot de passe.')
        return
      }

      if (event === 'SIGNED_IN' && authMode !== 'reset') {
        router.push('/collection')
      }
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [authMode, router])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const searchParams = new URLSearchParams(window.location.search)
    const oauthState = searchParams.get('oauth')

    if (oauthState === 'google-signin' && user) {
      router.replace('/collection')
      return
    }

    if (oauthState === 'google-link' && user) {
      router.replace('/account?linked=google')
    }
  }, [router, user])

  const buildUsernameFromEmail = (value: string) => {
    const localPart = (value.split('@')[0] || 'user').toLowerCase()
    const base = localPart.replace(/[^a-z0-9_]/g, '').slice(0, 16)
    const safeBase = base.length >= 3 ? base : 'user'
    const suffix = Math.random().toString(36).slice(2, 8)
    return `${safeBase}_${suffix}`
  }

  const handleSignUp = async () => {
    if (!canSubmit || loading) return
    setLoading(true)
    setMessage('')

    const username = buildUsernameFromEmail(email.trim())
    const { error } = await signUpWithPassword({
      email,
      password,
      username,
      emailRedirectTo: `${window.location.origin}/auth`
    })

    if (error) {
      setMessage(getAuthErrorMessage(error.message))
    } else {
      setMessage('Compte cree. Verifie ton email.')
    }
    setLoading(false)
  }

  const handleSignIn = async () => {
    if (!canSubmit || loading) return
    setLoading(true)
    setMessage('')

    const { error } = await signInWithPassword(email, password)

    if (error) {
      setMessage(getAuthErrorMessage(error.message))
    } else {
      setMessage('Connexion reussie.')
      router.push('/collection')
    }
    setLoading(false)
  }

  const handleForgotPassword = async () => {
    if (!canSendReset || loading) return
    setLoading(true)
    setMessage('')

    const { error } = await sendPasswordResetEmail(
      email.trim(),
      `${window.location.origin}/auth?type=recovery`
    )

    if (error) {
      setMessage(getAuthErrorMessage(error.message))
    } else {
      setMessage('Email envoye. Verifie ta boite mail pour reinitialiser ton mot de passe.')
    }
    setLoading(false)
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

    setMessage('Mot de passe mis a jour. Tu peux maintenant te connecter.')
    setNextPassword('')
    setConfirmPassword('')
    setPassword('')
    setAuthMode('signin')
    setLoading(false)
  }

  const handleGoogleSignIn = async () => {
    if (loading) return
    setLoading(true)
    setMessage('')

    const { error } = await signInWithOAuthProvider(
      'google',
      `${window.location.origin}/auth?oauth=google-signin`
    )

    if (error) {
      setMessage(getAuthErrorMessage(error.message))
      setLoading(false)
    }
  }

  const isAccountView = Boolean(user) && authMode !== 'reset'

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
          width: 'min(460px, 100%)',
          background: '#fff',
          border: '1px solid #dbeafe',
          borderRadius: 14,
          boxShadow: '0 24px 40px -32px #0f172a',
          padding: 24
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 28,
            color: '#0f172a',
            textAlign: 'center'
          }}
        >
          {authMode === 'forgot'
              ? 'Mot de passe oublie'
            : authMode === 'reset'
              ? 'Nouveau mot de passe'
              : 'Connexion'}
        </h1>
        <p style={{ marginTop: 8, color: '#475569', fontSize: 14, textAlign: 'center' }}>
          {authMode === 'forgot'
            ? 'Entre ton email pour recevoir un lien de reinitialisation.'
            : authMode === 'reset'
              ? 'Definis un nouveau mot de passe pour retrouver ton compte.'
              : 'Connecte-toi pour gerer ta collection, partager des sets et suivre ta progression.'}
        </p>

        <div style={{ marginTop: 18, maxWidth: 380, marginInline: 'auto' }}>
          {isAccountView && (
            <div
              style={{
                display: 'grid',
                gap: 12,
                marginBottom: 16,
                padding: 14,
                borderRadius: 12,
                border: '1px solid #dbeafe',
                background: '#f8fbff'
              }}
            >
              <div style={{ display: 'grid', gap: 8, justifyItems: 'center', textAlign: 'center' }}>
                <div style={{ fontWeight: 700, color: '#0f172a' }}>
                  Tu es deja connecte.
                </div>
                <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.4 }}>
                  La gestion des moyens de connexion se fait maintenant depuis la page compte.
                </div>
                <Link
                  href="/account"
                  style={{
                    display: 'inline-block',
                    textDecoration: 'none',
                    background: '#0ea5e9',
                    color: '#fff',
                    borderRadius: 8,
                    padding: '10px 14px',
                    fontWeight: 700
                  }}
                >
                  Aller a mon compte
                </Link>
              </div>
            </div>
          )}

          {!isAccountView && (
          <label style={{ display: 'block', marginBottom: 6, color: '#334155' }}>
            Email
          </label>
          )}
          {!isAccountView && (
          <input
            type="email"
            placeholder="ton@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              if (authMode === 'forgot') handleForgotPassword()
              if (authMode === 'signin') handleSignIn()
            }}
            style={{
              width: '100%',
              marginBottom: 12,
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              outline: 'none'
            }}
          />
          )}

          {authMode === 'signin' && (
            <>
              {!isAccountView && (
              <label style={{ display: 'block', marginBottom: 6, color: '#334155' }}>
                Mot de passe
              </label>
              )}
              {!isAccountView && (
              <input
                type="password"
                placeholder="Minimum 6 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSignIn()
                }}
                style={{
                  width: '100%',
                  marginBottom: 14,
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  outline: 'none'
                }}
              />
              )}

              {!isAccountView && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  onClick={handleSignIn}
                  disabled={!canSubmit || loading}
                  style={{
                    background: '#0ea5e9',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '10px 14px',
                    cursor: !canSubmit || loading ? 'not-allowed' : 'pointer',
                    opacity: !canSubmit || loading ? 0.6 : 1
                  }}
                >
                  {loading ? 'Connexion...' : 'Se connecter'}
                </button>

                <button
                  onClick={handleSignUp}
                  disabled={!canSubmit || loading}
                  style={{
                    background: '#0f766e',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '10px 14px',
                    cursor: !canSubmit || loading ? 'not-allowed' : 'pointer',
                    opacity: !canSubmit || loading ? 0.6 : 1
                  }}
                >
                  Creer un compte
                </button>
              </div>
              )}

              {!isAccountView && (
                <div
                  style={{
                    marginTop: 14,
                    marginBottom: 10,
                    padding: 12,
                    borderRadius: 10,
                    border: '1px solid #fde68a',
                    background: '#fffbeb',
                    color: '#92400e',
                    fontSize: 13,
                    lineHeight: 1.4
                  }}
                >
                  Utilise Google surtout pour un nouveau compte.
                  Si tu as deja un compte One Piece Collector avec un autre email ou un mot de
                  passe, connecte-toi d&apos;abord puis lie Google depuis ton compte pour eviter de
                  creer un second profil.
                </div>
              )}

              {!isAccountView && (
                <label
                  style={{
                    marginTop: 2,
                    marginBottom: 10,
                    display: 'flex',
                    gap: 8,
                    alignItems: 'flex-start',
                    fontSize: 13,
                    color: '#334155',
                    cursor: 'pointer'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={googleRiskAccepted}
                    onChange={(e) => setGoogleRiskAccepted(e.target.checked)}
                    style={{ marginTop: 2 }}
                  />
                  <span>
                    Je confirme que je n&apos;ai pas deja un compte a recuperer avec un autre email.
                  </span>
                </label>
              )}

              {!isAccountView && (
                <div style={{ marginTop: 10, display: 'flex', justifyContent: 'center' }}>
                  <button
                    onClick={handleGoogleSignIn}
                    disabled={loading || !googleRiskAccepted}
                    style={{
                      background: '#ffffff',
                      color: '#0f172a',
                      border: '1px solid #cbd5e1',
                      borderRadius: 8,
                      padding: '10px 14px',
                      cursor: loading || !googleRiskAccepted ? 'not-allowed' : 'pointer',
                      opacity: loading || !googleRiskAccepted ? 0.6 : 1
                    }}
                  >
                    Continuer avec Google
                  </button>
                </div>
              )}

              {!isAccountView && (
                <div
                  style={{
                    marginTop: 8,
                    textAlign: 'center',
                    fontSize: 12,
                    color: '#64748b'
                  }}
                >
                  Si tu as deja un compte, passe plutot par la connexion classique puis
                  <br />
                  lie Google depuis la page compte.
                </div>
              )}
            </>
          )}

          {authMode === 'forgot' && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
              <button
                onClick={handleForgotPassword}
                disabled={!canSendReset || loading}
                style={{
                  background: '#d97706',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '10px 14px',
                  cursor: !canSendReset || loading ? 'not-allowed' : 'pointer',
                  opacity: !canSendReset || loading ? 0.6 : 1
                }}
              >
                {loading ? 'Envoi...' : 'Envoyer le lien'}
              </button>
            </div>
          )}

          {authMode === 'reset' && (
            <>
              <label style={{ display: 'block', marginBottom: 6, color: '#334155' }}>
                Nouveau mot de passe
              </label>
              <input
                type="password"
                placeholder="Minimum 6 caracteres"
                value={nextPassword}
                onChange={(e) => setNextPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleUpdatePassword()
                }}
                style={{
                  width: '100%',
                  marginBottom: 12,
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  outline: 'none'
                }}
              />

              <label style={{ display: 'block', marginBottom: 6, color: '#334155' }}>
                Confirmer le mot de passe
              </label>
              <input
                type="password"
                placeholder="Retape le mot de passe"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleUpdatePassword()
                }}
                style={{
                  width: '100%',
                  marginBottom: 14,
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  outline: 'none'
                }}
              />

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  onClick={handleUpdatePassword}
                  disabled={!canUpdatePassword || loading}
                  style={{
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
              </div>
            </>
          )}

          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
            {authMode === 'signin' && !isAccountView && (
              <button
                onClick={() => {
                  setMessage('')
                  setAuthMode('forgot')
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#1d4ed8',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: 0
                }}
              >
                Mot de passe oublie ?
              </button>
            )}

            {authMode !== 'signin' && !isAccountView && (
              <button
                onClick={() => {
                  setMessage('')
                  setAuthMode('signin')
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#1d4ed8',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: 0
                }}
              >
                Retour a la connexion
              </button>
            )}
          </div>

          <p style={{ marginTop: 14, minHeight: 20, color: '#334155', fontSize: 14 }}>
            {message}
          </p>
        </div>
      </div>
    </div>
  )
}
