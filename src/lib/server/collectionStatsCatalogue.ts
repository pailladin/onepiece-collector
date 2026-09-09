import { supabaseServiceServer } from '@/lib/server/supabaseServer'

type StatsSet = { id: string; code: string; name: string | null }
type StatsPrint = { id: string; distribution_set_id: string; variant_type: string | null }
type StatsCatalogue = { sets: StatsSet[]; prints: StatsPrint[] }

const PAGE_SIZE = 1000
const CACHE_TTL_MS = 60_000
let cache: { value: StatsCatalogue; expiresAt: number } | null = null
let inFlight: Promise<StatsCatalogue> | null = null

async function fetchRows<T>(table: string, columns: string, orderColumn: string): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabaseServiceServer
      .from(table)
      .select(columns)
      .order(orderColumn, { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`Lecture ${table} impossible: ${error.message}`)
    const page = (data as T[] | null) || []
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

// Only public catalogue metadata is cached. Ownership is read fresh per request.
// Collection counters do not need card details, translations or image paths.
export async function getCollectionStatsCatalogue(): Promise<StatsCatalogue> {
  if (cache && cache.expiresAt > Date.now()) return cache.value
  if (inFlight) return inFlight

  inFlight = Promise.all([
    fetchRows<StatsSet>('sets', 'id, code, name', 'code'),
    fetchRows<StatsPrint>('card_prints', 'id, distribution_set_id, variant_type', 'id')
  ]).then(([sets, prints]) => {
    const value = {
      sets: sets
        .filter((set) => Boolean(set.id && set.code))
        .map((set) => ({ ...set, code: set.code.replace(/-/g, '').trim().toUpperCase() }))
        .sort((a, b) => a.code.localeCompare(b.code)),
      prints
    }
    cache = { value, expiresAt: Date.now() + CACHE_TTL_MS }
    return value
  }).finally(() => {
    inFlight = null
  })
  return inFlight
}
