import { NextResponse } from 'next/server'
import { DEFAULT_LOCALE } from '@/lib/locale'
import { getDisplayPrintCode } from '@/lib/cards/printDisplay'
import { parseCardCode } from '@/lib/sorting/parseCardCode'
import {
  getCollectionLanguageFlag,
  getCollectionLanguageLabel,
  normalizeCollectionLanguage
} from '@/lib/collections/languages'
import { aggregateCollectionRows, fetchAllUserCollectionRows } from '@/lib/collections/quantities'
import { getRequestUser } from '@/lib/server/authUser'
import { supabaseServiceServer } from '@/lib/server/supabaseServer'

type SetRow = {
  id: string
  code: string
}

type CardTranslationRow = {
  locale: string
  name: string
}

type CardRow = {
  id: string
  rarity: string | null
  type: string | null
  card_translations?: CardTranslationRow[] | null
}

type CardPrintRow = {
  id: string
  card_id: string
  distribution_set_id: string
  print_code: string | null
  variant_type: string | null
}

type TradeItem = {
  id: string
  itemKey: string
  setCode: string
  displayCode: string
  name: string
  rarity: string
  type: string
  languageCode: string
  languageLabel: string
  languageFlag: string
  giverQty: number
  needQty: number
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return []
  const result: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size))
  }
  return result
}

function sortTradeItems(items: TradeItem[]) {
  return [...items].sort((a, b) => {
    if (a.setCode !== b.setCode) return a.setCode.localeCompare(b.setCode)

    const pa = parseCardCode(a.displayCode)
    const pb = parseCardCode(b.displayCode)
    if (pa.number !== pb.number) return pa.number - pb.number
    if (pa.variant !== pb.variant) return pa.variant - pb.variant
    return a.displayCode.localeCompare(b.displayCode)
  })
}

