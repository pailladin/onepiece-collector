import { NextResponse } from 'next/server'
import {
  aggregateCollectionRows,
  fetchAllUserCollectionRows
} from '@/lib/collections/quantities'
import { getRequestUserId } from '@/lib/server/authUser'
import { getCatalogueIndex } from '@/lib/server/catalogueIndex'
import { getSetPricing } from '@/lib/server/setPricing'
import { supabaseServiceServer } from '@/lib/server/supabaseServer'

export async function GET(request: Request) {
  const userResult = await getRequestUserId(request)
  if (!userResult.userId) {
    return NextResponse.json(
      { error: userResult.error || 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const [collectionRows, catalogueIndex] = await Promise.all([
      fetchAllUserCollectionRows({
        supabase: supabaseServiceServer,
        userId: userResult.userId
      }),
      getCatalogueIndex()
    ])
    const { totalByPrintId } = aggregateCollectionRows(collectionRows)
    const groups = new Map<
      string,
      {
        setName: string
        prints: Array<{ printId: string; printCode: string; quantity: number }>
      }
    >()

    for (const [printId, quantity] of totalByPrintId.entries()) {
      const item = catalogueIndex.itemByPrintId.get(printId)
      const printCode = (item?.print_code || '').trim().toUpperCase()
      if (!item || !printCode || quantity <= 0) continue
      if (!groups.has(item.set.code)) {
        groups.set(item.set.code, {
          setName: item.set.name || item.set.code,
          prints: []
        })
      }
      groups.get(item.set.code)?.prints.push({ printId, printCode, quantity })
    }

    const rows = await Promise.all(
      [...groups.entries()].map(async ([setCode, group]) => {
        const pricing = await getSetPricing(setCode, { includeTrends: false }).catch(() => null)
        let total = 0
        let pricedCount = 0
        let usFallbackCount = 0

        for (const print of group.prints) {
          const unitPrice =
            pricing?.pricesByPrintId[print.printId] ?? pricing?.prices[print.printCode]
          if (!Number.isFinite(unitPrice)) continue
          pricedCount += 1
          total += Number(unitPrice) * print.quantity
          const source =
            pricing?.sourcesByPrintId[print.printId] ?? pricing?.sources[print.printCode]
          if (source !== 'cardmarket') usFallbackCount += 1
        }

        return {
          setCode,
          setName: group.setName,
          total,
          pricedCount,
          expectedCount: group.prints.length,
          usFallbackCount
        }
      })
    )
    rows.sort((a, b) => b.total - a.total || a.setCode.localeCompare(b.setCode))

    return NextResponse.json(
      {
        total: rows.reduce((sum, row) => sum + row.total, 0),
        pricedCount: rows.reduce((sum, row) => sum + row.pricedCount, 0),
        expectedCount: rows.reduce((sum, row) => sum + row.expectedCount, 0),
        rows
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur calcul collection'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
