import { HomePageClient } from '@/components/HomePageClient'
import { JsonLd } from '@/components/JsonLd'
import { publicPageMetadata, SITE_DESCRIPTION, SITE_NAME } from '@/lib/seo'
import { getSiteUrl } from '@/lib/site'

export const metadata = publicPageMetadata('Catalogue et collection de cartes One Piece TCG', SITE_DESCRIPTION, '/')

export default function Home() {
  return <>
    <JsonLd data={{ '@context': 'https://schema.org', '@type': 'WebSite', name: SITE_NAME, url: getSiteUrl(), description: SITE_DESCRIPTION, inLanguage: 'fr' }} />
    <HomePageClient />
  </>
}
