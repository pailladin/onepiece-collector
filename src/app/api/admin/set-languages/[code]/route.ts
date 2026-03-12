import { NextResponse } from 'next/server'
import { supabaseServiceServer } from '@/lib/server/supabaseServer'
import { getRequestUser } from '@/lib/server/authUser'
import { isAdminEmail, parseAdminEmails } from '@/lib/admin'
import { normalizeSetLanguages } from '@/lib/collections/languages'

export const runtime = 'nodejs'

function normalizeCode(value: string | null | undefined) {
  return (value || '').replace(/-/g, '').trim().toUpperCase()
}

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> }
) {
  const userResult = await getRequestUser(request)
  if (!userResult.user) {
    return NextResponse.json({ error: userResult.error || 'Unauthorized' }, { status: 401 })
  }

  const adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS)
  if (!isAdminEmail(userResult.user.email, adminEmails)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const code = normalizeCode((await context.params).code)
  const { data, error } = await supabaseServiceServer
    .from('sets')
    .select('code, name, available_languages')
    .eq('code', code)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Set introuvable' }, { status: 404 })
  }

  const row = data as { code: string; name: string | null; available_languages?: string[] | null }
  return NextResponse.json({
    set: {
      code: row.code,
      name: row.name,
      availableLanguages: normalizeSetLanguages(row.available_languages || [])
    }
  })
}

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> }
) {
  const userResult = await getRequestUser(request)
  if (!userResult.user) {
    return NextResponse.json({ error: userResult.error || 'Unauthorized' }, { status: 401 })
  }

  const adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS)
  if (!isAdminEmail(userResult.user.email, adminEmails)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const code = normalizeCode((await context.params).code)
  const body = await request.json().catch(() => ({}))
  const availableLanguages = normalizeSetLanguages(
    Array.isArray(body?.availableLanguages) ? body.availableLanguages : []
  )

  const { data, error } = await supabaseServiceServer
    .from('sets')
    .update({ available_languages: availableLanguages })
    .eq('code', code)
    .select('code, name, available_languages')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Set introuvable' }, { status: 404 })
  }

  const row = data as { code: string; name: string | null; available_languages?: string[] | null }
  return NextResponse.json({
    ok: true,
    set: {
      code: row.code,
      name: row.name,
      availableLanguages: normalizeSetLanguages(row.available_languages || [])
    }
  })
}
