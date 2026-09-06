import { NextResponse } from 'next/server'
import {
  aggregateCollectionRows,
  fetchAllUserCollectionRows
} from '@/lib/collections/quantities'
import { filterCardPrints, getFilterOptions, type AltFilter } from '@/lib/filtering/filterCardPrints'
import { getRequestUserId } from '@/lib/server/authUser'
import { getCatalogueIndex, type CatalogueIndexItem } from '@/lib/server/catalogueIndex'
import { getSetPricing } from '@/lib/server/setPricing'
import { supabaseServiceServer } from '@/lib/server/supabaseServer'

const PAGE_SIZE = 50

type CollectionSearchItem = CatalogueIndexItem & {
  quantity: number
  languageBreakdown: Array<{ languageCode: string; quantity: number }>
  cardmarketProductId: string | null
  cardmarketPrice: number | null
}

function parsePage(value: string | null) {
  const parsed = Number(value || '1')
  if (!Number.isFinite(parsed) || parsed < 1) return 1
  return Math.floor(parsed)
}

function serializeLanguageBreakdown(value: Map<string, number> | undefined) {
  return [...(value?.entries() || [])]
    .filter(([, quantity]) => quantity > 0)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([languageCode, quantity]) => ({ languageCode, quantity }))
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

  const { searchParams } = new URL(request.url)
  const page = parsePage(searchParams.get('page'))
  const startIndex = (page - 1) * PAGE_SIZE

  try {
    const [collectionRows, catalogueIndex] = await Promise.all([
      fetchAllUserCollectionRows({
        supabase: supabaseServiceServer,
        userId: userResult.userId
      }),
      getCatalogueIndex()
    ])
    const { totalByPrintId, byPrintIdLanguage } = aggregateCollectionRows(collectionRows)

    const ownedItems: CollectionSearchItem[] = []
    for (const [printId, quantity] of totalByPrintId.entries()) {
      const item = catalogueIndex.itemByPrintId.get(printId)
      if (!item || quantity <= 0) continue
      ownedItems.push({
        ...item,
        quantity,
        languageBreakdown: serializeLanguageBreakdown(byPrintIdLanguage.get(printId)),
        cardmarketProductId: null,
        cardmarketPrice: null
      })
    }
    ownedItems.sort(
      (a, b) =>
        a.set.code.localeCompare(b.set.code) ||
        String(a.print_code || '').localeCompare(String(b.print_code || ''))
    )

    const options = getFilterOptions(ownedItems)
    const matchedItems = filterCardPrints(ownedItems, {
      query: (searchParams.get('q') || '').trim(),
      rarity: (searchParams.get('rarity') || 'all').trim(),
      type: (searchParams.get('type') || 'all').trim(),
      alt: ((searchParams.get('alt') || 'all').trim() || 'all') as AltFilter,
      altType: (searchParams.get('altType') || 'all').trim() || 'all'
    })

    const totalItems = matchedItems.length
    const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))
    const pageItems = matchedItems.slice(startIndex, startIndex + PAGE_SIZE)
    const pageSetCodes = [...new Set(pageItems.map((item) => item.set.code))]
    const pricingBySetCode = new Map(
      await Promise.all(
        pageSetCodes.map(async (setCode) => {
          try {
            return [
              setCode,
              await getSetPricing(setCode, { includeTrends: false })
            ] as const
          } catch {
            return [setCode, null] as const
          }
        })
      )
    )

    const items = pageItems.map((item) => {
      const pricing = pricingBySetCode.get(item.set.code)
      const rawPrice = pricing?.pricesByPrintId[item.id]
      return {
        ...item,
        cardmarketProductId: pricing?.cardmarketProductIdsByPrintId[item.id] || null,
        cardmarketPrice: Number.isFinite(rawPrice) ? Number(rawPrice) : null
      }
    })

    return NextResponse.json(
      {
        items,
        options,
        page,
        pageSize: PAGE_SIZE,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1
      },
      {
        headers: {
          'Cache-Control': 'private, no-store',
          'Server-Timing': `collection-search;dur=${Date.now() - startedAt}`
        }
      }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur chargement collection'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
