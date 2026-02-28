import { NextResponse } from 'next/server'
import { supabaseServiceServer } from '@/lib/server/supabaseServer'
import { verifyShareSetToken } from '@/lib/server/shareToken'

function normalizeSetCode(value: string) {
  return value.trim().toUpperCase().replace(/-/g, '')
}

type CardPrintRow = {
  id: string
  card_id: string
  print_code: string | null
  variant_type: string | null
  image_path: string | null
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

type CollectionRow = {
  card_print_id: string
  quantity: number
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string; code: string }> }
) {
  try {
    const { token, code } = await context.params
    const normalizedCode = normalizeSetCode(code)
    const payload = verifyShareSetToken(token)

    if (payload.setCode !== normalizedCode) {
      return NextResponse.json({ error: 'Token does not match set' }, { status: 403 })
    }

    const { data: setData, error: setError } = await supabaseServiceServer
      .from('sets')
      .select('id, code, name')
      .eq('code', normalizedCode)
      .single()

    if (setError || !setData) {
      return NextResponse.json({ error: 'Set introuvable' }, { status: 404 })
    }

    const { data: printsData, error: printsError } = await supabaseServiceServer
      .from('card_prints')
      .select('id, card_id, print_code, variant_type, image_path')
      .eq('distribution_set_id', setData.id)

    if (printsError) {
      return NextResponse.json(
        { error: `Erreur prints: ${printsError.message}` },
        { status: 500 }
      )
    }

    const prints = (printsData as CardPrintRow[] | null) || []
    if (prints.length === 0) {
      return NextResponse.json({
        set: {
          code: setData.code,
          name: setData.name
        },
        items: []
      })
    }

    const cardIds = [...new Set(prints.map((p) => p.card_id))]
    const printIds = prints.map((p) => p.id)

    const [{ data: cardsData }, { data: collectionData }] = await Promise.all([
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
        .select('card_print_id, quantity')
        .eq('user_id', payload.userId)
        .in('card_print_id', printIds)
    ])

    const cardsMap = new Map<string, CardRow>(
      ((cardsData as CardRow[] | null) || []).map((c) => [c.id, c])
    )
    const quantities = new Map<string, number>(
      ((collectionData as CollectionRow[] | null) || []).map((row) => [
        row.card_print_id,
        row.quantity
      ])
    )

    const items = prints.map((print) => ({
      ...print,
      card: cardsMap.get(print.card_id),
      quantity: quantities.get(print.id) || 0
    }))

    return NextResponse.json({
      set: {
        code: setData.code,
        name: setData.name
      },
      items
    })
  } catch {
    return NextResponse.json({ error: 'Invalid or expired share link' }, { status: 401 })
  }
}
