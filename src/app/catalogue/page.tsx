import { supabaseServiceServer } from '@/lib/server/supabaseServer'
import CatalogueSetsBrowser, {
  type CatalogueSetRow
} from '@/components/CatalogueSetsBrowser'

export const dynamic = 'force-dynamic'

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

      {!error && sets.length > 0 && <CatalogueSetsBrowser sets={sets as CatalogueSetRow[]} />}
    </div>
  )
}
