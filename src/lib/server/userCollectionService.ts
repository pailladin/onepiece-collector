import { isAltVersion } from '@/lib/filtering/filterCardPrints'
import { aggregateCollectionRows, fetchAllUserCollectionRows } from '@/lib/collections/quantities'
import { supabaseServiceServer } from '@/lib/server/supabaseServer'

export type ServiceSetStats = {
  total: number
  owned: number
  percent: number
  totalNormal: number
  ownedNormal: number
  percentNormal: number
  totalAlt: number
  ownedAlt: number
  percentAlt: number
}

export type ServiceSetRow = {
  id: string
  code: string
  name: string
}

type CardPrintSetRow = {
  id: string
  distribution_set_id: string
  print_code: string | null
  variant_type: string | null
}

type CardPrintRow = {
  id: string
  card_id: string
  print_code: string | null
  variant_type: string | null
  image_path: string | null
  available_languages?: string[] | null
}

type CardRow = {
  id: string
  number: string | null
  rarity: string | null
  type: string | null
  card_translations?: Array<{
    name: string
    locale: string
  }> | null
}

function normalizeSetCode(value: string) {
  return value.trim().toUpperCase().replace(/-/g, '')
}

async function fetchAllCardPrints() {
  const pageSize = 1000
  let from = 0
  const rows: CardPrintSetRow[] = []

  while (true) {
    const to = from + pageSize - 1
    const { data, error } = await supabaseServiceServer
      .from('card_prints')
      .select('id, distribution_set_id, print_code, variant_type')
      .order('id', { ascending: true })
      .range(from, to)

    if (error) {
      throw new Error(`Erreur lecture prints: ${error.message}`)
    }

    const page = (data as CardPrintSetRow[] | null) || []
    rows.push(...page)
    if (page.length < pageSize) break
    from += pageSize
  }

  return rows
}

export async function fetchUserSetStatsService(userId: string) {
  const [{ data: setsData, error: setsError }, printsData, collectionData] = await Promise.all([
    supabaseServiceServer.from('sets').select('id, code, name').order('code'),
    fetchAllCardPrints(),
    fetchAllUserCollectionRows({ supabase: supabaseServiceServer, userId })
  ])

  if (setsError) {
    throw new Error(`Erreur lecture sets: ${setsError.message}`)
  }

  const { totalByPrintId } = aggregateCollectionRows(collectionData)
  const ownedIds = new Set(totalByPrintId.keys())
  const result: Record<string, ServiceSetStats> = {}
  const sets = ((setsData as ServiceSetRow[] | null) || []) as ServiceSetRow[]

  for (const set of sets) {
    const prints = printsData.filter((p) => p.distribution_set_id === set.id)
    const normalPrints = prints.filter(
      (p) =>
        !isAltVersion({
          print_code: p.print_code ?? undefined,
          variant_type: p.variant_type ?? undefined
        })
    )
    const altPrints = prints.filter((p) =>
      isAltVersion({
        print_code: p.print_code ?? undefined,
        variant_type: p.variant_type ?? undefined
      })
    )

    const totalNormal = normalPrints.length
    const totalAlt = altPrints.length
    const total = totalNormal + totalAlt
    const ownedNormal = normalPrints.filter((p) => ownedIds.has(p.id)).length
    const ownedAlt = altPrints.filter((p) => ownedIds.has(p.id)).length
    const owned = ownedNormal + ownedAlt
    const percent = total > 0 ? Math.round((owned / total) * 100) : 0
    const percentNormal = totalNormal > 0 ? Math.round((ownedNormal / totalNormal) * 100) : 0
    const percentAlt = totalAlt > 0 ? Math.round((ownedAlt / totalAlt) * 100) : 0

    result[set.code] = {
      total,
      owned,
      percent,
      totalNormal,
      ownedNormal,
      percentNormal,
      totalAlt,
      ownedAlt,
      percentAlt
    }
  }

  return {
    sets,
    stats: result
  }
}

export async function fetchUserSetItemsService(userId: string, code: string) {
  const normalizedCode = normalizeSetCode(code)
  const { data: setData, error: setError } = await supabaseServiceServer
    .from('sets')
    .select('id, code, name, available_languages')
    .eq('code', normalizedCode)
    .single()

  if (setError || !setData) {
    throw new Error('Set introuvable')
  }

  const { data: printsData, error: printsError } = await supabaseServiceServer
    .from('card_prints')
    .select('id, card_id, print_code, variant_type, image_path, available_languages')
    .eq('distribution_set_id', setData.id)

  if (printsError) {
    throw new Error(`Erreur prints: ${printsError.message}`)
  }

  const prints = (printsData as CardPrintRow[] | null) || []
  if (prints.length === 0) {
    return {
      set: {
        code: setData.code,
        name: setData.name,
        availableLanguages: setData.available_languages || []
      },
      items: []
    }
  }

  const cardIds = [...new Set(prints.map((row) => row.card_id))]
  const printIds = prints.map((row) => row.id)

  const [{ data: cardsData, error: cardsError }, { data: collectionData, error: collectionError }] = await Promise.all([
    supabaseServiceServer
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
      .in('id', cardIds),
    supabaseServiceServer
      .from('collections')
      .select('card_print_id, quantity, language_code')
      .eq('user_id', userId)
      .in('card_print_id', printIds)
  ])

  if (cardsError) {
    throw new Error(`Erreur cards: ${cardsError.message}`)
  }

  if (collectionError) {
    throw new Error(`Erreur collection: ${collectionError.message}`)
  }

  const cardsMap = new Map<string, CardRow>(
    ((cardsData as CardRow[] | null) || []).map((row) => [row.id, row])
  )
  const aggregated = aggregateCollectionRows(collectionData || [])

  const items = prints.map((print) => ({
    ...print,
    card: cardsMap.get(print.card_id),
    quantity: aggregated.totalByPrintId.get(print.id) || 0
  }))

  return {
    set: {
      code: setData.code,
      name: setData.name,
      availableLanguages: setData.available_languages || []
    },
    items
  }
}
