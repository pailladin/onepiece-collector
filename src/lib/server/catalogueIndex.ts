import { getFilterOptions } from '@/lib/filtering/filterCardPrints'
import { supabaseServiceServer } from '@/lib/server/supabaseServer'

const PAGE_SIZE = 1000
const CACHE_TTL_MS = 60_000

export type CatalogueIndexSet = {
  id: string
  code: string
  name: string | null
  available_languages?: string[] | null
}

export type CatalogueIndexCard = {
  id: string
  number: string | null
  base_code: string | null
  rarity: string | null
  type: string | null
  card_translations?: Array<{ name: string; locale: string }> | null
}

export type CatalogueIndexPrint = {
  id: string
  print_code: string | null
  variant_type: string | null
  image_path: string | null
  card_id: string
  distribution_set_id: string
  available_languages?: string[] | null
}

export type CatalogueIndexItem = CatalogueIndexPrint & {
  set: {
    code: string
    name: string | null
    availableLanguages: string[]
  }
  card: CatalogueIndexCard | null
}

export type CatalogueIndex = {
  sets: CatalogueIndexSet[]
  items: CatalogueIndexItem[]
  itemByPrintId: Map<string, CatalogueIndexItem>
  itemsBySetCode: Map<string, CatalogueIndexItem[]>
  filterOptions: {
    rarities: string[]
    types: string[]
    altTypes: string[]
  }
}

type CacheEntry = {
  expiresAt: number
  value: CatalogueIndex
}

let cache: CacheEntry | null = null
let inFlight: Promise<CatalogueIndex> | null = null

function normalizeSetCode(value: string | null | undefined) {
  return (value || '').replace(/-/g, '').trim().toUpperCase()
}

async function fetchAllRows<T>(params: {
  table: string
  select: string
  orderColumn: string
}): Promise<T[]> {
  const rows: T[] = []

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabaseServiceServer
      .from(params.table)
      .select(params.select)
      .order(params.orderColumn, { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error) {
      throw new Error(`Lecture ${params.table} impossible: ${error.message}`)
    }

    const page = (data as T[] | null) || []
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
  }

  return rows
}

async function buildCatalogueIndex(): Promise<CatalogueIndex> {
  const [setsRows, cards, prints] = await Promise.all([
    fetchAllRows<CatalogueIndexSet>({
      table: 'sets',
      select: 'id, code, name, available_languages',
      orderColumn: 'code'
    }),
    fetchAllRows<CatalogueIndexCard>({
      table: 'cards',
      select: 'id, number, base_code, rarity, type, card_translations(name, locale)',
      orderColumn: 'id'
    }),
    fetchAllRows<CatalogueIndexPrint>({
      table: 'card_prints',
      select:
        'id, print_code, variant_type, image_path, card_id, distribution_set_id, available_languages',
      orderColumn: 'id'
    })
  ])

  const sets = setsRows
    .filter((set) => Boolean(set.id && set.code))
    .map((set) => ({ ...set, code: normalizeSetCode(set.code) }))
    .sort((a, b) => a.code.localeCompare(b.code))
  const setById = new Map(sets.map((set) => [set.id, set]))
  const cardById = new Map(cards.map((card) => [card.id, card]))

  const items = prints
    .map((print) => {
      const set = setById.get(print.distribution_set_id)
      if (!set) return null

      return {
        ...print,
        set: {
          code: set.code,
          name: set.name,
          availableLanguages: set.available_languages || []
        },
        card: cardById.get(print.card_id) || null
      }
    })
    .filter((item): item is CatalogueIndexItem => item !== null)
    .sort(
      (a, b) =>
        a.set.code.localeCompare(b.set.code) ||
        String(a.print_code || '').localeCompare(String(b.print_code || '')) ||
        a.id.localeCompare(b.id)
    )

  const itemByPrintId = new Map(items.map((item) => [item.id, item]))
  const itemsBySetCode = new Map<string, CatalogueIndexItem[]>()
  for (const item of items) {
    if (!itemsBySetCode.has(item.set.code)) itemsBySetCode.set(item.set.code, [])
    itemsBySetCode.get(item.set.code)?.push(item)
  }

  return {
    sets,
    items,
    itemByPrintId,
    itemsBySetCode,
    filterOptions: getFilterOptions(items)
  }
}

export async function getCatalogueIndex(): Promise<CatalogueIndex> {
  const now = Date.now()
  if (cache && cache.expiresAt > now) return cache.value
  if (inFlight) return inFlight

  inFlight = buildCatalogueIndex()
    .then((value) => {
      cache = { value, expiresAt: Date.now() + CACHE_TTL_MS }
      inFlight = null
      return value
    })
    .catch((error) => {
      inFlight = null
      throw error
    })

  return inFlight
}
