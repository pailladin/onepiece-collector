import type { MetadataRoute } from 'next'
import { getSiteUrl } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl()

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/catalogue', '/catalogue/'],
        disallow: [
          '/admin',
          '/auth',
          '/collection',
          '/community',
          '/friends',
          '/share',
          '/api'
        ]
      }
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl
  }
}

