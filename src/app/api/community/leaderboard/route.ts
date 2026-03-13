import { NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/server/authUser'
import { supabaseServiceServer } from '@/lib/server/supabaseServer'

export const runtime = 'nodejs'

type ScoreRow = {
  user_id: string
  points: number
  approved_count: number
  rejected_count: number
}

type ProfileRow = {
  id: string
  username: string | null
}

export async function GET(request: Request) {
  const userResult = await getRequestUser(request)
  if (!userResult.user) {
    return NextResponse.json({ error: userResult.error || 'Unauthorized' }, { status: 401 })
  }

  const { data: scoreData, error: scoreError } = await supabaseServiceServer
    .from('contributor_scores')
    .select('user_id, points, approved_count, rejected_count')
    .order('points', { ascending: false })
    .order('approved_count', { ascending: false })
    .limit(50)

  if (scoreError) {
    return NextResponse.json({ error: scoreError.message }, { status: 500 })
  }

  const scores = (scoreData as ScoreRow[] | null) || []
  const profileIds = scores.map((row) => row.user_id)
  const profilesById = new Map<string, string>()

  if (profileIds.length > 0) {
    const { data: profilesData } = await supabaseServiceServer
      .from('profiles')
      .select('id, username')
      .in('id', profileIds)

    for (const row of (profilesData as ProfileRow[] | null) || []) {
      profilesById.set(row.id, row.username || 'Utilisateur')
    }
  }

  return NextResponse.json({
    rows: scores.map((row, index) => ({
      rank: index + 1,
      userId: row.user_id,
      username: profilesById.get(row.user_id) || 'Utilisateur',
      points: row.points,
      approvedCount: row.approved_count,
      rejectedCount: row.rejected_count
    }))
  })
}
