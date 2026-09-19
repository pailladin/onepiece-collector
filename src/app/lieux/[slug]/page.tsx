import { cache } from 'react'
import { JsonLd } from '@/components/JsonLd'
import { publicPageMetadata, breadcrumbData } from '@/lib/seo'
import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { supabaseServiceServer } from '@/lib/server/supabaseServer'
import { getPlaceActivityLabel, normalizePlaceActivities, type PlaceRow } from '@/lib/places'

type Props = {
  params: Promise<{ slug: string }>
}

const fetchPlace = cache(async (slug: string) => {
  const { data, error } = await supabaseServiceServer
    .from('places')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()

  if (error) throw new Error('Impossible de charger ce lieu : ' + error.message)
  if (!data) return null

  const row = data as PlaceRow
  return {
    ...row,
    activities: normalizePlaceActivities(row.activities)
  }
})

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const place = await fetchPlace(slug)
  if (!place) notFound()
  return publicPageMetadata(
    place.name + (place.city ? ' à ' + place.city : '') + ' - One Piece TCG',
    place.description?.slice(0, 160) || 'Découvre ' + place.name + (place.city ? ' à ' + place.city : '') + ' : activités One Piece TCG, adresse et liens pratiques.',
    '/lieux/' + encodeURIComponent(place.slug)
  )
}

export default async function PlaceDetailPage({ params }: Props) {
  const { slug } = await params
  const place = await fetchPlace(slug)
  if (!place) notFound()

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #fff7ed 0%, #eff6ff 100%)',
        padding: '20px 12px 32px'
      }}
    >
      <JsonLd data={breadcrumbData([{ name: 'Accueil', path: '/' }, { name: 'Lieux One Piece TCG', path: '/lieux' }, { name: place.name, path: '/lieux/' + encodeURIComponent(place.slug) }])} />
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <Link href="/lieux" style={{ color: '#1d4ed8', textDecoration: 'none' }}>
          Retour aux lieux
        </Link>

        <div
          style={{
            marginTop: 14,
            background: '#fff',
            borderRadius: 24,
            overflow: 'hidden',
            border: '1px solid #e2e8f0',
            boxShadow: '0 20px 50px -36px rgba(15, 23, 42, 0.45)'
          }}
        >
          <div
            style={{
              height: 320,
              background: place.image_url
                ? `center / cover no-repeat url(${place.image_url})`
                : 'linear-gradient(135deg, #bfdbfe, #fde68a)'
            }}
          />

          <div style={{ padding: 22 }}>
            <h1 style={{ margin: 0, fontSize: 36, color: '#0f172a' }}>{place.name}</h1>
            <div style={{ marginTop: 8, color: '#475569', fontSize: 16 }}>
              {[place.address_line, place.postal_code, place.city, place.country]
                .filter(Boolean)
                .join(', ')}
            </div>

            {place.description && (
              <p style={{ marginTop: 16, color: '#334155', lineHeight: 1.7 }}>
                {place.description}
              </p>
            )}

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
              {(place.activities || []).map((activity) => (
                <span
                  key={activity}
                  style={{
                    borderRadius: 999,
                    background: '#ecfeff',
                    color: '#0f766e',
                    padding: '7px 11px',
                    fontSize: 13,
                    fontWeight: 700
                  }}
                >
                  {getPlaceActivityLabel(activity)}
                </span>
              ))}
            </div>

            <div
              style={{
                display: 'flex',
                gap: 12,
                flexWrap: 'wrap',
                marginTop: 22
              }}
            >
              {place.discord_url && (
                <a href={place.discord_url} target="_blank" rel="noreferrer" style={{ color: '#1d4ed8' }}>
                  Discord du lieu
                </a>
              )}
              {place.website_url && (
                <a href={place.website_url} target="_blank" rel="noreferrer" style={{ color: '#1d4ed8' }}>
                  Site web
                </a>
              )}
              {place.google_maps_url && (
                <a href={place.google_maps_url} target="_blank" rel="noreferrer" style={{ color: '#1d4ed8' }}>
                  Ouvrir dans Maps
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
