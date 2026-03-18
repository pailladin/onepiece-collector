import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/server/authUser'
import { isAdminEmail, parseAdminEmails } from '@/lib/admin'
import { clearSupportSessionCookie } from '@/lib/server/supportSession'

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

  const response = NextResponse.json({ ok: true })
  clearSupportSessionCookie(response)
  return response
}
