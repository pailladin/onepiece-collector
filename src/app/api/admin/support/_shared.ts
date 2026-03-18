import { createClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import { getRequestUser } from '@/lib/server/authUser'
import { parseAdminEmails, isAdminEmail } from '@/lib/admin'
import { getSupportSessionFromRequest } from '@/lib/server/supportSession'

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function requireAdminSupportTarget(request: NextRequest) {
  const userResult = await getRequestUser(request)
  if (!userResult.user) {
    return { error: userResult.error || 'Unauthorized', status: 401 as const, admin: null, targetUserId: null }
  }

  const adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS)
  if (!isAdminEmail(userResult.user.email, adminEmails)) {
    return { error: 'Forbidden', status: 403 as const, admin: userResult.user, targetUserId: null }
  }

  const supportSession = getSupportSessionFromRequest(request)
  if (!supportSession?.userId) {
    return { error: 'Aucune session support active', status: 400 as const, admin: userResult.user, targetUserId: null }
  }

  return {
    error: null,
    status: 200 as const,
    admin: userResult.user,
    targetUserId: supportSession.userId
  }
}
