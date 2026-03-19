import { NextResponse } from 'next/server'
import { supabaseServiceServer } from '@/lib/server/supabaseServer'
import { getAltTypeKey } from '@/lib/filtering/filterCardPrints'

type CardRow = {
  rarity: string | null
  type: string | null
}

type PrintRow = {
  print_code: string | null
  variant_type: string | null
}

const PAGE_SIZE = 1000

type RangeQueryResult<T> = {
  data: T[] | null
  error: { message: string } | null
}

type RangeQuery<T> = {
  range: (from: number, to: number) => Promise<RangeQueryResult<T>>
}

async function fetchAllRows<T>(query: () => RangeQuery<T>) {
  const rows: T[] = []
  let from = 0

  while (true) {
    const to = from + PAGE_SIZE - 1
    const { data, error } = await query().range(from, to)

    if (error) {
      throw new Error(error.message)
    }

    const page = ((data as T[] | null) || []) as T[]
    rows.push(...page)

    if (page.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return rows
}

export async function GET() {
  try {
    const [cardsRows, printsRows] = await Promise.all([
      fetchAllRows<CardRow>(() => supabaseServiceServer.from('cards').select('rarity, type')),
      fetchAllRows<PrintRow>(() =>
        supabaseServiceServer.from('card_prints').select('print_code, variant_type')
      )
    ])

    const rarities = Array.from(
      new Set(cardsRows.map((row) => row.rarity).filter(Boolean))
    ).sort((a, b) => String(a).localeCompare(String(b)))

    const types = Array.from(
      new Set(cardsRows.map((row) => row.type).filter(Boolean))
    ).sort((a, b) => String(a).localeCompare(String(b)))

    const altTypes = Array.from(
      new Set(
        printsRows
          .map((row) => getAltTypeKey(row))
          .filter((value) => value !== 'normal')
      )
    ).sort((a, b) => String(a).localeCompare(String(b)))

    return NextResponse.json({
      rarities,
      types,
      altTypes
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur chargement options'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
