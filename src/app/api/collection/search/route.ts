import { NextResponse } from 'next/server'
import { getRequestUserId } from '@/lib/server/authUser'
import { supabaseServiceServer } from '@/lib/server/supabaseServer'
import {
  aggregateCollectionRows,
  fetchAllUserCollectionRows
} from '@/lib/collections/quantities'
import { filterCardPrints, getFilterOptions, type AltFilter } from '@/lib/filtering/filterCardPrints'
import { getSetPricing } from '@/lib/server/setPricing'

type SetRow = {
  id: string
  code: string
  name: string | null
  available_languages?: string[] | null
}

type PrintRow = {
  id: string
  print_code: string | null
  variant_type: string | null
  image_path: string | null
  card_id: string
  distribution_set_id: string
  available_languages?: string[] | null
}

type CardTranslationRow = {
  name: string
  locale: string
}

type CardRow = {
  id: string
  number: string | null
  rarity: string | null
  type: string | null
  card_translations?: CardTranslationRow[] | null
}

type CollectionSearchItem = PrintRow & {
  quantity: number
  languageBreakdown: Array<{ languageCode: string; quantity: number }>
  cardmarketProductId: string | null
  cardmarketPrice: number | null
  set: {
    code: string
    name: string | null
    availableLanguages: string[]
  }
  card: CardRow | null
}

const PAGE_SIZE = 50
const IN_CHUNK_SIZE = 80

function chunkArray<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size))
  }
  return chunks
}

function parsePage(value: string | null) {
  const parsed = Number(value || '1')
  if (!Number.isFinite(parsed) || parsed < 1) return 1
  return Math.floor(parsed)
}

function normalizeSetCode(value: string | null | undefined) {
  return (value || '').trim().toUpperCase()
}

function serializeLanguageBreakdown(value: Map<string, number> | undefined) {
  return [...(value?.entries() || [])]
    .filter(([, quantity]) => quantity > 0)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([languageCode, quantity]) => ({ languageCode, quantity }))
}

export async function GET(request: Request) {
  const userResult = await getRequestUserId(request)
  if (!userResult.userId) {
    return NextResponse.json(
      { error: userResult.error || 'Unauthorized' },
      { status: 401 }
    )
  }

  const { searchParams } = new URL(request.url)
  const query = (searchParams.get('q') || '').trim()
  const rarity = (searchParams.get('rarity') || 'all').trim()
  const type = (searchParams.get('type') || 'all').trim()
  const alt = ((searchParams.get('alt') || 'all').trim() || 'all') as AltFilter
  const altType = (searchParams.get('altType') || 'all').trim() || 'all'
  const page = parsePage(searchParams.get('page'))
  const startIndex = (page - 1) * PAGE_SIZE

  try {
    const collectionRows = await fetchAllUserCollectionRows({
      supabase: supabaseServiceServer,
      userId: userResult.userId
    })
    const { totalByPrintId, byPrintIdLanguage } = aggregateCollectionRows(collectionRows)
    const printIds = [...totalByPrintId.keys()]

    if (printIds.length === 0) {
      return NextResponse.json({
        items: [],
        options: { rarities: [], types: [], altTypes: [] },
        page,
        pageSize: PAGE_SIZE,
        totalItems: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false
      })
    }

    const prints: PrintRow[] = []
    for (const chunk of chunkArray(printIds, IN_CHUNK_SIZE)) {
      const { data, error } = await supabaseServiceServer
        .from('card_prints')
        .select('id, print_code, variant_type, image_path, card_id, distribution_set_id, available_languages')
        .in('id', chunk)

      if (error) {
        return NextResponse.json(
          { error: `Erreur lecture prints: ${error.message}` },
          { status: 500 }
        )
      }
      prints.push(...(((data as PrintRow[] | null) || []) as PrintRow[]))
    }

    const setIds = [...new Set(prints.map((row) => row.distribution_set_id).filter(Boolean))]
    const cardIds = [...new Set(prints.map((row) => row.card_id).filter(Boolean))]
    const sets: SetRow[] = []
    const cards: CardRow[] = []

    for (const chunk of chunkArray(setIds, IN_CHUNK_SIZE)) {
      const { data, error } = await supabaseServiceServer
        .from('sets')
        .select('id, code, name, available_languages')
        .in('id', chunk)

      if (error) {
        return NextResponse.json(
          { error: `Erreur lecture sets: ${error.message}` },
          { status: 500 }
        )
      }
      sets.push(...(((data as SetRow[] | null) || []) as SetRow[]))
    }

    for (const chunk of chunkArray(cardIds, IN_CHUNK_SIZE)) {
      const { data, error } = await supabaseServiceServer
        .from('cards')
        .select(
          `
          id,
          number,
          rarity,
          type,
          card_translations (
            name,
            locale
          )
        `
        )
        .in('id', chunk)

      if (error) {
        return NextResponse.json(
          { error: `Erreur lecture cards: ${error.message}` },
          { status: 500 }
        )
      }
      cards.push(...(((data as CardRow[] | null) || []) as CardRow[]))
    }

    const setsById = new Map(
      sets.map((set) => [
        set.id,
        {
          ...set,
          code: normalizeSetCode(set.code)
        }
      ])
    )
    const cardsById = new Map(cards.map((card) => [card.id, card]))

    const ownedItems: CollectionSearchItem[] = prints
      .map((print) => {
        const set = setsById.get(print.distribution_set_id)
        if (!set) return null

        return {
          ...print,
          quantity: totalByPrintId.get(print.id) || 0,
          languageBreakdown: serializeLanguageBreakdown(byPrintIdLanguage.get(print.id)),
          cardmarketProductId: null as string | null,
          cardmarketPrice: null as number | null,
          set: {
            code: set.code,
            name: set.name,
            availableLanguages: set.available_languages || []
          },
          card: cardsById.get(print.card_id) || null
        }
      })
      .filter((item): item is CollectionSearchItem => Boolean(item && item.quantity > 0))
      .sort((a, b) => a.set.code.localeCompare(b.set.code) || String(a.print_code || '').localeCompare(String(b.print_code || '')))

    const options = getFilterOptions(ownedItems)
    const matchedItems = filterCardPrints(ownedItems, {
      query,
      rarity,
      type,
      alt,
      altType
    })

    const totalItems = matchedItems.length
    const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))
    const pageItems = matchedItems.slice(startIndex, startIndex + PAGE_SIZE)
    const pageSetCodes = [...new Set(pageItems.map((item) => item.set.code))]
    const pricingBySetCode = new Map(
      await Promise.all(
        pageSetCodes.map(async (setCode) => {
          try {
            return [setCode, await getSetPricing(setCode)] as const
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

    return NextResponse.json({
      items,
      options,
      page,
      pageSize: PAGE_SIZE,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur chargement collection'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
