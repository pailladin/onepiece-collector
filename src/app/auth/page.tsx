'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function AuthPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  const handleSignUp = async () => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth`,
      },
    })

    if (error) {
      setMessage(error.message)
    } else {
      setMessage('Compte créé. Vérifie ton email.')
    }
  }

  const handleSignIn = async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setMessage(error.message)
    } else {
      setMessage('Connexion réussie.')
    }
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>Connexion / Inscription</h1>

      <div style={{ marginTop: 20 }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ display: 'block', marginBottom: 10 }}
        />

        <input
          type="password"
          placeholder="Mot de passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ display: 'block', marginBottom: 10 }}
        />

        <button onClick={handleSignUp} style={{ marginRight: 10 }}>
          Créer un compte
        </button>

        <button onClick={handleSignIn}>
          Se connecter
        </button>

        <p style={{ marginTop: 20 }}>{message}</p>
      </div>
    </div>
  )
}
