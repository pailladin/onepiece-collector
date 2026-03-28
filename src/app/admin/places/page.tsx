'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/lib/auth'
import { isAdminEmail, parseAdminEmails } from '@/lib/admin'
import {
  PLACE_ACTIVITY_OPTIONS,
  getPlaceActivityLabel,
  type PlaceActivity,
  type PlaceRow
} from '@/lib/places'

type FormState = {
  id: string | null
  slug: string
  name: string
  description: string
  imageUrl: string
  addressLine: string
  city: string
  postalCode: string
  country: string
  discordUrl: string
  websiteUrl: string
  googleMapsUrl: string
  activities: PlaceActivity[]
  isActive: boolean
}

const EMPTY_FORM: FormState = {
  id: null,
  slug: '',
  name: '',
  description: '',
  imageUrl: '',
  addressLine: '',
  city: '',
  postalCode: '',
  country: 'France',
  discordUrl: '',
  websiteUrl: '',
  googleMapsUrl: '',
  activities: [],
  isActive: true
}

function toFormState(row: PlaceRow): FormState {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description || '',
    imageUrl: row.image_url || '',
    addressLine: row.address_line || '',
    city: row.city || '',
    postalCode: row.postal_code || '',
    country: row.country || 'France',
    discordUrl: row.discord_url || '',
    websiteUrl: row.website_url || '',
    googleMapsUrl: row.google_maps_url || '',
    activities: (row.activities || []) as PlaceActivity[],
    isActive: Boolean(row.is_active)
  }
}

