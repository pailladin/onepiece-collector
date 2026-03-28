import { NextRequest, NextResponse } from 'next/server'
import { supabaseServiceServer } from '@/lib/server/supabaseServer'
import { normalizePlaceActivities, type PlaceRow } from '@/lib/places'

export const runtime = 'nodejs'

function escapeLike(value: string) {
  return value.replace(/[,%_]/g, (match) => `\\${match}`)
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim() || ''
  const activity = request.nextUrl.searchParams.get('activity')?.trim() || 'all'

  let builder = supabaseServiceServer
    .from('places')
    .select(
      'id, slug, name, description, image_url, city, postal_code, department_code, country, discord_url, website_url, google_maps_url, activities, is_active'
    )
    .eq('is_active', true)
    .order('city', { ascending: true })
    .order('name', { ascending: true })

  if (query) {
    const safe = escapeLike(query)
    builder = builder.or(
      `name.ilike.%${safe}%,city.ilike.%${safe}%,postal_code.ilike.%${safe}%,department_code.ilike.%${safe}%,search_text.ilike.%${safe}%`
    )
  }

  if (activity && activity !== 'all') {
    builder = builder.contains('activities', [activity])
  }

  const { data, error } = await builder

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (((data as PlaceRow[] | null) || []) as PlaceRow[]).map((row) => ({
    ...row,
    activities: normalizePlaceActivities(row.activities)
  }))

  return NextResponse.json({ rows })
}
