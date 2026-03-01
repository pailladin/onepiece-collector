'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function AuthPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const canSubmit = email.trim().length > 3 && password.length >= 6

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
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username
        },
        emailRedirectTo: `${window.location.origin}/auth`
      }
    })

    if (error) {
      setMessage(error.message)
    } else {
      setMessage('Compte cree. Verifie ton email.')
    }
    setLoading(false)
  }

  const handleSignIn = async () => {
    if (!canSubmit || loading) return
    setLoading(true)
    setMessage('')

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      setMessage(error.message)
    } else {
      setMessage('Connexion reussie.')
      router.push('/collection')
    }
    setLoading(false)
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
          Connexion
        </h1>
        <p style={{ marginTop: 8, color: '#475569', fontSize: 14, textAlign: 'center' }}>
          Connecte-toi pour gerer ta collection, partager des sets et suivre ta
          progression.
        </p>

        <div style={{ marginTop: 18, maxWidth: 380, marginInline: 'auto' }}>
          <label style={{ display: 'block', marginBottom: 6, color: '#334155' }}>
            Email
          </label>
          <input
            type="email"
            placeholder="ton@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSignIn()
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
            Mot de passe
          </label>
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

          <p style={{ marginTop: 14, minHeight: 20, color: '#334155', fontSize: 14 }}>
            {message}
          </p>
        </div>
      </div>
    </div>
  )
}
