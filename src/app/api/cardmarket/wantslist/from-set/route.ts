import { NextResponse } from 'next/server'
import { getRequestUserId } from '@/lib/server/authUser'
import { supabaseServiceServer } from '@/lib/server/supabaseServer'
import { cardmarketGet, cardmarketPut } from '@/lib/server/cardmarket'
import { DEFAULT_LOCALE } from '@/lib/locale'
import { getPrintBaseCode } from '@/lib/cards/printDisplay'

export const runtime = 'nodejs'

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
  print_code: string | null
  variant_type: string | null
}

type CollectionRow = {
  card_print_id: string
  quantity: number
}

type ProductLike = {
  idProduct?: number
  idMetaproduct?: number
  enName?: string
  name?: string
  number?: string
  expansionName?: string
}

function firstArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  return []
}

function extractProducts(payload: unknown): ProductLike[] {
  if (!payload || typeof payload !== 'object') return []
  const root = payload as Record<string, unknown>

  const direct = firstArray<ProductLike>(root.product)
  if (direct.length > 0) return direct

  const wrapped = root.products as Record<string, unknown> | undefined
  if (wrapped) {
    const inner = firstArray<ProductLike>(wrapped.product)
    if (inner.length > 0) return inner
  }

  return []
}

function normalize(str: string): string {
  return str.trim().toLowerCase()
}

function pickBestProductId(
  products: ProductLike[],
  printBaseCode: string,
  cardName: string
): number | null {
  if (products.length === 0) return null
  const code = normalize(printBaseCode)
  const name = normalize(cardName)

  const exactCode = products.find((p) => {
    const hay = normalize(`${p.enName || p.name || ''}`)
    return hay.includes(code)
  })
  if (exactCode?.idProduct) return exactCode.idProduct

  const byName = products.find((p) => {
    const hay = normalize(`${p.enName || p.name || ''}`)
    return name && hay.includes(name)
  })
  if (byName?.idProduct) return byName.idProduct

  return products[0]?.idProduct || null
}

async function resolveOnePieceGameId(token: string, tokenSecret: string) {
  const data = await cardmarketGet({
    path: '/games',
    token,
    tokenSecret
  })

  const root = data as Record<string, unknown>
  const games =
    firstArray<Record<string, unknown>>(root.game).length > 0
      ? firstArray<Record<string, unknown>>(root.game)
      : firstArray<Record<string, unknown>>((root.games as Record<string, unknown>)?.game)

  const onePiece = games.find((g) => {
    const name = String(g.name || g.enName || '').toLowerCase()
    return name.includes('one piece')
  })

  const id = Number(onePiece?.idGame)
  if (!Number.isFinite(id)) {
    throw new Error('Unable to resolve One Piece game id on Cardmarket')
  }
  return id
}

export async function POST(request: Request) {
  try {
    const { userId, error } = await getRequestUserId(request)
    if (!userId) {
      return NextResponse.json({ error }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const setCode = String(body?.setCode || '').trim().toUpperCase()
    const wantslistName = String(body?.wantslistName || '').trim()

    if (!setCode || !wantslistName) {
      return NextResponse.json(
        { error: 'setCode and wantslistName are required' },
        { status: 400 }
      )
    }

    const { data: cmAccount, error: cmAccountError } = await supabaseServiceServer
      .from('cardmarket_accounts')
      .select('oauth_token, oauth_token_secret')
      .eq('user_id', userId)
      .maybeSingle()

    if (cmAccountError) {
      return NextResponse.json({ error: cmAccountError.message }, { status: 500 })
    }
    if (!cmAccount) {
      return NextResponse.json(
        { error: 'Cardmarket account not connected' },
        { status: 400 }
      )
    }

    const { data: setData, error: setError } = await supabaseServiceServer
      .from('sets')
      .select('id')
      .eq('code', setCode)
      .maybeSingle()

    if (setError || !setData) {
      return NextResponse.json({ error: 'Set introuvable' }, { status: 404 })
    }

    const { data: printsData, error: printsError } = await supabaseServiceServer
      .from('card_prints')
      .select('id, card_id, print_code, variant_type')
      .eq('distribution_set_id', setData.id)

    if (printsError) {
      return NextResponse.json({ error: printsError.message }, { status: 500 })
    }

    const prints = (printsData as CardPrintRow[] | null) || []
    if (prints.length === 0) {
      return NextResponse.json({ created: 0, unresolved: [] })
    }

    const { data: collectionData } = await supabaseServiceServer
      .from('collections')
      .select('card_print_id, quantity')
      .eq('user_id', userId)
      .in(
        'card_print_id',
        prints.map((p) => p.id)
      )

    const owned = new Map<string, number>(
      ((collectionData as CollectionRow[] | null) || []).map((c) => [
        c.card_print_id,
        c.quantity || 0
      ])
    )

    const missingPrints = prints.filter((p) => (owned.get(p.id) || 0) === 0)
    if (missingPrints.length === 0) {
      return NextResponse.json({ created: 0, unresolved: [] })
    }

    const cardIds = [...new Set(missingPrints.map((p) => p.card_id))]
    const { data: cardsData } = await supabaseServiceServer
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
      .in('id', cardIds)

    const cardsById = new Map<string, CardRow>(
      ((cardsData as CardRow[] | null) || []).map((c) => [c.id, c])
    )

    const token = cmAccount.oauth_token
    const tokenSecret = cmAccount.oauth_token_secret
    const idGame = Number(process.env.CARDMARKET_ONEPIECE_GAME_ID) ||
      (await resolveOnePieceGameId(token, tokenSecret))

    const unresolved: string[] = []
    let created = 0

    for (const print of missingPrints) {
      const baseCode = getPrintBaseCode(print.print_code)
      const card = cardsById.get(print.card_id)
      const cardName =
        card?.card_translations?.find((t) => t.locale === DEFAULT_LOCALE)?.name ||
        card?.card_translations?.[0]?.name ||
        ''

      const searchPayload = await cardmarketGet({
        path: '/products/find',
        token,
        tokenSecret,
        query: {
          search: baseCode || cardName,
          idGame,
          exact: false
        }
      })

      const products = extractProducts(searchPayload)
      const idProduct = pickBestProductId(products, baseCode, cardName)

      if (!idProduct) {
        unresolved.push(baseCode || cardName || print.id)
        continue
      }

      await cardmarketPut({
        path: `/wantslist/${encodeURIComponent(wantslistName)}/${idProduct}`,
        token,
        tokenSecret
      })

      created += 1
    }

    return NextResponse.json({
      created,
      unresolved
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
