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
  print_code: string | null
  variant_type: string | null
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

  const { data: printsData, error: printsError } = await supabase
    .from('card_prints')
    .select('id, card_id, print_code, variant_type')
    .eq('distribution_set_id', setData.id)

  if (printsError) {
    return NextResponse.json(
      { error: `Erreur lecture prints: ${printsError.message}` },
      { status: 500 }
    )
  }

  const prints = (printsData as PrintRow[] | null) || []
  if (prints.length === 0) {
    return NextResponse.json({ cards: [] })
  }

  const cardIds = [...new Set(prints.map((print) => print.card_id))]
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
    .in('id', cardIds)

  if (cardsError) {
    return NextResponse.json(
      { error: `Erreur lecture cards: ${cardsError.message}` },
      { status: 500 }
    )
  }

  const cards = (cardsData as CardRow[] | null) || []
  const cardsById = new Map(cards.map((card) => [card.id, card]))
  const printIds = prints.map((print) => print.id)

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

  const ownersByPrint = new Map<string, Set<string>>()
  for (const row of collections) {
    if (!ownersByPrint.has(row.card_print_id)) ownersByPrint.set(row.card_print_id, new Set<string>())
    ownersByPrint.get(row.card_print_id)?.add(row.user_id)
  }

  const payload = prints
    .map((print) => {
      const card = cardsById.get(print.card_id)
      const translation =
        card?.card_translations?.find((t) => t.locale === DEFAULT_LOCALE)?.name ||
        card?.card_translations?.[0]?.name ||
        card?.base_code ||
        print.print_code ||
        'Carte'
      return {
        id: print.id,
        printCode: print.print_code || '',
        baseCode: card?.base_code || print.print_code || '',
        number: card?.number || null,
        name: cleanCardName(translation),
        variantType: print.variant_type || 'normal',
        ownersCount: ownersByPrint.get(print.id)?.size || 0
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
