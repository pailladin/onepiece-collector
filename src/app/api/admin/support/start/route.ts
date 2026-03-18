import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/server/authUser'
import { isAdminEmail, parseAdminEmails } from '@/lib/admin'
import { setSupportSessionCookie } from '@/lib/server/supportSession'
import { supabaseAdmin } from '@/app/api/admin/support/_shared'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const userResult = await getRequestUser(request)
  if (!userResult.user) {
    return NextResponse.json({ error: userResult.error || 'Unauthorized' }, { status: 401 })
  }

  const adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS)
  if (!isAdminEmail(userResult.user.email, adminEmails)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const targetUserId = String(body?.userId || '').trim()
  if (!targetUserId) {
    return NextResponse.json({ error: 'userId requis' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin.auth.admin.getUserById(targetUserId)
  if (error || !data.user) {
    return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 })
  }

  const response = NextResponse.json({
    ok: true,
    user: {
      id: data.user.id,
      email: data.user.email || ''
    }
  })
  setSupportSessionCookie(response, targetUserId)
  return response
}
