import { NextResponse } from 'next/server'
import { getRequestUserId } from '@/lib/server/authUser'
import {
  computeUserCollectionSnapshot,
  saveUserCollectionSnapshot
} from '@/lib/server/collectionValueHistory'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const userResult = await getRequestUserId(request)
  if (!userResult.userId) {
    return NextResponse.json(
      { error: userResult.error || 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const snapshot = await computeUserCollectionSnapshot(userResult.userId)
    await saveUserCollectionSnapshot({
      userId: userResult.userId,
      source: 'manual',
      snapshot
    })

    return NextResponse.json({
      ok: true,
      periodStart: snapshot.periodStart,
      periodEnd: snapshot.periodEnd,
      totalValue: snapshot.totalValue,
      setsCount: snapshot.setRows.length
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur serveur'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
