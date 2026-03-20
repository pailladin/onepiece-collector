'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
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
  const [discordRiskAccepted, setDiscordRiskAccepted] = useState(false)

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

    if (oauthState === 'discord-signin' && user) {
      router.replace('/collection')
      return
    }

    if (oauthState === 'google-link' && user) {
      router.replace('/account?linked=google')
      return
    }

    if (oauthState === 'discord-link' && user) {
      router.replace('/account?linked=discord')
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

  const handleDiscordSignIn = async () => {
    if (loading) return
    setLoading(true)
    setMessage('')

    const { error } = await signInWithOAuthProvider(
      'discord',
      `${window.location.origin}/auth?oauth=discord-signin`
    )

    if (error) {
      setMessage(getAuthErrorMessage(error.message))
      setLoading(false)
    }
  }

  const isAccountView = Boolean(user) && authMode !== 'reset'
  const authTitle =
    authMode === 'forgot'
      ? 'Mot de passe oublie'
      : authMode === 'reset'
        ? 'Nouveau mot de passe'
        : 'Connexion'
  const authSubtitle =
    authMode === 'forgot'
      ? 'Entre ton email pour recevoir un lien de reinitialisation.'
      : authMode === 'reset'
        ? 'Definis un nouveau mot de passe pour retrouver ton compte.'
        : 'Connecte-toi pour gerer ta collection, partager des sets et suivre ta progression.'
  const inputStyle = {
    width: '100%',
    boxSizing: 'border-box' as const,
    marginBottom: 12,
    padding: '12px 14px',
    borderRadius: 12,
    border: '1px solid #cbd5e1',
    outline: 'none',
    background: '#fff'
  }

  return (
    <div
      style={{
        minHeight: 'calc(100dvh - 70px)',
        background:
          'radial-gradient(circle at 12% 8%, #fff0df 0%, #e0f2fe 42%, #eef2ff 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24
      }}
    >
      <div
        style={{
          width: 'min(520px, 100%)',
          background: 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)',
          border: '1px solid rgba(191, 219, 254, 0.9)',
          borderRadius: 24,
          boxShadow: '0 32px 70px -42px rgba(15, 23, 42, 0.48)',
          padding: 28
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div
            style={{
              display: 'inline-flex',
              padding: '6px 10px',
              borderRadius: 999,
              background: '#dbeafe',
              color: '#1d4ed8',
              fontSize: 12,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: 0.4
            }}
          >
            One Piece Collector
          </div>
          <h1
            style={{
              margin: '16px 0 0',
              fontSize: 32,
              color: '#0f172a',
              textAlign: 'center',
              lineHeight: 1.05
            }}
          >
            {authTitle}
          </h1>
          <p style={{ marginTop: 10, color: '#475569', fontSize: 14, textAlign: 'center', lineHeight: 1.6 }}>
            {authSubtitle}
          </p>
        </div>

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
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textDecoration: 'none',
                    background: '#0f172a',
                    color: '#fff',
                    borderRadius: 10,
                    minHeight: 42,
                    padding: '0 16px',
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
              ...inputStyle
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
                  ...inputStyle
                }}
              />
              )}

              {!isAccountView && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 4 }}>
                <button
                  onClick={handleSignIn}
                  disabled={!canSubmit || loading}
                  style={{
                    minHeight: 46,
                    background: '#0f172a',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 12,
                    padding: '0 14px',
                    fontWeight: 700,
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
                    minHeight: 46,
                    background: '#0f766e',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 12,
                    padding: '0 14px',
                    fontWeight: 700,
                    cursor: !canSubmit || loading ? 'not-allowed' : 'pointer',
                    opacity: !canSubmit || loading ? 0.6 : 1
                  }}
                >
                  Creer un compte
                </button>
              </div>
              )}

              {!isAccountView && (
                <div style={{ position: 'relative', margin: '20px 0 14px' }}>
                  <div style={{ borderTop: '1px solid #e2e8f0' }} />
                  <div
                    style={{
                      position: 'absolute',
                      left: '50%',
                      top: '50%',
                      transform: 'translate(-50%, -50%)',
                      background: '#f8fbff',
                      padding: '0 12px',
                      fontSize: 12,
                      fontWeight: 800,
                      letterSpacing: 0.4,
                      color: '#64748b',
                      textTransform: 'uppercase'
                    }}
                  >
                    Connexion externe
                  </div>
                </div>
              )}

              {!isAccountView && (
                <div
                  style={{
                    marginBottom: 10,
                    padding: 14,
                    borderRadius: 14,
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
                <OAuthActionButton
                  onClick={handleGoogleSignIn}
                  disabled={loading || !googleRiskAccepted}
                  tone="light"
                  icon={<GoogleLogo />}
                >
                  Continuer avec Google
                </OAuthActionButton>
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

              {!isAccountView && (
                <div
                  style={{
                    marginBottom: 10,
                    padding: 14,
                    borderRadius: 14,
                    border: '1px solid #c7d2fe',
                    background: '#eef2ff',
                    color: '#3730a3',
                    fontSize: 13,
                    lineHeight: 1.4
                  }}
                >
                  Discord peut aussi servir de connexion rapide.
                  Si tu as deja un compte One Piece Collector, connecte-toi d abord puis lie
                  Discord depuis la page compte pour eviter de creer un second profil.
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
                    checked={discordRiskAccepted}
                    onChange={(e) => setDiscordRiskAccepted(e.target.checked)}
                    style={{ marginTop: 2 }}
                  />
                  <span>
                    Je confirme que je n ai pas deja un compte a recuperer avant d utiliser Discord.
                  </span>
                </label>
              )}

              {!isAccountView && (
                <OAuthActionButton
                  onClick={handleDiscordSignIn}
                  disabled={loading || !discordRiskAccepted}
                  tone="discord"
                  icon={<DiscordLogo />}
                >
                  Continuer avec Discord
                </OAuthActionButton>
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
                  lie Discord depuis la page compte.
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
                  minHeight: 46,
                  background: '#d97706',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 12,
                  padding: '0 18px',
                  fontWeight: 700,
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
                  ...inputStyle
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
                  ...inputStyle
                }}
              />

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  onClick={handleUpdatePassword}
                  disabled={!canUpdatePassword || loading}
                  style={{
                    minHeight: 46,
                    background: '#0f766e',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 12,
                    padding: '0 18px',
                    fontWeight: 700,
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

          <p
            style={{
              marginTop: 16,
              minHeight: 20,
              color: '#334155',
              fontSize: 14,
              textAlign: 'center',
              lineHeight: 1.5
            }}
          >
            {message}
          </p>
        </div>
      </div>
    </div>
  )
}

function OAuthActionButton({
  children,
  icon,
  tone,
  disabled,
  onClick
}: {
  children: ReactNode
  icon: ReactNode
  tone: 'light' | 'discord'
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        minHeight: 48,
        marginTop: 10,
        borderRadius: 12,
        border: tone === 'discord' ? '1px solid #5865f2' : '1px solid #cbd5e1',
        background: tone === 'discord' ? '#5865f2' : '#ffffff',
        color: tone === 'discord' ? '#ffffff' : '#0f172a',
        fontWeight: 700,
        fontSize: 15,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        boxShadow: tone === 'discord' ? '0 14px 28px -22px rgba(88, 101, 242, 0.95)' : 'none'
      }}
    >
      {icon}
      {children}
    </button>
  )
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.9-5.5 3.9-3.3 0-6-2.8-6-6.2s2.7-6.2 6-6.2c1.9 0 3.1.8 3.8 1.4l2.6-2.5C16.8 3 14.6 2 12 2 6.9 2 2.8 6.4 2.8 11.8S6.9 21.5 12 21.5c6.1 0 9.1-4.4 9.1-8.8 0-.6-.1-1-.2-1.5z"
      />
      <path fill="#34A853" d="M2.8 11.8c0 1.7.6 3.3 1.7 4.6l3-2.3c-.3-.7-.5-1.5-.5-2.3s.2-1.6.5-2.3l-3-2.3c-1.1 1.3-1.7 2.9-1.7 4.6z" />
      <path fill="#4285F4" d="M12 21.5c2.5 0 4.7-.8 6.3-2.3l-3.1-2.4c-.8.6-1.8 1-3.2 1-2.5 0-4.7-1.7-5.4-4.1l-3.1 2.4c1.7 3.2 4.9 5.4 8.5 5.4z" />
      <path fill="#FBBC05" d="M6.6 13.7c-.2-.6-.4-1.2-.4-1.9s.1-1.3.4-1.9l-3.1-2.4C2.8 8.8 2.4 10.3 2.4 11.8s.4 3 1.1 4.3z" />
    </svg>
  )
}

function DiscordLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M20.3 4.4A16.7 16.7 0 0 0 16.1 3l-.2.5a11.4 11.4 0 0 1 3.3 1.6 11.8 11.8 0 0 0-3.5-1.7 15.5 15.5 0 0 0-7.4 0A11.8 11.8 0 0 0 4.8 5a11.4 11.4 0 0 1 3.3-1.6L7.9 3a16.7 16.7 0 0 0-4.2 1.4C1 8.4.4 12.2.7 16c1.8 1.3 3.6 2.1 5.4 2.6l1.2-2c-.7-.2-1.4-.5-2-.9l.5-.4c3.9 1.8 8.1 1.8 12 0l.5.4c-.6.4-1.3.7-2 .9l1.2 2c1.8-.5 3.6-1.3 5.4-2.6.4-4.3-.7-8.1-3-11.6ZM9.6 13.8c-1.1 0-1.9-1-1.9-2.2s.9-2.2 1.9-2.2 1.9 1 1.9 2.2-.8 2.2-1.9 2.2Zm4.8 0c-1.1 0-1.9-1-1.9-2.2s.8-2.2 1.9-2.2 1.9 1 1.9 2.2-.8 2.2-1.9 2.2Z" />
    </svg>
  )
}
