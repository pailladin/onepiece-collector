import { NextRequest, NextResponse } from 'next/server'
import { supabaseServiceServer } from '@/lib/server/supabaseServer'
import {
  computeUserCollectionSnapshot,
  saveUserCollectionSnapshot
} from '@/lib/server/collectionValueHistory'

export const runtime = 'nodejs'

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false
  const authHeader = request.headers.get('authorization')
  return authHeader === `Bearer ${cronSecret}`
}

async function runJob() {
  const { data, error } = await supabaseServiceServer
    .from('collections')
    .select('user_id')
    .gt('quantity', 0)

  if (error) {
    throw new Error(`Erreur lecture utilisateurs: ${error.message}`)
  }

  const userIds = [...new Set(((data as Array<{ user_id: string }> | null) || []).map((r) => r.user_id).filter(Boolean))]
  let successCount = 0
  const failed: Array<{ userId: string; error: string }> = []

  for (const userId of userIds) {
    try {
      const snapshot = await computeUserCollectionSnapshot(userId)
      await saveUserCollectionSnapshot({
        userId,
        source: 'weekly-cron',
        snapshot
      })
      successCount += 1
    } catch (error) {
      failed.push({
        userId,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  return {
    ok: true,
    scannedUsers: userIds.length,
    successCount,
    failedCount: failed.length,
    failed: failed.slice(0, 20),
    executedAt: new Date().toISOString()
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const payload = await runJob()
    return NextResponse.json(payload)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
