'use client'

import Link from 'next/link'
import type { SetRow, SetStats } from '@/lib/collections/fetchUserSetStats'

const STORAGE_BASE_URL =
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/cards-images`

type Props = {
  title: string
  sets: SetRow[]
  stats: Record<string, SetStats>
  getSetHref: (setCode: string) => string
}

export function CollectionSetsGrid({ title, sets, stats, getSetHref }: Props) {
  return (
    <div style={{ padding: 40 }}>
      <h1 style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 30 }}>
        {title}
      </h1>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 25,
        }}
      >
        {sets.map((set) => {
          const stat = stats[set.code]
          const imageUrl =
            `${STORAGE_BASE_URL}/sets/${set.code}.png`

          return (
            <Link
              key={set.id}
              href={getSetHref(set.code)}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div
                style={{
                  border: '1px solid #ddd',
                  borderRadius: 10,
                  padding: 15,
                  background: '#fff',
                  cursor: 'pointer',
                }}
              >
                <img
                  src={imageUrl}
                  alt={set.code}
                  style={{
                    width: '100%',
                    height: 'auto',
                    marginBottom: 12,
                  }}
                />

                <div style={{ fontWeight: 'bold', fontSize: 18 }}>
                  {set.code}
                </div>

                <div style={{ marginTop: 10 }}>
                  Total: {stat?.owned} / {stat?.total}
                </div>

                <div
                  style={{
                    marginTop: 8,
                    height: 8,
                    background: '#eee',
                    borderRadius: 4,
                  }}
                >
                  <div
                    style={{
                      width: `${stat?.percent || 0}%`,
                      height: '100%',
                      background: '#0070f3',
                      borderRadius: 4,
                    }}
                  />
                </div>

                <div style={{ marginTop: 5, fontSize: 12 }}>
                  {stat?.percent}% complete
                </div>

                <div style={{ marginTop: 10, fontSize: 12, color: '#334155' }}>
                  Normales: {stat?.ownedNormal || 0} / {stat?.totalNormal || 0}
                </div>
                <div
                  style={{
                    marginTop: 6,
                    height: 6,
                    background: '#e2e8f0',
                    borderRadius: 4,
                  }}
                >
                  <div
                    style={{
                      width: `${stat?.percentNormal || 0}%`,
                      height: '100%',
                      background: '#16a34a',
                      borderRadius: 4,
                    }}
                  />
                </div>

                <div style={{ marginTop: 8, fontSize: 12, color: '#334155' }}>
                  Alternatives: {stat?.ownedAlt || 0} / {stat?.totalAlt || 0}
                </div>
                <div
                  style={{
                    marginTop: 6,
                    height: 6,
                    background: '#e2e8f0',
                    borderRadius: 4,
                  }}
                >
                  <div
                    style={{
                      width: `${stat?.percentAlt || 0}%`,
                      height: '100%',
                      background: '#7c3aed',
                      borderRadius: 4,
                    }}
                  />
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
