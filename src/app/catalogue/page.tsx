import Link from 'next/link'
import { supabaseServiceServer } from '@/lib/server/supabaseServer'

const STORAGE_BASE_URL =
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/cards-images`

type CatalogueSetRow = {
  id: string | null
  code: string | null
  name?: string | null
}

async function fetchSets() {
  const { data, error } = await supabaseServiceServer
    .from('sets')
    .select('id, code, name')
    .order('code', { ascending: true })

  if (error) {
    return { sets: [] as CatalogueSetRow[], error: error.message }
  }

  const sets = ((data as CatalogueSetRow[] | null) || [])
    .filter((set) => typeof set?.code === 'string' && set.code.trim().length > 0)
    .map((set) => ({
      ...set,
      code: set.code!.trim()
    }))

  return { sets, error: null as string | null }
}

export default async function CataloguePage() {
  const { sets, error } = await fetchSets()

  return (
    <div style={{ padding: 40 }}>
      <h1 style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 30 }}>
        Catalogue des Sets
      </h1>

      {error && <div style={{ color: '#b91c1c', marginBottom: 24 }}>Erreur de chargement: {error}</div>}

      {!error && sets.length === 0 && (
        <div style={{ color: '#475569', marginBottom: 24 }}>
          Aucun set valide trouve dans la table `sets`.
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          columnGap: 32,
          rowGap: 48
        }}
      >
        {sets.map((set) => {
          const setCode = set.code as string
          const imageUrl = `${STORAGE_BASE_URL}/sets/${setCode}.png`

          return (
            <Link
              key={set.id || setCode}
              href={`/catalogue/${setCode}`}
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
                    alt={setCode}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '100%',
                      objectFit: 'contain'
                    }}
                  />
                </div>

                <div
                  style={{
                    fontWeight: 'bold',
                    fontSize: 18,
                    textAlign: 'center'
                  }}
                >
                  {set.name || setCode}
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
