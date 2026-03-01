import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getRequestUser } from '@/lib/server/authUser'
import { isAdminEmail, parseAdminEmails } from '@/lib/admin'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function normalizeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean)
}

export async function POST(request: Request) {
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

  const body = await request.json().catch(() => ({}))
  const userIds = normalizeIds(body?.userIds)
  if (userIds.length === 0) {
    return NextResponse.json({ error: 'Aucun utilisateur selectionne' }, { status: 400 })
  }

  const logs: string[] = []
  let deleted = 0
  let skipped = 0
  let failed = 0

  for (const userId of userIds) {
    if (userId === userResult.user.id) {
      skipped += 1
      logs.push(`SKIP ${userId}: suppression de ton propre compte interdite`)
      continue
    }

    const { error } = await supabase.auth.admin.deleteUser(userId)
    if (error) {
      failed += 1
      logs.push(`Erreur suppression ${userId}: ${error.message}`)
      continue
    }

    deleted += 1
    logs.push(`OK suppression ${userId}`)
  }

  logs.push(`Resume: ${deleted} supprime(s), ${skipped} ignore(s), ${failed} erreur(s)`)

  return NextResponse.json({
    logs,
    deleted,
    skipped,
    failed
  })
}

