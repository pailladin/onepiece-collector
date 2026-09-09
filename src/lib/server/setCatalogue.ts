import { supabaseServiceServer } from '@/lib/server/supabaseServer'
import type { CatalogueIndexSet } from '@/lib/server/catalogueIndex'

const PAGE_SIZE = 1000
const cache = new Map<string, { expiresAt: number; value: SetCatalogue }>()
const pending = new Map<string, Promise<SetCatalogue | null>>()
type SetCatalogue = NonNullable<Awaited<ReturnType<typeof loadSetCatalogue>>>

async function loadSetCatalogue(code: string) {
  // Match the same normalized codes as the catalogue, including legacy hyphens.
  const sets: CatalogueIndexSet[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabaseServiceServer.from('sets')
      .select('id, code, name, available_languages').order('code').range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`Lecture sets impossible: ${error.message}`)
    sets.push(...(data || []))
    if ((data || []).length < PAGE_SIZE) break
  }
  const set = sets.find((row) => row.code?.replace(/-/g, '').trim().toUpperCase() === code)
  if (!set) return null

  const query = () => supabaseServiceServer.from('card_prints')
    .select('id, print_code, variant_type, image_path, card_id, available_languages, card:cards(id, number, rarity, type, card_translations(name, locale))')
    .eq('distribution_set_id', set.id).order('id')
  const items: NonNullable<Awaited<ReturnType<typeof query>>['data']> = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await query().range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`Lecture prints impossible: ${error.message}`)
    items.push(...(data || []))
    if ((data || []).length < PAGE_SIZE) break
  }
  items.sort((a, b) => String(a.print_code || '').localeCompare(String(b.print_code || '')) || a.id.localeCompare(b.id))
  return {
    set: { id: set.id, code, name: set.name, availableLanguages: set.available_languages || [] },
    items
  }
}

export async function getSetCatalogue(code: string) {
  const cached = cache.get(code)
  if (cached && cached.expiresAt > Date.now()) return cached.value
  const inFlight = pending.get(code)
  if (inFlight) return inFlight
  const request = loadSetCatalogue(code).then((value) => {
    if (value) {
      // Bound memory across requests for many different sets.
      if (cache.size >= 100) cache.delete(cache.keys().next().value!)
      cache.set(code, { value, expiresAt: Date.now() + 60_000 })
    }
    return value
  }).finally(() => pending.delete(code))
  pending.set(code, request)
  return request
}
