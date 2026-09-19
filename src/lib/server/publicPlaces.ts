import { supabaseServiceServer } from '@/lib/server/supabaseServer'
import { normalizePlaceActivities, type PlaceRow } from '@/lib/places'

export type PublicPlaceRow = Pick<PlaceRow, 'id' | 'slug' | 'name' | 'description' | 'image_url' | 'city' | 'postal_code' | 'department_code' | 'country' | 'discord_url' | 'website_url' | 'google_maps_url' | 'activities'>

export async function getPublicPlaces(query = '', activity = 'all') {
  const rows: PublicPlaceRow[] = []
  for (let from = 0; ; from += 1000) {
    let builder = supabaseServiceServer.from('places')
      .select('id, slug, name, description, image_url, city, postal_code, department_code, country, discord_url, website_url, google_maps_url, activities')
      .eq('is_active', true).order('city').order('name').order('id')
    if (query.trim()) {
      const safe = query.trim().replace(/[,%_]/g, (match) => `\\${match}`)
      builder = builder.or(`name.ilike.%${safe}%,city.ilike.%${safe}%,postal_code.ilike.%${safe}%,department_code.ilike.%${safe}%,search_text.ilike.%${safe}%`)
    }
    if (activity && activity !== 'all') builder = builder.contains('activities', [activity])
    const { data, error } = await builder.range(from, from + 999)
    if (error) throw new Error(`Impossible de charger les lieux : ${error.message}`)
    rows.push(...(data || []).map((row) => ({ ...row, activities: normalizePlaceActivities(row.activities) })))
    if ((data || []).length < 1000) return rows
  }
}
