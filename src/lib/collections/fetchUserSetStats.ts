import { supabase } from '@/lib/supabaseClient'

export type SetStats = {
  total: number
  owned: number
  percent: number
}

export type SetRow = {
  id: string
  code: string
}

type CardPrintSetRow = {
  id: string
  distribution_set_id: string
}

type CollectionRow = {
  card_print_id: string
}

export async function fetchUserSetStats(userId: string) {
  const { data: setsData } = await supabase
    .from('sets')
    .select('*')
    .order('code')

  const { data: printsData } = await supabase
    .from('card_prints')
    .select('id, distribution_set_id')

  const { data: collectionData } = await supabase
    .from('collections')
    .select('card_print_id')
    .eq('user_id', userId)

  const ownedIds = new Set((collectionData as CollectionRow[] | null)?.map((c) => c.card_print_id))
  const result: Record<string, SetStats> = {}

  ;(setsData as SetRow[] | null)?.forEach((set) => {
    const prints =
      ((printsData as CardPrintSetRow[] | null)?.filter(
        (p) => p.distribution_set_id === set.id
      ) || [])

    const total = prints.length
    const owned = prints.filter((p) => ownedIds.has(p.id)).length
    const percent = total > 0 ? Math.round((owned / total) * 100) : 0

    result[set.code] = {
      total,
      owned,
      percent,
    }
  })

  return {
    sets: (setsData as SetRow[] | null) || [],
    stats: result,
  }
}
