import { NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/server/authUser'
import { supabaseServiceServer } from '@/lib/server/supabaseServer'
import { aggregateCollectionRows, type CollectionQuantityRow } from '@/lib/collections/quantities'

function normalizeSetCode(value: string) {
  return value.trim().toUpperCase().replace(/-/g, '')
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

type SetRow = {
  id: string
  code: string
  name: string | null
  available_languages?: string[] | null
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
  context: { params: Promise<{ friendId: string; code: string }> }
) {
  const userResult = await getRequestUser(request)
  if (!userResult.user) {
    return NextResponse.json({ error: userResult.error || 'Unauthorized' }, { status: 401 })
  }

  const { friendId, code } = await context.params
  const normalizedFriendId = String(friendId || '').trim()
  const rawCode = String(code || '').trim()
  const normalizedCode = normalizeSetCode(String(code || ''))

  if (!normalizedFriendId || !rawCode || !normalizedCode) {
    return NextResponse.json({ error: 'Set introuvable' }, { status: 400 })
  }

  const accessError = await assertFriendAccess(userResult.user.id, normalizedFriendId)
  if (accessError) return accessError

  const { data: setsData, error: setError } = await supabaseServiceServer
    .from('sets')
    .select('id, code, name, available_languages')

  if (setError) {
    return NextResponse.json({ error: 'Set introuvable' }, { status: 404 })
  }

  const availableSets = ((setsData as SetRow[] | null) || []) as SetRow[]
  const setData =
    availableSets.find((row) => String(row.code || '').trim().toUpperCase() === rawCode.toUpperCase()) ||
    availableSets.find((row) => normalizeSetCode(String(row.code || '')) === normalizedCode) ||
    null

  if (!setData) {
    return NextResponse.json({ error: 'Set introuvable' }, { status: 404 })
  }

  const { data: printsData, error: printsError } = await supabaseServiceServer
    .from('card_prints')
    .select('id, card_id, print_code, variant_type, image_path, available_languages')
    .eq('distribution_set_id', setData.id)

  if (printsError) {
    return NextResponse.json({ error: `Erreur prints: ${printsError.message}` }, { status: 500 })
  }

  const prints = (printsData as CardPrintRow[] | null) || []
  if (prints.length === 0) {
    return NextResponse.json({
      set: {
        code: setData.code,
        name: setData.name,
        availableLanguages: setData.available_languages || []
      },
      items: []
    })
  }

  const cardIds = [...new Set(prints.map((row) => row.card_id))]
  const printIds = prints.map((row) => row.id)

  const [{ data: cardsData, error: cardsError }, { data: collectionData, error: collectionError }] =
    await Promise.all([
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
        .eq('user_id', normalizedFriendId)
        .in('card_print_id', printIds)
    ])

  if (cardsError) {
    return NextResponse.json({ error: `Erreur cards: ${cardsError.message}` }, { status: 500 })
  }

  if (collectionError) {
    return NextResponse.json(
      { error: `Erreur collection ami: ${collectionError.message}` },
      { status: 500 }
    )
  }

  const cardsMap = new Map<string, CardRow>(
    ((cardsData as CardRow[] | null) || []).map((row) => [row.id, row])
  )
  const aggregated = aggregateCollectionRows((collectionData as CollectionQuantityRow[] | null) || [])

  const items = prints.map((print) => ({
    ...print,
    card: cardsMap.get(print.card_id),
    quantity: aggregated.totalByPrintId.get(print.id) || 0
  }))

  return NextResponse.json({
    set: {
      code: setData.code,
      name: setData.name,
      availableLanguages: setData.available_languages || []
    },
    items
  })
}
