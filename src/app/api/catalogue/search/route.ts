import { NextResponse } from 'next/server'
import { filterCardPrints, type AltFilter } from '@/lib/filtering/filterCardPrints'
import {
  getCatalogueIndex,
  type CatalogueIndexItem
} from '@/lib/server/catalogueIndex'

const PAGE_SIZE = 50

function parsePage(value: string | null) {
  const parsed = Number(value || '1')
  if (!Number.isFinite(parsed) || parsed < 1) return 1
  return Math.floor(parsed)
}

function isSetScopedFallbackPrint(printCode: string | null | undefined, setCode: string) {
  const raw = (printCode || '').trim().toUpperCase()
  return Boolean(raw && setCode && raw.includes(`_${setCode}`))
}

function getVisualKey(item: CatalogueIndexItem) {
  const baseCode = String(item.print_code || '').trim().toUpperCase().split('_')[0]
  const variant = String(item.variant_type || 'normal').trim().toUpperCase()
  const imageKey = String(item.image_path || '__missing__').trim().toUpperCase()
  return `${item.set.code}::${baseCode}::${variant}::${imageKey}`
}

function shouldReplaceExisting(existing: CatalogueIndexItem, candidate: CatalogueIndexItem) {
  const setCode = candidate.set.code
  const existingFallback = isSetScopedFallbackPrint(existing.print_code, setCode)
  const candidateFallback = isSetScopedFallbackPrint(candidate.print_code, setCode)
  return (
    (existingFallback && !candidateFallback) ||
    (!existing.image_path && Boolean(candidate.image_path))
  )
}

export async function GET(request: Request) {
  const startedAt = Date.now()
  const { searchParams } = new URL(request.url)
  const page = parsePage(searchParams.get('page'))
  const startIndex = (page - 1) * PAGE_SIZE

  try {
    const index = await getCatalogueIndex()
    const filteredItems = filterCardPrints(index.items, {
      query: (searchParams.get('q') || '').trim(),
      rarity: (searchParams.get('rarity') || 'all').trim(),
      type: (searchParams.get('type') || 'all').trim(),
      alt: ((searchParams.get('alt') || 'all').trim() || 'all') as AltFilter,
      altType: (searchParams.get('altType') || 'all').trim() || 'all'
    })

    const dedupedByVisualKey = new Map<string, CatalogueIndexItem>()
    for (const item of filteredItems) {
      const visualKey = getVisualKey(item)
      const existing = dedupedByVisualKey.get(visualKey)
      if (!existing || shouldReplaceExisting(existing, item)) {
        dedupedByVisualKey.set(visualKey, item)
      }
    }

    const matchedItems = [...dedupedByVisualKey.values()]
    const totalItems = matchedItems.length
    const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE))

    return NextResponse.json(
      {
        items: matchedItems.slice(startIndex, startIndex + PAGE_SIZE),
        page,
        pageSize: PAGE_SIZE,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
          'Server-Timing': `catalogue-search;dur=${Date.now() - startedAt}`
        }
      }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur chargement cartes'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
