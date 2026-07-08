import { NextResponse } from 'next/server'
import { isAdminEmail, parseAdminEmails } from '@/lib/admin'
import { getRequestUser } from '@/lib/server/authUser'
import { supabaseServiceServer } from '@/lib/server/supabaseServer'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const userResult = await getRequestUser(request)
  if (!userResult.user) {
    return NextResponse.json({ error: userResult.error || 'Unauthorized' }, { status: 401 })
  }

  const adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS)
  if (!isAdminEmail(userResult.user.email, adminEmails)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await supabaseServiceServer
    .from('community_submissions')
    .select('created_at')
    .eq('status', 'pending')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data as Array<{ created_at: string | null }> | null) || []
  const overdueLimit = Date.now() - 48 * 60 * 60 * 1000
  const overdueCount = rows.filter((row) => {
    const createdAt = Date.parse(String(row.created_at || ''))
    return Number.isFinite(createdAt) && createdAt < overdueLimit
  }).length

  return NextResponse.json({
    pendingCount: rows.length,
    overdueCount
  })
}
