import type { MetadataRoute } from 'next'
import { supabaseServiceServer } from '@/lib/server/supabaseServer'
import { getSiteUrl } from '@/lib/site'

export const revalidate = 3600

async function getSetCodes() {
  const codes = new Set<string>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseServiceServer.from('sets')
      .select('code').order('code').order('id').range(from, from + 999)
    if (error) throw new Error('Impossible de générer le sitemap des extensions : ' + error.message)
    for (const row of data || []) {
      const code = String(row.code || '').replace(/-/g, '').trim().toUpperCase()
      if (code) codes.add(code)
    }
    if ((data || []).length < 1000) return [...codes]
  }
}

async function getPlaceSlugs() {
  const slugs = new Set<string>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseServiceServer.from('places')
      .select('slug').eq('is_active', true).order('slug').order('id').range(from, from + 999)
    if (error) throw new Error('Impossible de générer le sitemap des lieux : ' + error.message)
    for (const row of data || []) {
      const slug = String(row.slug || '').trim()
      if (slug) slugs.add(slug)
    }
    if ((data || []).length < 1000) return [...slugs]
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl()
  const [codes, slugs] = await Promise.all([getSetCodes(), getPlaceSlugs()])
  return [
    { url: siteUrl, changeFrequency: 'weekly', priority: 1 },
    { url: siteUrl + '/catalogue', changeFrequency: 'daily', priority: 0.9 },
    { url: siteUrl + '/lieux', changeFrequency: 'weekly', priority: 0.8 },
    ...codes.map((code) => ({ url: siteUrl + '/catalogue/' + encodeURIComponent(code), changeFrequency: 'weekly' as const, priority: 0.8 })),
    ...slugs.map((slug) => ({ url: siteUrl + '/lieux/' + encodeURIComponent(slug), changeFrequency: 'weekly' as const, priority: 0.7 }))
  ]
}
