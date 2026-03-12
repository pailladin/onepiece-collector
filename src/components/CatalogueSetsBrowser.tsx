'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'

const STORAGE_BASE_URL =
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/cards-images`

export type CatalogueSetRow = {
  id: string | null
  code: string
  name?: string | null
}

type CatalogueType = 'all' | 'booster' | 'extra_booster' | 'start_deck'

function getCatalogueTypes(code: string): Array<Exclude<CatalogueType, 'all'>> {
  const normalized = (code || '').trim().toUpperCase()
  const types: Array<Exclude<CatalogueType, 'all'>> = []

  if (normalized.includes('ST')) types.push('start_deck')
  if (normalized.includes('EB')) types.push('extra_booster')
  if (normalized.includes('OP')) types.push('booster')

  return types.length > 0 ? types : ['booster']
}

function getCatalogueLabel(type: Exclude<CatalogueType, 'all'>) {
  if (type === 'start_deck') return 'Start Deck'
  if (type === 'extra_booster') return 'Extra Booster'
  return 'Booster'
}

export default function CatalogueSetsBrowser({ sets }: { sets: CatalogueSetRow[] }) {
  const [typeFilter, setTypeFilter] = useState<CatalogueType>('all')
  const [query, setQuery] = useState('')

  const filteredSets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return sets.filter((set) => {
      const types = getCatalogueTypes(set.code)
      if (typeFilter !== 'all' && !types.includes(typeFilter)) return false

      if (!normalizedQuery) return true

      const haystack = `${set.code} ${set.name || ''}`.toLowerCase()
      return haystack.includes(normalizedQuery)
    })
  }, [query, sets, typeFilter])

  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(220px, 260px) minmax(260px, 1fr)',
          gap: 12,
          marginBottom: 24
        }}
      >
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as CatalogueType)}
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid #cbd5e1',
            background: '#fff'
          }}
        >
          <option value="all">Tous les types</option>
          <option value="booster">Booster</option>
          <option value="extra_booster">Extra Booster</option>
          <option value="start_deck">Start Deck</option>
        </select>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filtrer par nom ou code"
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid #cbd5e1',
            background: '#fff'
          }}
        />
      </div>

      <div style={{ color: '#475569', marginBottom: 20 }}>
        {filteredSets.length} resultat(s)
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          columnGap: 32,
          rowGap: 48
        }}
      >
        {filteredSets.map((set) => {
          const imageUrl = `${STORAGE_BASE_URL}/sets/${set.code}.png`
          const types = getCatalogueTypes(set.code)
          const showCodeAndName = types.includes('booster') || types.includes('extra_booster')

          return (
            <Link
              key={set.id || set.code}
              href={`/catalogue/${set.code}`}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div
                style={{
                  border: '1px solid #ddd',
                  borderRadius: 10,
                  padding: 15,
                  background: '#fff',
                  transition: 'transform 0.2s',
                  cursor: 'pointer',
                  height: '100%'
                }}
              >
                <div
                  style={{
                    height: 300,
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 15,
                    overflow: 'hidden'
                  }}
                >
                  <img
                    src={imageUrl}
                    alt={set.code}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '100%',
                      objectFit: 'contain'
                    }}
                  />
                </div>

                <div
                  style={{
                    marginBottom: 10,
                    display: 'flex',
                    gap: 6,
                    justifyContent: 'center',
                    flexWrap: 'wrap'
                  }}
                >
                  {types.map((type) => (
                    <span
                      key={type}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '4px 8px',
                        borderRadius: 999,
                        background: '#eff6ff',
                        color: '#1d4ed8',
                        fontSize: 12,
                        fontWeight: 700
                      }}
                    >
                      {getCatalogueLabel(type)}
                    </span>
                  ))}
                </div>

                <div style={{ textAlign: 'center' }}>
                  {showCodeAndName ? (
                    <>
                      <div style={{ fontWeight: 'bold', fontSize: 18 }}>{set.code}</div>
                      <div style={{ marginTop: 4, color: '#334155' }}>{set.name || set.code}</div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontWeight: 'bold', fontSize: 18 }}>{set.name || set.code}</div>
                      <div style={{ marginTop: 4, color: '#64748b' }}>{set.code}</div>
                    </>
                  )}
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </>
  )
}
