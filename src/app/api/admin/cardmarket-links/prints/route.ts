import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { isAdminEmail, parseAdminEmails } from '@/lib/admin'
import { DEFAULT_LOCALE } from '@/lib/locale'
import { getRequestUser } from '@/lib/server/authUser'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type PrintRow = {
  id: string
  print_code: string
  variant_type: string | null
  image_path: string | null
  card_id: string
}

type CardRow = {
  id: string
  base_code: string
  number: string | null
  rarity: string | null
  card_translations?: Array<{ locale: string; name: string }> | null
}

type LinkRow = {
  card_print_id: string
  cardmarket_product_id: string
}

function normalizeSetCode(value: string | null): string {
  return (value || '').trim().toUpperCase()
}

export async function GET(request: Request) {
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

  const url = new URL(request.url)
  const setCode = normalizeSetCode(url.searchParams.get('setCode'))
  const onlyUnlinked = url.searchParams.get('onlyUnlinked') !== '0'

  if (!setCode) {
    return NextResponse.json({ error: 'setCode requis' }, { status: 400 })
  }

  const { data: setData, error: setError } = await supabase
    .from('sets')
    .select('id, code, name')
    .eq('code', setCode)
    .single()

  if (setError || !setData) {
    return NextResponse.json({ error: 'Set introuvable' }, { status: 404 })
  }

  const { data: printsData, error: printsError } = await supabase
    .from('card_prints')
    .select('id, print_code, variant_type, image_path, card_id')
    .eq('distribution_set_id', setData.id)
    .order('print_code', { ascending: true })

  if (printsError) {
    return NextResponse.json(
      { error: `Erreur lecture prints: ${printsError.message}` },
      { status: 500 }
    )
  }

  const prints = (printsData as PrintRow[] | null) || []
  if (prints.length === 0) {
    return NextResponse.json({ set: setData, rows: [] })
  }

  const cardIds = [...new Set(prints.map((row) => row.card_id))]
  const printIds = prints.map((row) => row.id)

  const [cardsResult, linksResult] = await Promise.all([
    supabase
      .from('cards')
      .select(
        `
        id,
        base_code,
        number,
        rarity,
        card_translations (
          locale,
          name
        )
      `
      )
      .in('id', cardIds),
    supabase
      .from('cardmarket_print_links')
      .select('card_print_id, cardmarket_product_id')
      .in('card_print_id', printIds)
  ])

  if (cardsResult.error) {
    return NextResponse.json(
      { error: `Erreur lecture cards: ${cardsResult.error.message}` },
      { status: 500 }
    )
  }

  if (linksResult.error) {
    return NextResponse.json(
      { error: `Erreur lecture mapping: ${linksResult.error.message}` },
      { status: 500 }
    )
  }

  const cards = (cardsResult.data as CardRow[] | null) || []
  const links = (linksResult.data as LinkRow[] | null) || []
  const cardById = new Map(cards.map((row) => [row.id, row]))
  const linkByPrintId = new Map(links.map((row) => [row.card_print_id, row.cardmarket_product_id]))

  const rows = prints
    .map((print) => {
      const card = cardById.get(print.card_id)
      const name =
        card?.card_translations?.find((t) => t.locale === DEFAULT_LOCALE)?.name ||
        card?.card_translations?.[0]?.name ||
        card?.base_code ||
        print.print_code

      return {
        printId: print.id,
        printCode: print.print_code,
        variantType: print.variant_type || 'normal',
        cardId: print.card_id,
        cardName: name,
        baseCode: card?.base_code || '',
        cardNumber: card?.number || null,
        rarity: card?.rarity || '',
        imagePath: print.image_path,
        linkedProductId: linkByPrintId.get(print.id) || null
      }
    })
    .filter((row) => (onlyUnlinked ? !row.linkedProductId : true))

  return NextResponse.json({
    set: {
      id: setData.id,
      code: setData.code,
      name: setData.name || setData.code
    },
    rows
  })
}
