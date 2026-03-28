import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getRequestUser } from '@/lib/server/authUser'
import { isAdminEmail, parseAdminEmails } from '@/lib/admin'
import {
  buildPlaceSearchText,
  deriveDepartmentCode,
  normalizePlaceActivities,
  normalizePlaceSlug,
  type PlaceRow
} from '@/lib/places'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function requireAdmin(request: Request) {
  const userResult = await getRequestUser(request)
  if (!userResult.user) {
    return NextResponse.json(
      { error: userResult.error || 'Unauthorized' },
      { status: 401 }
    )
  }

  const adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS)
  if (!isAdminEmail(userResult.user.email, adminEmails)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return null
}

function normalizePayload(body: any) {
  const name = String(body?.name || '').trim()
  const city = String(body?.city || '').trim()
  const postalCode = String(body?.postalCode || '').trim()
  const departmentCode = deriveDepartmentCode(postalCode) || String(body?.departmentCode || '').trim() || null
  const slugBase = String(body?.slug || '').trim() || name
  const slug = normalizePlaceSlug(slugBase)

  return {
    slug,
    name,
    description: String(body?.description || '').trim() || null,
    image_url: String(body?.imageUrl || '').trim() || null,
    address_line: String(body?.addressLine || '').trim() || null,
    city: city || null,
    postal_code: postalCode || null,
    department_code: departmentCode,
    country: String(body?.country || '').trim() || 'France',
    discord_url: String(body?.discordUrl || '').trim() || null,
    website_url: String(body?.websiteUrl || '').trim() || null,
    google_maps_url: String(body?.googleMapsUrl || '').trim() || null,
    activities: normalizePlaceActivities(body?.activities),
    is_active: Boolean(body?.isActive),
    search_text: buildPlaceSearchText({
      name,
      description: body?.description,
      city,
      postalCode,
      departmentCode,
      addressLine: body?.addressLine,
      country: body?.country
    }),
    updated_at: new Date().toISOString()
  }
}

export async function GET(request: NextRequest) {
  const authError = await requireAdmin(request)
  if (authError) return authError

  const { data, error } = await supabase
    .from('places')
    .select('*')
    .order('city', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    rows: (((data as PlaceRow[] | null) || []) as PlaceRow[]).map((row) => ({
      ...row,
      activities: normalizePlaceActivities(row.activities)
    }))
  })
}

export async function POST(request: NextRequest) {
  const authError = await requireAdmin(request)
  if (authError) return authError

  const body = await request.json().catch(() => ({}))
  const payload = normalizePayload(body)

  if (!payload.name) {
    return NextResponse.json({ error: 'Nom requis' }, { status: 400 })
  }
  if (!payload.slug) {
    return NextResponse.json({ error: 'Slug invalide' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('places')
    .insert(payload)
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ row: data })
}
