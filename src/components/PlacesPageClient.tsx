'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  getPlaceActivityLabel,
  PLACE_ACTIVITY_OPTIONS,
  type PlaceRow
} from '@/lib/places'

type PublicPlaceRow = Pick<
  PlaceRow,
  | 'id'
  | 'slug'
  | 'name'
  | 'description'
  | 'image_url'
  | 'city'
  | 'postal_code'
  | 'department_code'
  | 'country'
  | 'discord_url'
  | 'website_url'
  | 'google_maps_url'
  | 'activities'
>

export function PlacesPageClient() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [rows, setRows] = useState<PublicPlaceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [activity, setActivity] = useState(searchParams.get('activity') || 'all')

  useEffect(() => {
    setQuery(searchParams.get('q') || '')
    setActivity(searchParams.get('activity') || 'all')
  }, [searchParams])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams()
      if (query.trim()) params.set('q', query.trim())
      if (activity !== 'all') params.set('activity', activity)

      const res = await fetch(`/api/places?${params.toString()}`)
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setRows([])
        setError(data?.error || 'Erreur chargement lieux')
        setLoading(false)
        return
      }

      setRows(Array.isArray(data?.rows) ? (data.rows as PublicPlaceRow[]) : [])
      setLoading(false)
    }

    void load()
  }, [activity, query])

  const syncUrl = (nextQuery: string, nextActivity: string) => {
    const params = new URLSearchParams()
    if (nextQuery.trim()) params.set('q', nextQuery.trim())
    if (nextActivity !== 'all') params.set('activity', nextActivity)
    router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ''}`)
  }

  const subtitle = useMemo(() => {
    if (loading) return 'Recherche en cours...'
    return `${rows.length} lieu(x) trouve(s)`
  }, [loading, rows.length])

  return (
    <div
      style={{
        padding: '20px 12px 28px',
        minHeight: '100vh',
        background:
          'radial-gradient(circle at 15% 10%, #fff7ed 0%, #fffbeb 28%, #eff6ff 100%)'
      }}
    >
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ margin: 0, fontSize: 34, color: '#0f172a' }}>Lieux One Piece TCG</h1>
          <p style={{ margin: '8px 0 0', color: '#475569', maxWidth: 800 }}>
            Trouve des boutiques, lieux de jeu et points de rencontre pour acheter des
            boosters, des singles ou participer a des tournois.
          </p>
          <div
            style={{
              marginTop: 14,
              display: 'flex',
              gap: 10,
              flexWrap: 'wrap',
              alignItems: 'center'
            }}
          >
            <Link
              href="/community"
              style={{
                textDecoration: 'none',
                background: '#ea580c',
                color: '#fff',
                padding: '10px 14px',
                borderRadius: 999,
                fontWeight: 700
              }}
            >
              Proposer un lieu
            </Link>
            <span style={{ color: '#64748b' }}>
              Tu connais une boutique ou un lieu de jeu manquant ? Propose-le a la communaute.
            </span>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.4fr) minmax(220px, 0.7fr)',
            gap: 12,
            marginBottom: 12
          }}
        >
          <input
            value={query}
            onChange={(event) => {
              const next = event.target.value
              setQuery(next)
              syncUrl(next, activity)
            }}
            placeholder="Rechercher par nom, ville, code postal, departement..."
            style={{
              padding: '12px 14px',
              borderRadius: 12,
              border: '1px solid #cbd5e1',
              fontSize: 15
            }}
          />
          <select
            value={activity}
            onChange={(event) => {
              const next = event.target.value
              setActivity(next)
              syncUrl(query, next)
            }}
            style={{
              padding: '12px 14px',
              borderRadius: 12,
              border: '1px solid #cbd5e1',
              fontSize: 15
            }}
          >
            <option value="all">Toutes les activites</option>
            {PLACE_ACTIVITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 18, color: '#64748b', fontWeight: 600 }}>{subtitle}</div>

        {error && <div style={{ color: '#b91c1c', marginBottom: 16 }}>{error}</div>}

        {loading ? (
          <div style={{ color: '#475569' }}>Chargement...</div>
        ) : rows.length === 0 ? (
          <div
            style={{
              background: '#fff',
              borderRadius: 16,
              border: '1px solid #e2e8f0',
              padding: 20,
              color: '#475569'
            }}
          >
            Aucun lieu ne correspond a la recherche.
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 16
            }}
          >
            {rows.map((row) => (
              <Link
                key={row.id}
                href={`/lieux/${row.slug}`}
                style={{
                  textDecoration: 'none',
                  color: 'inherit',
                  background: '#fff',
                  borderRadius: 18,
                  overflow: 'hidden',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 16px 40px -30px rgba(15, 23, 42, 0.35)'
                }}
              >
                <div
                  style={{
                    height: 180,
                    background: row.image_url
                      ? `center / cover no-repeat url(${row.image_url})`
                      : 'linear-gradient(135deg, #dbeafe, #fef3c7)',
                    position: 'relative'
                  }}
                />
                <div style={{ padding: 16 }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>
                    {row.name}
                  </div>
                  <div style={{ marginTop: 6, color: '#475569' }}>
                    {[row.city, row.postal_code, row.department_code ? `Dep. ${row.department_code}` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                  {row.description && (
                    <div style={{ marginTop: 10, color: '#334155', lineHeight: 1.5 }}>
                      {row.description.length > 140
                        ? `${row.description.slice(0, 140)}...`
                        : row.description}
                    </div>
                  )}
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      flexWrap: 'wrap',
                      marginTop: 12
                    }}
                  >
                    {(row.activities || []).map((activityItem) => (
                      <span
                        key={activityItem}
                        style={{
                          borderRadius: 999,
                          background: '#eff6ff',
                          color: '#1d4ed8',
                          padding: '5px 9px',
                          fontSize: 12,
                          fontWeight: 700
                        }}
                      >
                        {getPlaceActivityLabel(activityItem)}
                      </span>
                    ))}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
