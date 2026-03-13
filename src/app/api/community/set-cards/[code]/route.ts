import { NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/server/authUser'
import { DEFAULT_LOCALE } from '@/lib/locale'
import { supabaseServiceServer } from '@/lib/server/supabaseServer'

export const runtime = 'nodejs'

type PrintRow = {
  id: string
  print_code: string | null
  variant_type: string | null
  image_path: string | null
  card_id: string
  available_languages?: string[] | null
}

type CardRow = {
  id: string
  base_code: string
  number: string | null
  rarity: string | null
  type: string | null
  card_translations?: Array<{
    name: string
    locale: string
  }> | null
}

function normalizeCode(value: string | null | undefined) {
  return (value || '').trim().toUpperCase()
}

function chunkArray<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size))
  }
  return chunks
}

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> }
) {
  const userResult = await getRequestUser(request)
  if (!userResult.user) {
    return NextResponse.json({ error: userResult.error || 'Unauthorized' }, { status: 401 })
  }

  const setCode = normalizeCode((await context.params).code)
  if (!setCode) {
    return NextResponse.json({ error: 'Set requis' }, { status: 400 })
  }

  const { data: setData, error: setError } = await supabaseServiceServer
    .from('sets')
    .select('id, code, name')
    .eq('code', setCode)
    .maybeSingle()

  if (setError) {
    return NextResponse.json({ error: setError.message }, { status: 500 })
  }

  if (!setData) {
    return NextResponse.json({ error: 'Set introuvable' }, { status: 404 })
  }

  const { data: printsData, error: printsError } = await supabaseServiceServer
    .from('card_prints')
    .select('id, print_code, variant_type, image_path, card_id, available_languages')
    .eq('distribution_set_id', setData.id)
    .order('print_code', { ascending: true })

  if (printsError) {
    return NextResponse.json({ error: printsError.message }, { status: 500 })
  }

  const prints = (printsData as PrintRow[] | null) || []
  const cardIds = [...new Set(prints.map((row) => row.card_id))]
  const cards: CardRow[] = []

  for (const chunk of chunkArray(cardIds, 100)) {
    const { data: cardsData, error: cardsError } = await supabaseServiceServer
      .from('cards')
      .select(
        `
          id,
          base_code,
          number,
          rarity,
          type,
          card_translations (
            name,
            locale
          )
        `
      )
      .in('id', chunk)

    if (cardsError) {
      return NextResponse.json({ error: cardsError.message }, { status: 500 })
    }

    cards.push(...(((cardsData as CardRow[] | null) || []) as CardRow[]))
  }

  const cardsById = new Map(cards.map((row) => [row.id, row]))

  const items = prints.map((print) => {
    const card = cardsById.get(print.card_id)
    const name =
      card?.card_translations?.find((entry) => entry.locale === DEFAULT_LOCALE)?.name ||
      card?.card_translations?.[0]?.name ||
      card?.base_code ||
      print.print_code ||
      'Carte'

    return {
      id: print.id,
      label: `${card?.base_code || print.print_code || '?'} - ${name}${
        print.variant_type && print.variant_type !== 'normal' ? ` (${print.variant_type})` : ''
      }`,
      baseCode: card?.base_code || '',
      printCode: print.print_code || '',
      name,
      rarity: card?.rarity || '',
      type: card?.type || '',
      variantType: print.variant_type || 'normal',
      availableLanguages: print.available_languages || []
    }
  })

  return NextResponse.json({
    set: {
      code: setData.code,
      name: setData.name || setData.code
    },
    items
  })
}
