import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSupportTarget } from '@/app/api/admin/support/_shared'
import { fetchUserSetStatsService } from '@/lib/server/userCollectionService'
import { supabaseServiceServer } from '@/lib/server/supabaseServer'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const access = await requireAdminSupportTarget(request)
  if (access.error) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const [{ data: profileData, error: profileError }, statsData] = await Promise.all([
    supabaseServiceServer
      .from('profiles')
      .select('username')
      .eq('id', access.targetUserId!)
      .maybeSingle(),
    fetchUserSetStatsService(access.targetUserId!)
  ])

  if (profileError) {
    return NextResponse.json({ error: `Erreur profil: ${profileError.message}` }, { status: 500 })
  }

  return NextResponse.json({
    user: {
      id: access.targetUserId,
      username: profileData?.username || 'Utilisateur',
      email: access.admin?.email || ''
    },
    sets: statsData.sets,
    stats: statsData.stats
  })
}
