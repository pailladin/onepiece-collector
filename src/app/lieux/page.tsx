import { Suspense } from 'react'
import { PlacesPageClient } from '@/components/PlacesPageClient'
import { getPublicPlaces } from '@/lib/server/publicPlaces'
import { publicPageMetadata, breadcrumbData } from '@/lib/seo'
import { JsonLd } from '@/components/JsonLd'

export const metadata = publicPageMetadata('Boutiques et lieux de jeu One Piece TCG',
  'Trouve une boutique ou un lieu de jeu One Piece TCG près de chez toi : achat de cartes, échanges et tournois. Recherche par ville ou activité.', '/lieux')

type Props = { searchParams: Promise<{ q?: string | string[]; activity?: string | string[] }> }
export default async function PlacesPage({ searchParams }: Props) {
  const filters = await searchParams
  const query = typeof filters.q === 'string' ? filters.q : ''
  const activity = typeof filters.activity === 'string' ? filters.activity : 'all'
  const rows = await getPublicPlaces(query, activity)
  return <>
    <JsonLd data={breadcrumbData([{ name: 'Accueil', path: '/' }, { name: 'Lieux One Piece TCG', path: '/lieux' }])} />
    <Suspense fallback={<div style={{ padding: 40 }}>Chargement...</div>}>
      <PlacesPageClient initialRows={rows} initialQuery={query} initialActivity={activity} />
    </Suspense>
  </>
}
