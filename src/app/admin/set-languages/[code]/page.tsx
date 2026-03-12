'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/lib/auth'
import { isAdminEmail, parseAdminEmails } from '@/lib/admin'
import { SET_LANGUAGE_CODES, getCollectionLanguageShortLabel } from '@/lib/collections/languages'

export default function AdminSetLanguagesPage() {
  const { user, loading: authLoading } = useAuth()
  const params = useParams<{ code: string }>()
  const code = String(params?.code || '').toUpperCase()
  const adminEmails = parseAdminEmails(process.env.NEXT_PUBLIC_ADMIN_EMAILS)
  const canAccessAdmin = isAdminEmail(user?.email, adminEmails)
  const [loading, setLoading] = useState(true)
  const [setName, setSetName] = useState('')
  const [selectedLanguages, setSelectedLanguages] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const getAuthHeader = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    const accessToken = data.session?.access_token
    return accessToken
      ? ({ Authorization: `Bearer ${accessToken}` } as Record<string, string>)
      : ({} as Record<string, string>)
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    setMessage(null)
    const authHeaders = await getAuthHeader()
    const res = await fetch(`/api/admin/set-languages/${code}`, { headers: authHeaders })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setMessage(data?.error || 'Erreur chargement langues set')
      setLoading(false)
      return
    }

    const languages: string[] = Array.isArray(data?.set?.availableLanguages)
      ? data.set.availableLanguages
      : []
    setSetName(String(data?.set?.name || ''))
    setSelectedLanguages(
      Object.fromEntries(SET_LANGUAGE_CODES.map((language) => [language, languages.includes(language)]))
    )
    setLoading(false)
  }, [code, getAuthHeader])

  useEffect(() => {
    if (!canAccessAdmin) {
      setLoading(false)
      return
    }
    if (!code) return
    loadData()
  }, [canAccessAdmin, code, loadData])

  const saveLanguages = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const authHeaders = await getAuthHeader()
      const availableLanguages = SET_LANGUAGE_CODES.filter((language) => selectedLanguages[language])
      const res = await fetch(`/api/admin/set-languages/${code}`, {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ availableLanguages })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage(data?.error || 'Erreur sauvegarde')
        return
      }
      setMessage('Langues du set enregistrees')
    } finally {
      setSaving(false)
    }
  }

  if (authLoading || loading) return <div style={{ padding: 40 }}>Chargement...</div>
  if (!canAccessAdmin) return <div style={{ padding: 40 }}>Acces refuse.</div>

  return (
    <div style={{ padding: 40 }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/admin">Retour admin</Link>
      </div>
      <h1 style={{ marginBottom: 8 }}>Langues du set</h1>
      <div style={{ marginBottom: 16 }}>
        <strong>{code}</strong>
        {setName ? ` - ${setName}` : ''}
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        {SET_LANGUAGE_CODES.map((language) => (
          <label
            key={language}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 10px',
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              background: '#fff'
            }}
          >
            <input
              type="checkbox"
              checked={Boolean(selectedLanguages[language])}
              onChange={(e) =>
                setSelectedLanguages((prev) => ({ ...prev, [language]: e.target.checked }))
              }
            />
            <span>{getCollectionLanguageShortLabel(language)}</span>
          </label>
        ))}
      </div>

      <button
        onClick={saveLanguages}
        disabled={saving}
        style={{
          background: '#1d4ed8',
          color: '#fff',
          border: 'none',
          padding: '8px 12px',
          borderRadius: 6
        }}
      >
        {saving ? 'Enregistrement...' : 'Enregistrer'}
      </button>

      {message && <div style={{ marginTop: 12 }}>{message}</div>}
    </div>
  )
}
