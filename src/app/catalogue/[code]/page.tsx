import { cache, Suspense } from 'react'
import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { CatalogueSetPageClient } from '@/components/CatalogueSetPageClient'
import { JsonLd } from '@/components/JsonLd'
import { getSetCatalogue } from '@/lib/server/setCatalogue'
import { breadcrumbData, publicPageMetadata } from '@/lib/seo'

export const revalidate = 60
type Props = { params: Promise<{ code: string }> }

const fetchCatalogue = cache(async (rawCode: string) => {
  const code = rawCode.replace(/-/g, '').trim().toUpperCase()
  const catalogue = await getSetCatalogue(code)
  if (!catalogue) notFound()
  if (rawCode !== code) permanentRedirect('/catalogue/' + encodeURIComponent(code))
  return catalogue
})

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { set } = await fetchCatalogue((await params).code)
  const name = [set.code, set.name].filter(Boolean).join(' - ')
  return publicPageMetadata('Cartes ' + name + ' | One Piece TCG',
    'Explore les cartes du set ' + name + ' de One Piece Card Game : raretés, illustrations et variantes. Retrouve les cartes qui manquent à ta collection.',
    '/catalogue/' + encodeURIComponent(set.code))
}

export default async function CatalogueSetPage({ params }: Props) {
  const catalogue = await fetchCatalogue((await params).code)
  const initialCatalogue = {
    set: catalogue.set,
    items: catalogue.items.map((item) => ({ ...item, card: Array.isArray(item.card) ? item.card[0] ?? null : item.card }))
  }
  return <>
    <JsonLd data={breadcrumbData([
      { name: 'Accueil', path: '/' },
      { name: 'Catalogue One Piece TCG', path: '/catalogue' },
      { name: [catalogue.set.code, catalogue.set.name].filter(Boolean).join(' - '), path: '/catalogue/' + encodeURIComponent(catalogue.set.code) }
    ])} />
    <Suspense fallback={<div style={{ padding: 40 }}>Chargement du catalogue...</div>}>
      <CatalogueSetPageClient key={catalogue.set.code} initialCatalogue={initialCatalogue} />
    </Suspense>
  </>
}
