import type { MetadataRoute } from 'next'
import { getSiteUrl } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl()

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Let crawlers read the noindex metadata on account and private pages.
        disallow: ['/api/']
      }
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl
  }
}

