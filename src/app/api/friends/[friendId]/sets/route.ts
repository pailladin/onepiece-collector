import { NextResponse } from 'next/server'
import { isAltVersion } from '@/lib/filtering/filterCardPrints'
import { aggregateCollectionRows, fetchAllUserCollectionRows } from '@/lib/collections/quantities'
import { getRequestUser } from '@/lib/server/authUser'
import { supabaseServiceServer } from '@/lib/server/supabaseServer'

type SetStats = {
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

type SetRow = {
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
export async function GET(
  request: Request,
  context: { params: Promise<{ friendId: string }> }
) {
  const userResult = await getRequestUser(request)
  if (!userResult.user) {
    return NextResponse.json({ error: userResult.error || 'Unauthorized' }, { status: 401 })
  }

  const friendId = String((await context.params).friendId || '').trim()
  if (!friendId) {
    return NextResponse.json({ error: 'Ami introuvable' }, { status: 400 })
  }

  if (friendId !== userResult.user.id) {
    const { data: friendLink, error: friendError } = await supabaseServiceServer
      .from('friends')
      .select('user_id')
      .or(
        `and(user_id.eq.${userResult.user.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${userResult.user.id})`
      )
      .limit(1)
      .maybeSingle()

    if (friendError) {
      return NextResponse.json({ error: `Erreur verification ami: ${friendError.message}` }, { status: 500 })
    }

    if (!friendLink) {
      return NextResponse.json({ error: 'Acces refuse' }, { status: 403 })
    }
  }

  const [{ data: profileData, error: profileError }, { data: setsData, error: setsError }] = await Promise.all([
    supabaseServiceServer
      .from('profiles')
      .select('username')
      .eq('id', friendId)
      .maybeSingle(),
    supabaseServiceServer
      .from('sets')
      .select('id, code, name')
      .order('code')
  ])

  if (profileError) {
    return NextResponse.json({ error: `Erreur lecture profil: ${profileError.message}` }, { status: 500 })
  }

  if (setsError) {
    return NextResponse.json({ error: `Erreur lecture sets: ${setsError.message}` }, { status: 500 })
  }

  try {
    const [printsData, collectionData] = await Promise.all([
      fetchAllCardPrints(),
      fetchAllUserCollectionRows({ supabase: supabaseServiceServer, userId: friendId })
    ])

    const { totalByPrintId } = aggregateCollectionRows(collectionData)
    const ownedIds = new Set(totalByPrintId.keys())
    const result: Record<string, SetStats> = {}
    const sets = ((setsData as SetRow[] | null) || []) as SetRow[]

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

    return NextResponse.json({
      username: profileData?.username || 'Ami',
      sets,
      stats: result
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur chargement collection ami' },
      { status: 500 }
    )
  }
}
