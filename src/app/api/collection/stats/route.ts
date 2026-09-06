import { NextResponse } from 'next/server'
import {
  aggregateCollectionRows,
  fetchAllUserCollectionRows
} from '@/lib/collections/quantities'
import { isAltVersion } from '@/lib/filtering/filterCardPrints'
import { getRequestUserId } from '@/lib/server/authUser'
import { getCatalogueIndex } from '@/lib/server/catalogueIndex'
import { supabaseServiceServer } from '@/lib/server/supabaseServer'

type MutableStats = {
  total: number
  owned: number
  totalNormal: number
  ownedNormal: number
  totalAlt: number
  ownedAlt: number
}

function withPercentages(stats: MutableStats) {
  return {
    ...stats,
    percent: stats.total > 0 ? Math.round((stats.owned / stats.total) * 100) : 0,
    percentNormal:
      stats.totalNormal > 0 ? Math.round((stats.ownedNormal / stats.totalNormal) * 100) : 0,
    percentAlt:
      stats.totalAlt > 0 ? Math.round((stats.ownedAlt / stats.totalAlt) * 100) : 0
  }
}

export async function GET(request: Request) {
  const startedAt = Date.now()
  const userResult = await getRequestUserId(request)
  if (!userResult.userId) {
    return NextResponse.json(
      { error: userResult.error || 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const [catalogueIndex, collectionRows] = await Promise.all([
      getCatalogueIndex(),
      fetchAllUserCollectionRows({
        supabase: supabaseServiceServer,
        userId: userResult.userId
      })
    ])
    const { totalByPrintId } = aggregateCollectionRows(collectionRows)
    const statsBySetCode = new Map<string, MutableStats>()

    for (const set of catalogueIndex.sets) {
      statsBySetCode.set(set.code, {
        total: 0,
        owned: 0,
        totalNormal: 0,
        ownedNormal: 0,
        totalAlt: 0,
        ownedAlt: 0
      })
    }

    for (const item of catalogueIndex.items) {
      const stats = statsBySetCode.get(item.set.code)
      if (!stats) continue
      const owned = totalByPrintId.has(item.id)
      const alt = isAltVersion(item)
      stats.total += 1
      if (owned) stats.owned += 1
      if (alt) {
        stats.totalAlt += 1
        if (owned) stats.ownedAlt += 1
      } else {
        stats.totalNormal += 1
        if (owned) stats.ownedNormal += 1
      }
    }

    const stats = Object.fromEntries(
      [...statsBySetCode.entries()].map(([code, value]) => [code, withPercentages(value)])
    )
    const sets = catalogueIndex.sets.map((set) => ({
      id: set.id,
      code: set.code,
      name: set.name || set.code
    }))

    return NextResponse.json(
      { sets, stats },
      {
        headers: {
          'Cache-Control': 'private, no-store',
          'Server-Timing': `collection-stats;dur=${Date.now() - startedAt}`
        }
      }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur chargement collection'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
