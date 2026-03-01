import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getRequestUser } from '@/lib/server/authUser'
import { isAdminEmail, parseAdminEmails } from '@/lib/admin'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type ProfileRow = {
  id: string
  username: string | null
}

export async function GET(request: Request) {
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

  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000
  })

  if (error) {
    return NextResponse.json(
      { error: `Erreur liste users: ${error.message}` },
      { status: 500 }
    )
  }

  const users = data?.users || []
  const userIds = users.map((u) => u.id)

  let profileById = new Map<string, string | null>()
  if (userIds.length > 0) {
    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', userIds)

    if (!profilesError) {
      const profiles = (profilesData as ProfileRow[] | null) || []
      profileById = new Map(profiles.map((row) => [row.id, row.username]))
    }
  }

  const payload = users
    .map((row) => ({
      id: row.id,
      email: row.email || '',
      username:
        profileById.get(row.id) ||
        (typeof row.user_metadata?.username === 'string'
          ? row.user_metadata.username
          : ''),
      createdAt: row.created_at || null,
      lastSignInAt: row.last_sign_in_at || null,
      emailConfirmedAt: row.email_confirmed_at || null
    }))
    .sort((a, b) => {
      const av = a.createdAt ? Date.parse(a.createdAt) : 0
      const bv = b.createdAt ? Date.parse(b.createdAt) : 0
      return bv - av
    })

  return NextResponse.json({ users: payload })
}

