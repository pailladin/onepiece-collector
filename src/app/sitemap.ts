import type { MetadataRoute } from 'next'
import { supabaseServiceServer } from '@/lib/server/supabaseServer'
import { getSiteUrl } from '@/lib/site'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl()

  const { data: setsData } = await supabaseServiceServer
    .from('sets')
    .select('code')
    .order('code', { ascending: true })

  const setEntries = (((setsData as Array<{ code: string | null }> | null) || []) as Array<{
    code: string | null
  }>)
    .map((row) => String(row.code || '').trim().toUpperCase())
    .filter(Boolean)
    .map((code) => ({
      url: `${siteUrl}/catalogue/${code}`,
      changeFrequency: 'weekly' as const,
      priority: 0.8
    }))

  return [
    {
      url: siteUrl,
      changeFrequency: 'weekly',
      priority: 1
    },
    {
      url: `${siteUrl}/catalogue`,
      changeFrequency: 'daily',
      priority: 0.9
    },
    ...setEntries
  ]
}

