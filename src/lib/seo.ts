import type { Metadata } from 'next'
import { getSiteUrl } from '@/lib/site'

export const SITE_NAME = 'One Piece Collector'
export const SITE_DESCRIPTION = 'Explore les cartes One Piece TCG, suis ta collection par extension et prépare tes échanges avec tes amis sur One Piece Collector.'

export function publicPageMetadata(title: string, description: string, path: string): Metadata {
  const url = `${getSiteUrl()}${path}`
  const images = [{ url: '/opengraph-image', width: 1200, height: 630, alt: SITE_NAME }]
  return {
    title, description,
    alternates: { canonical: url },
    openGraph: { type: 'website', locale: 'fr_FR', siteName: SITE_NAME, title, description, url, images },
    twitter: { card: 'summary_large_image', title, description, images: ['/opengraph-image'] }
  }
}

export function breadcrumbData(items: Array<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem', position: index + 1, name: item.name, item: `${getSiteUrl()}${item.path}`
    }))
  }
}
