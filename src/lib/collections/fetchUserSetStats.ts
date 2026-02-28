import { supabase } from '@/lib/supabaseClient'
import { isAltVersion } from '@/lib/filtering/filterCardPrints'

export type SetStats = {
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

export type SetRow = {
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

type CollectionRow = {
  card_print_id: string
}

async function fetchAllCardPrints() {
  const pageSize = 1000
  let from = 0
  const rows: CardPrintSetRow[] = []

  while (true) {
    const to = from + pageSize - 1
    const { data, error } = await supabase
      .from('card_prints')
      .select('id, distribution_set_id, print_code, variant_type')
      .range(from, to)

    if (error || !data) break
    rows.push(...(data as CardPrintSetRow[]))
    if (data.length < pageSize) break
    from += pageSize
  }

  return rows
}

async function fetchAllUserCollections(userId: string) {
  const pageSize = 1000
  let from = 0
  const rows: CollectionRow[] = []

  while (true) {
    const to = from + pageSize - 1
    const { data, error } = await supabase
      .from('collections')
      .select('card_print_id')
      .eq('user_id', userId)
      .range(from, to)

    if (error || !data) break
    rows.push(...(data as CollectionRow[]))
    if (data.length < pageSize) break
    from += pageSize
  }

  return rows
}

export async function fetchUserSetStats(userId: string) {
  const { data: setsData } = await supabase
    .from('sets')
    .select('*')
    .order('code')

  const [printsData, collectionData] = await Promise.all([
    fetchAllCardPrints(),
    fetchAllUserCollections(userId)
  ])

  const ownedIds = new Set(
    (collectionData as CollectionRow[] | null)?.map((c) => c.card_print_id)
  )
  const result: Record<string, SetStats> = {}

  ;(setsData as SetRow[] | null)?.forEach((set) => {
    const prints =
      ((printsData as CardPrintSetRow[] | null)?.filter(
        (p) => p.distribution_set_id === set.id
      ) || [])

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
    const percentNormal =
      totalNormal > 0 ? Math.round((ownedNormal / totalNormal) * 100) : 0
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
  })

  return {
    sets: (setsData as SetRow[] | null) || [],
    stats: result,
  }
}