async function assertFriendAccess(viewerUserId: string, friendId: string) {
  if (viewerUserId === friendId) return null

  const { data: friendLink, error: friendError } = await supabaseServiceServer
    .from('friends')
    .select('user_id')
    .or(
      `and(user_id.eq.${viewerUserId},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${viewerUserId})`
    )
    .limit(1)
    .maybeSingle()

  if (friendError) {
    return NextResponse.json(
      { error: `Erreur verification ami: ${friendError.message}` },
      { status: 500 }
    )
  }

  if (!friendLink) {
    return NextResponse.json({ error: 'Acces refuse' }, { status: 403 })
  }

  return null
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

  const accessError = await assertFriendAccess(userResult.user.id, friendId)
  if (accessError) return accessError

  const { data: profileData, error: profileError } = await supabaseServiceServer
    .from('profiles')
    .select('username')
    .eq('id', friendId)
    .maybeSingle()

  if (profileError) {
    return NextResponse.json({ error: `Erreur profil ami: ${profileError.message}` }, { status: 500 })
  }

  const [{ data: setsData, error: setsError }, myCollectionResult, friendCollectionResult] =
    await Promise.all([
      supabaseServiceServer.from('sets').select('id, code'),
      fetchAllUserCollectionRows({ supabase: supabaseServiceServer, userId: userResult.user.id })
        .then((data) => ({ data, error: null as string | null }))
        .catch((error) => ({
          data: null,
          error: error instanceof Error ? error.message : 'Erreur ma collection'
        })),
      fetchAllUserCollectionRows({ supabase: supabaseServiceServer, userId: friendId })
        .then((data) => ({ data, error: null as string | null }))
        .catch((error) => ({
          data: null,
          error: error instanceof Error ? error.message : 'Erreur collection ami'
        }))
    ])

  if (setsError) {
    return NextResponse.json({ error: `Erreur sets: ${setsError.message}` }, { status: 500 })
  }
  if (myCollectionResult.error) {
    return NextResponse.json({ error: `Erreur ma collection: ${myCollectionResult.error}` }, { status: 500 })
  }
  if (friendCollectionResult.error) {
    return NextResponse.json(
      { error: `Erreur collection ami: ${friendCollectionResult.error}` },
      { status: 500 }
    )
  }

  const myAggregate = aggregateCollectionRows(myCollectionResult.data || [])
  const friendAggregate = aggregateCollectionRows(friendCollectionResult.data || [])
  const mineByPrint = myAggregate.totalByPrintId
  const friendByPrint = friendAggregate.totalByPrintId

  const relevantPrintIds = [
    ...new Set(
      [...mineByPrint.entries(), ...friendByPrint.entries()]
        .filter(([, qty]) => qty > 0)
        .map(([printId]) => printId)
    )
  ]

  const prints: CardPrintRow[] = []
  for (const idsChunk of chunkArray(relevantPrintIds, 100)) {
    const { data: printsData, error: printsError } = await supabaseServiceServer
      .from('card_prints')
      .select('id, card_id, distribution_set_id, print_code, variant_type')
      .in('id', idsChunk)

    if (printsError) {
      return NextResponse.json({ error: `Erreur prints: ${printsError.message}` }, { status: 500 })
    }

    prints.push(...(((printsData as CardPrintRow[] | null) || []) as CardPrintRow[]))
  }

  const cardIds = [...new Set(prints.map((row) => row.card_id))]
  const cardsById = new Map<string, CardRow>()
  for (const idsChunk of chunkArray(cardIds, 100)) {
    const { data: cardsData, error: cardsError } = await supabaseServiceServer
      .from('cards')
      .select(
        `
          id,
          rarity,
          type,
          card_translations (
            locale,
            name
          )
        `
      )
      .in('id', idsChunk)

    if (cardsError) {
      return NextResponse.json({ error: `Erreur cards: ${cardsError.message}` }, { status: 500 })
    }

    ;(((cardsData as CardRow[] | null) || []) as CardRow[]).forEach((row) => {
      cardsById.set(row.id, row)
    })
  }

  const setById = new Map<string, string>(((setsData as SetRow[] | null) || []).map((row) => [row.id, row.code]))
  const friendCanGive: TradeItem[] = []
  const iCanGive: TradeItem[] = []

  for (const print of prints) {
    const friendQty = friendByPrint.get(print.id) || 0
    const myQty = mineByPrint.get(print.id) || 0

    if (friendQty <= 0 && myQty <= 0) continue

    const card = cardsById.get(print.card_id)
    const setCode = setById.get(print.distribution_set_id) || '?'
    const fallbackName = getDisplayPrintCode(print) || (print.print_code || 'Carte')
    const name =
      card?.card_translations?.find((t) => t.locale === DEFAULT_LOCALE)?.name ||
      card?.card_translations?.[0]?.name ||
      fallbackName

    const myLanguages = myAggregate.byPrintIdLanguage.get(print.id) || new Map<string, number>()
    const friendLanguages = friendAggregate.byPrintIdLanguage.get(print.id) || new Map<string, number>()

    const relevantLanguages = new Set<string>([...myLanguages.keys(), ...friendLanguages.keys()])

    for (const rawLanguageCode of relevantLanguages) {
      const languageCode = normalizeCollectionLanguage(rawLanguageCode)
      const friendLanguageQty = friendLanguages.get(languageCode) || 0
      const myLanguageQty = myLanguages.get(languageCode) || 0
      const friendExtra = Math.max(friendLanguageQty - 1, 0)
      const myExtra = Math.max(myLanguageQty - 1, 0)
      const iNeed = myLanguageQty === 0 ? 1 : 0
      const friendNeeds = friendLanguageQty === 0 ? 1 : 0

      if (friendExtra === 0 && myExtra === 0) continue

      const baseItem: Omit<TradeItem, 'giverQty' | 'needQty'> = {
        id: print.id,
        itemKey: `${print.id}:${languageCode}`,
        setCode,
        displayCode: getDisplayPrintCode(print),
        name,
        rarity: card?.rarity || '-',
        type: card?.type || '-',
        languageCode,
        languageLabel: getCollectionLanguageLabel(languageCode),
        languageFlag: getCollectionLanguageFlag(languageCode)
      }

      if (friendExtra > 0 && iNeed > 0) {
        friendCanGive.push({
          ...baseItem,
          giverQty: friendExtra,
          needQty: iNeed
        })
      }

      if (myExtra > 0 && friendNeeds > 0) {
        iCanGive.push({
          ...baseItem,
          giverQty: myExtra,
          needQty: friendNeeds
        })
      }
    }
  }

  return NextResponse.json({
    username: profileData?.username || 'Ami',
    friendCanGive: sortTradeItems(friendCanGive),
    iCanGive: sortTradeItems(iCanGive)
  })
}
