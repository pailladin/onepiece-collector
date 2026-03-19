import { NextResponse } from 'next/server'
import { supabaseServiceServer } from '@/lib/server/supabaseServer'
import { filterCardPrints, type AltFilter } from '@/lib/filtering/filterCardPrints'

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

type SearchItem = PrintRow & {
  set: {
    code: string
    name: string | null
    availableLanguages: string[]
  }
  card: CardRow | null
}

const CARD_IDS_CHUNK_SIZE = 100
const PAGE_SIZE = 50
const SCAN_BATCH_SIZE = 250

function chunkArray<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size))
  }
  return chunks
}

function normalizeSetCode(value: string | null | undefined) {
  return (value || '').trim().toUpperCase()
}

function isSetScopedFallbackPrint(printCode: string | null | undefined, setCode: string) {
  const raw = (printCode || '').trim().toUpperCase()
  if (!raw || !setCode) return false
  return raw.includes(`_${setCode}`)
}

function parsePage(value: string | null) {
  const parsed = Number(value || '1')
  if (!Number.isFinite(parsed) || parsed < 1) return 1
  return Math.floor(parsed)
}

function getVisualKey(item: SearchItem) {
  const baseCode = String(item.print_code || '')
    .trim()
    .toUpperCase()
    .split('_')[0]
  const variant = String(item.variant_type || 'normal').trim().toUpperCase()
  const imageKey = String(item.image_path || '__missing__')
    .trim()
    .toUpperCase()

  return `${item.set.code}::${baseCode}::${variant}::${imageKey}`
}

function shouldReplaceExisting(existing: SearchItem, candidate: SearchItem) {
  const setCode = candidate.set.code
  const existingFallback = isSetScopedFallbackPrint(existing.print_code, setCode)
  const candidateFallback = isSetScopedFallbackPrint(candidate.print_code, setCode)
  const existingMissingImage = !existing.image_path
  const candidateHasImage = Boolean(candidate.image_path)

  return (existingFallback && !candidateFallback) || (existingMissingImage && candidateHasImage)
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = (searchParams.get('q') || '').trim()
  const rarity = (searchParams.get('rarity') || 'all').trim()
  const type = (searchParams.get('type') || 'all').trim()
  const alt = ((searchParams.get('alt') || 'all').trim() || 'all') as AltFilter
  const altType = (searchParams.get('altType') || 'all').trim() || 'all'
  const page = parsePage(searchParams.get('page'))

  const startIndex = (page - 1) * PAGE_SIZE

  const { data: setsData, error: setsError } = await supabaseServiceServer
    .from('sets')
    .select('id, code, name, available_languages')
    .order('code', { ascending: true })

  if (setsError) {
    return NextResponse.json(
      { error: `Erreur lecture sets: ${setsError.message}` },
      { status: 500 }
    )
  }

  const sets = ((setsData as SetRow[] | null) || []).filter(
    (set) => typeof set?.id === 'string' && typeof set?.code === 'string' && set.code.trim()
  )
  const setsById = new Map<string, SetRow>(
    sets.map((set) => [
      set.id,
      {
        ...set,
        code: normalizeSetCode(set.code)
      }
    ])
  )

  const matchedItemsByKey = new Map<string, SearchItem>()
  let offset = 0
  let reachedEnd = false

  while (!reachedEnd) {
    const { data: printsData, error: printsError } = await supabaseServiceServer
      .from('card_prints')
      .select('id, print_code, variant_type, image_path, card_id, distribution_set_id, available_languages')
      .order('distribution_set_id', { ascending: true })
      .order('print_code', { ascending: true })
      .range(offset, offset + SCAN_BATCH_SIZE - 1)

    if (printsError) {
      return NextResponse.json(
        { error: `Erreur lecture prints: ${printsError.message}` },
        { status: 500 }
      )
    }

    const prints = ((printsData as PrintRow[] | null) || []).filter(
      (print) =>
        typeof print?.id === 'string' &&
        typeof print?.card_id === 'string' &&
        typeof print?.distribution_set_id === 'string' &&
        setsById.has(print.distribution_set_id)
    )

    if (prints.length === 0) {
      reachedEnd = true
      continue
    }

    offset += prints.length
    if (prints.length < SCAN_BATCH_SIZE) {
      reachedEnd = true
    }

    const cardIds = [...new Set(prints.map((row) => row.card_id))]
    const cardsRows: CardRow[] = []

    for (const chunk of chunkArray(cardIds, CARD_IDS_CHUNK_SIZE)) {
      const { data: cardsData, error: cardsError } = await supabaseServiceServer
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

      if (cardsError) {
        return NextResponse.json(
          { error: `Erreur lecture cards: ${cardsError.message}` },
          { status: 500 }
        )
      }

      cardsRows.push(...(((cardsData as CardRow[] | null) || []) as CardRow[]))
    }

    const cardsById = new Map<string, CardRow>(cardsRows.map((row) => [row.id, row]))

    const batchItems: SearchItem[] = prints.map((print) => {
      const set = setsById.get(print.distribution_set_id)!

      return {
        ...print,
        set: {
          code: set.code,
          name: set.name,
          availableLanguages: set.available_languages || []
        },
        card: cardsById.get(print.card_id) || null
      }
    })

    const filteredBatch = filterCardPrints(batchItems, {
      query,
      rarity,
      type,
      alt,
      altType
    })

    for (const item of filteredBatch) {
      const visualKey = getVisualKey(item)
      const existing = matchedItemsByKey.get(visualKey)

      if (existing) {
        if (shouldReplaceExisting(existing, item)) {
          matchedItemsByKey.set(visualKey, item)
        }
        continue
      }

      matchedItemsByKey.set(visualKey, item)
    }
  }

  const matchedItems = [...matchedItemsByKey.values()]
  const totalItems = matchedItems.length
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))
  const items = matchedItems.slice(startIndex, startIndex + PAGE_SIZE)
  const hasNextPage = page < totalPages

  return NextResponse.json({
    items,
    page,
    pageSize: PAGE_SIZE,
    totalItems,
    totalPages,
    hasNextPage,
    hasPreviousPage: page > 1
  })
}