export default function AdminPlacesPage() {
  const { user, loading: authLoading } = useAuth()
  const adminEmails = parseAdminEmails(process.env.NEXT_PUBLIC_ADMIN_EMAILS)
  const canAccessAdmin = isAdminEmail(user?.email, adminEmails)
  const [rows, setRows] = useState<PlaceRow[]>([])
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const getAuthHeader = async () => {
    const { data } = await supabase.auth.getSession()
    const accessToken = data.session?.access_token
    return accessToken
      ? ({ Authorization: `Bearer ${accessToken}` } as Record<string, string>)
      : ({} as Record<string, string>)
  }

  const loadData = async () => {
    setLoading(true)
    setError(null)
    const authHeaders = await getAuthHeader()
    const res = await fetch('/api/admin/places', { headers: authHeaders })
    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      setRows([])
      setError(data?.error || 'Erreur chargement lieux')
      setLoading(false)
      return
    }

    setRows(Array.isArray(data?.rows) ? (data.rows as PlaceRow[]) : [])
    setLoading(false)
  }

  useEffect(() => {
    if (!canAccessAdmin) {
      setLoading(false)
      return
    }
    void loadData()
  }, [canAccessAdmin])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) =>
      [row.name, row.city, row.postal_code, row.slug]
        .map((value) => String(value || '').toLowerCase())
        .some((value) => value.includes(q))
    )
  }, [rows, search])

  const toggleActivity = (value: PlaceActivity) => {
    setForm((prev) => ({
      ...prev,
      activities: prev.activities.includes(value)
        ? prev.activities.filter((entry) => entry !== value)
        : [...prev.activities, value]
    }))
  }

  const savePlace = async () => {
    setSaving(true)
    setError(null)
    setMessage(null)

    try {
      const authHeaders = await getAuthHeader()
      const payload = {
        slug: form.slug,
        name: form.name,
        description: form.description,
        imageUrl: form.imageUrl,
        addressLine: form.addressLine,
        city: form.city,
        postalCode: form.postalCode,
        country: form.country,
        discordUrl: form.discordUrl,
        websiteUrl: form.websiteUrl,
        googleMapsUrl: form.googleMapsUrl,
        activities: form.activities,
        isActive: form.isActive
      }

      const res = await fetch(form.id ? `/api/admin/places/${form.id}` : '/api/admin/places', {
        method: form.id ? 'PATCH' : 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || 'Erreur sauvegarde')
        return
      }

      setMessage(form.id ? 'Lieu mis a jour.' : 'Lieu cree.')
      setForm(EMPTY_FORM)
      await loadData()
    } finally {
      setSaving(false)
    }
  }

  const deletePlace = async (row: PlaceRow) => {
    const confirmed = window.confirm(`Supprimer ${row.name} ?`)
    if (!confirmed) return

    const authHeaders = await getAuthHeader()
    const res = await fetch(`/api/admin/places/${row.id}`, {
      method: 'DELETE',
      headers: authHeaders
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data?.error || 'Erreur suppression')
      return
    }

    if (form.id === row.id) {
      setForm(EMPTY_FORM)
    }
    setMessage('Lieu supprime.')
    await loadData()
  }

  if (authLoading || loading) return <div style={{ padding: 40 }}>Chargement...</div>
  if (!canAccessAdmin) return <div style={{ padding: 40 }}>Acces refuse.</div>

  return (
    <div style={{ padding: 28, background: '#f8fafc', minHeight: '100vh' }}>
      <h1 style={{ marginTop: 0 }}>Admin - Lieux</h1>

      <div style={{ marginBottom: 18, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Link href="/admin" style={{ color: '#1d4ed8', textDecoration: 'none' }}>
          Retour admin
        </Link>
        <Link href="/lieux" style={{ color: '#1d4ed8', textDecoration: 'none' }}>
          Voir l annuaire public
        </Link>
      </div>

      {error && <div style={{ color: '#b91c1c', marginBottom: 12 }}>{error}</div>}
      {message && <div style={{ color: '#0f766e', marginBottom: 12 }}>{message}</div>}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(320px, 430px) minmax(0, 1fr)',
          gap: 18,
          alignItems: 'start'
        }}
      >
        <div style={{ background: '#fff', borderRadius: 16, padding: 18, border: '1px solid #e2e8f0' }}>
          <h2 style={{ marginTop: 0 }}>{form.id ? 'Modifier un lieu' : 'Ajouter un lieu'}</h2>

          <div style={{ display: 'grid', gap: 10 }}>
            <input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Nom du lieu" style={{ padding: 10, borderRadius: 10, border: '1px solid #cbd5e1' }} />
            <input value={form.slug} onChange={(e) => setForm((prev) => ({ ...prev, slug: e.target.value }))} placeholder="Slug (optionnel)" style={{ padding: 10, borderRadius: 10, border: '1px solid #cbd5e1' }} />
            <input value={form.imageUrl} onChange={(e) => setForm((prev) => ({ ...prev, imageUrl: e.target.value }))} placeholder="URL image" style={{ padding: 10, borderRadius: 10, border: '1px solid #cbd5e1' }} />
            <textarea value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="Description" rows={4} style={{ padding: 10, borderRadius: 10, border: '1px solid #cbd5e1', resize: 'vertical' }} />
            <input value={form.addressLine} onChange={(e) => setForm((prev) => ({ ...prev, addressLine: e.target.value }))} placeholder="Adresse" style={{ padding: 10, borderRadius: 10, border: '1px solid #cbd5e1' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 10 }}>
              <input value={form.city} onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))} placeholder="Ville" style={{ padding: 10, borderRadius: 10, border: '1px solid #cbd5e1' }} />
              <input value={form.postalCode} onChange={(e) => setForm((prev) => ({ ...prev, postalCode: e.target.value }))} placeholder="Code postal" style={{ padding: 10, borderRadius: 10, border: '1px solid #cbd5e1' }} />
            </div>
            <input value={form.country} onChange={(e) => setForm((prev) => ({ ...prev, country: e.target.value }))} placeholder="Pays" style={{ padding: 10, borderRadius: 10, border: '1px solid #cbd5e1' }} />
            <input value={form.discordUrl} onChange={(e) => setForm((prev) => ({ ...prev, discordUrl: e.target.value }))} placeholder="Lien Discord" style={{ padding: 10, borderRadius: 10, border: '1px solid #cbd5e1' }} />
            <input value={form.websiteUrl} onChange={(e) => setForm((prev) => ({ ...prev, websiteUrl: e.target.value }))} placeholder="Site web" style={{ padding: 10, borderRadius: 10, border: '1px solid #cbd5e1' }} />
            <input value={form.googleMapsUrl} onChange={(e) => setForm((prev) => ({ ...prev, googleMapsUrl: e.target.value }))} placeholder="Lien Google Maps" style={{ padding: 10, borderRadius: 10, border: '1px solid #cbd5e1' }} />

            <div>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Activites</div>
              <div style={{ display: 'grid', gap: 6 }}>
                {PLACE_ACTIVITY_OPTIONS.map((option) => (
                  <label key={option.value} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={form.activities.includes(option.value)}
                      onChange={() => toggleActivity(option.value)}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </div>

            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
              />
              Lieu actif dans l annuaire
            </label>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => void savePlace()}
                disabled={saving}
                style={{
                  border: 'none',
                  background: '#0f766e',
                  color: '#fff',
                  borderRadius: 10,
                  padding: '10px 14px',
                  cursor: 'pointer'
                }}
              >
                {saving ? 'Sauvegarde...' : form.id ? 'Mettre a jour' : 'Creer'}
              </button>
              <button
                onClick={() => setForm(EMPTY_FORM)}
                style={{
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  color: '#0f172a',
                  borderRadius: 10,
                  padding: '10px 14px',
                  cursor: 'pointer'
                }}
              >
                Reinitialiser
              </button>
            </div>
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: 16, padding: 18, border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>Lieux existants</h2>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrer par nom, ville, code postal..."
              style={{ minWidth: 280, padding: 10, borderRadius: 10, border: '1px solid #cbd5e1' }}
            />
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            {filteredRows.map((row) => (
              <div key={row.id} style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 800, color: '#0f172a' }}>{row.name}</div>
                    <div style={{ color: '#64748b', marginTop: 4 }}>
                      {[row.city, row.postal_code, row.slug].filter(Boolean).join(' · ')}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                      {(row.activities || []).map((activity) => (
                        <span key={activity} style={{ fontSize: 12, background: '#eff6ff', color: '#1d4ed8', padding: '4px 8px', borderRadius: 999 }}>
                          {getPlaceActivityLabel(activity)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => setForm(toFormState(row))}
                      style={{ border: '1px solid #cbd5e1', background: '#fff', borderRadius: 10, padding: '8px 10px', cursor: 'pointer' }}
                    >
                      Modifier
                    </button>
                    <button
                      onClick={() => void deletePlace(row)}
                      style={{ border: 'none', background: '#b91c1c', color: '#fff', borderRadius: 10, padding: '8px 10px', cursor: 'pointer' }}
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {filteredRows.length === 0 && (
              <div style={{ color: '#64748b' }}>Aucun lieu enregistre.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
