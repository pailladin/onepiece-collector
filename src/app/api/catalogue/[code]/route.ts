import { NextResponse } from 'next/server'
import { supabaseServiceServer } from '@/lib/server/supabaseServer'

type PrintRow = {
  id: string
  print_code: string | null
  variant_type: string | null
  image_path: string | null
  card_id: string
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

const CARD_IDS_CHUNK_SIZE = 100

function normalizeCode(value: string | null | undefined) {
  return (value || '').replace(/-/g, '').trim().toUpperCase()
}

function chunkArray<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size))
  }
  return chunks
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> }
) {
  const code = normalizeCode((await context.params).code)

  const { data: setData, error: setError } = await supabaseServiceServer
    .from('sets')
    .select('id, code, name')
    .eq('code', code)
    .maybeSingle()

  if (setError) {
    return NextResponse.json(
      { error: `Erreur lecture set: ${setError.message}` },
      { status: 500 }
    )
  }

  if (!setData) {
    return NextResponse.json({ error: 'Set introuvable' }, { status: 404 })
  }

  const { data: printsData, error: printsError } = await supabaseServiceServer
    .from('card_prints')
    .select('id, print_code, variant_type, image_path, card_id')
    .eq('distribution_set_id', setData.id)

  if (printsError) {
    return NextResponse.json(
      { error: `Erreur lecture prints: ${printsError.message}` },
      { status: 500 }
    )
  }

  const prints = (printsData as PrintRow[] | null) || []
  const cardIds = [...new Set(prints.map((row) => row.card_id))]

  if (cardIds.length === 0) {
    return NextResponse.json({
      set: {
        id: setData.id,
        code: setData.code,
        name: setData.name
      },
      items: []
    })
  }

  const cardsRows: CardRow[] = []
  for (const chunk of chunkArray(cardIds, CARD_IDS_CHUNK_SIZE)) {
    const { data: cardsData, error: cardsError } = await supabaseServiceServer
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
      .in('id', chunk)

    if (cardsError) {
      return NextResponse.json(
        { error: `Erreur lecture cards: ${cardsError.message}` },
        { status: 500 }
      )
    }

    cardsRows.push(...(((cardsData as CardRow[] | null) || []) as CardRow[]))
  }

  const cardsById = new Map<string, CardRow>(cardsRows.map((row) => [row.id, row]))

  const items = prints.map((print) => ({
    ...print,
    card: cardsById.get(print.card_id) || null
  }))

  return NextResponse.json({
    set: {
      id: setData.id,
      code: setData.code,
      name: setData.name
    },
    items
  })
}
