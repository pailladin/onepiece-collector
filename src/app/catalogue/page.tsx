import { supabaseServiceServer } from '@/lib/server/supabaseServer'
import CatalogueSetsBrowser, {
  type CatalogueSetRow
} from '@/components/CatalogueSetsBrowser'
import { publicPageMetadata, breadcrumbData } from '@/lib/seo'
import { JsonLd } from '@/components/JsonLd'
import Link from 'next/link'

export const revalidate = 60

export const metadata = publicPageMetadata('Catalogue des cartes et extensions One Piece TCG',
  'Parcours les extensions One Piece Card Game : boosters OP, Extra Boosters EB et Starter Decks ST. Explore les cartes, leurs raretés et variantes.', '/catalogue')

async function fetchSets() {
  const { data, error } = await supabaseServiceServer
    .from('sets')
    .select('id, code, name')
    .order('code', { ascending: true })

  if (error) {
    throw new Error('Impossible de charger le catalogue : ' + error.message)
  }

  const sets = ((data as CatalogueSetRow[] | null) || [])
    .filter((set) => typeof set?.code === 'string' && set.code.trim().length > 0)
    .map((set) => ({
      ...set,
      code: set.code!.replace(/-/g, '').trim().toUpperCase()
    }))

  return sets
}

export default async function CataloguePage() {
  const sets = await fetchSets()

  return (
    <div
      style={{
        padding: '14px 8px 20px',
        background:
          'radial-gradient(circle at 10% 20%, #f0f9ff 0%, #eef2ff 35%, #fff7ed 100%)',
        minHeight: '100vh'
      }}
    >
      <JsonLd data={breadcrumbData([{ name: 'Accueil', path: '/' }, { name: 'Catalogue One Piece TCG', path: '/catalogue' }])} />
      <nav aria-label="Fil d’Ariane"><Link href="/">Accueil</Link> / <span aria-current="page">Catalogue</span></nav>
      <h1 style={{ color: '#0f172a', fontSize: 30 }}>Catalogue des cartes One Piece TCG</h1>
      <Link href="/collection/scan" style={{ display: 'inline-block', padding: '10px 16px', borderRadius: 12, background: '#1d4ed8', color: '#fff', textDecoration: 'none', fontWeight: 700 }}>Scanner une carte</Link>
      <p style={{ color: '#475569', lineHeight: 1.6 }}>Retrouve les extensions One Piece Card Game : boosters OP, Extra Boosters EB et Starter Decks ST. Ouvre un set pour explorer ses cartes et leurs variantes, ou recherche une carte dans le catalogue.</p>
      {sets.length === 0 && (
        <div style={{ color: '#475569', marginBottom: 24 }}>
          Aucune extension disponible pour le moment.
        </div>
      )}

      {sets.length > 0 && <CatalogueSetsBrowser sets={sets} />}
    </div>
  )
}
