import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getRequestUser } from '@/lib/server/authUser'
import { isAdminEmail, parseAdminEmails } from '@/lib/admin'
import { DEFAULT_LOCALE } from '@/lib/locale'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function normalizeCode(value: string) {
  return value.trim().toUpperCase()
}

function parseCardNumber(value: string | null | undefined) {
  const raw = (value || '').trim()
  if (!raw) return Number.POSITIVE_INFINITY
  const parsed = Number.parseInt(raw, 10)
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed
}

function getCodePriority(baseCode: string, setCode: string) {
  return baseCode.startsWith(`${setCode}-`) ? 0 : 1
}

function cleanCardName(value: string) {
  return value.replace(/\s*\((?:\d+|reprint)\)\s*$/gi, '').trim()
}

type CardRow = {
  id: string
  base_code: string
  number: string | null
  card_translations?: Array<{
    name: string
    locale: string
  }> | null
}

type PrintRow = {
  id: string
  card_id: string
}

type CollectionRow = {
  user_id: string
  card_print_id: string
}

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> }
) {
  const userResult = await getRequestUser(request)
  if (!userResult.user) {
    return NextResponse.json(
      { error: userResult.error || 'Unauthorized' },
      { status: 401 }
    )
  }

  const adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS)
  if (!isAdminEmail(userResult.user.email, adminEmails)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const setCode = normalizeCode((await context.params).code)
  const { data: setData, error: setError } = await supabase
    .from('sets')
    .select('id')
    .eq('code', setCode)
    .single()

  if (setError || !setData) {
    return NextResponse.json({ error: 'Set introuvable' }, { status: 404 })
  }

  const { data: cardsData, error: cardsError } = await supabase
    .from('cards')
    .select(
      `
      id,
      base_code,
      number,
      card_translations (
        name,
        locale
      )
    `
    )
    .eq('base_set_id', setData.id)

  if (cardsError) {
    return NextResponse.json(
      { error: `Erreur lecture cards: ${cardsError.message}` },
      { status: 500 }
    )
  }

  const cards = (cardsData as CardRow[] | null) || []
  if (cards.length === 0) {
    return NextResponse.json({ cards: [] })
  }

  const cardIds = cards.map((card) => card.id)
  const { data: printsData, error: printsError } = await supabase
    .from('card_prints')
    .select('id, card_id')
    .eq('distribution_set_id', setData.id)
    .in('card_id', cardIds)

  if (printsError) {
    return NextResponse.json(
      { error: `Erreur lecture prints: ${printsError.message}` },
      { status: 500 }
    )
  }

  const prints = (printsData as PrintRow[] | null) || []
  const printIds = prints.map((print) => print.id)
  const printToCard = new Map<string, string>(
    prints.map((print) => [print.id, print.card_id])
  )

  let collections: CollectionRow[] = []
  if (printIds.length > 0) {
    const { data: collectionsData, error: collectionsError } = await supabase
      .from('collections')
      .select('user_id, card_print_id')
      .gt('quantity', 0)
      .in('card_print_id', printIds)

    if (collectionsError) {
      return NextResponse.json(
        { error: `Erreur lecture collections: ${collectionsError.message}` },
        { status: 500 }
      )
    }

    collections = (collectionsData as CollectionRow[] | null) || []
  }

  const ownersByCard = new Map<string, Set<string>>()
  for (const row of collections) {
    const cardId = printToCard.get(row.card_print_id)
    if (!cardId) continue
    if (!ownersByCard.has(cardId)) ownersByCard.set(cardId, new Set<string>())
    ownersByCard.get(cardId)?.add(row.user_id)
  }

  const printCountByCard = new Map<string, number>()
  for (const print of prints) {
    printCountByCard.set(print.card_id, (printCountByCard.get(print.card_id) || 0) + 1)
  }

  const payload = cards
    .map((card) => {
      const translation =
        card.card_translations?.find((t) => t.locale === DEFAULT_LOCALE)?.name ||
        card.card_translations?.[0]?.name ||
        card.base_code
      return {
        id: card.id,
        baseCode: card.base_code,
        number: card.number,
        name: cleanCardName(translation),
        ownersCount: ownersByCard.get(card.id)?.size || 0,
        printsCount: printCountByCard.get(card.id) || 0
      }
    })
    .sort((a, b) => {
      const priorityA = getCodePriority(a.baseCode, setCode)
      const priorityB = getCodePriority(b.baseCode, setCode)
      if (priorityA !== priorityB) {
        return priorityA - priorityB
      }

      const numberA = parseCardNumber(a.number)
      const numberB = parseCardNumber(b.number)

      if (numberA !== numberB) {
        return numberA - numberB
      }

      return a.baseCode.localeCompare(b.baseCode, 'fr', { numeric: true })
    })

  return NextResponse.json({ cards: payload })
}
