import { NextResponse } from 'next/server'
import { supabaseServiceServer } from '@/lib/server/supabaseServer'

function formatApiSetCode(code: string): string {
  const raw = (code || '').trim().toUpperCase().replace(/-/g, '')

  const ebMatch = raw.match(/^(OP\d{2})(EB\d{2})$/)
  if (ebMatch) return `${ebMatch[1]}-${ebMatch[2]}`

  if (raw.length <= 2) return raw
  return `${raw.slice(0, -2)}-${raw.slice(-2)}`
}

function normalizePrintCode(value: string | null | undefined): string {
  return (value || '').trim().toUpperCase()
}

function normalizeSetCode(value: string): string {
  return (value || '').trim().toUpperCase().replace(/-/g, '')
}

type PriceSource = 'cardmarket' | 'us'

export async function GET(
  _request: Request,
  context: { params: Promise<{ setCode: string }> }
) {
  try {
    const { setCode } = await context.params
    const normalizedSetCode = normalizeSetCode(setCode)
    const apiSetCode = formatApiSetCode(setCode)

    const response = await fetch(`https://www.optcgapi.com/api/sets/${apiSetCode}/`)

    if (!response.ok) {
      return NextResponse.json(
        { error: `Erreur API ${response.status}` },
        { status: response.status }
      )
    }

    const cards = await response.json()
    if (!Array.isArray(cards)) {
      return NextResponse.json({ prices: {} })
    }

    const prices: Record<string, number> = {}
    const sources: Record<string, PriceSource> = {}
    const cardmarketProductIds: Record<string, string> = {}

    for (const card of cards) {
      const key = normalizePrintCode(card?.card_image_id)
      const price = Number(card?.inventory_price)
      if (!key || !Number.isFinite(price)) continue
      prices[key] = price
      sources[key] = 'us'
    }

    const { data: setData } = await supabaseServiceServer
      .from('sets')
      .select('id')
      .eq('code', normalizedSetCode)
      .maybeSingle()

    if (setData?.id) {
      const { data: printsData } = await supabaseServiceServer
        .from('card_prints')
        .select('id, print_code')
        .eq('distribution_set_id', setData.id)

      const prints =
        ((printsData as Array<{ id: string; print_code: string | null }> | null) || []).filter(
          (row) => Boolean(normalizePrintCode(row.print_code))
        )

      if (prints.length > 0) {
        const printCodeById = new Map<string, string>()
        for (const row of prints) {
          const normalizedPrintCode = normalizePrintCode(row.print_code)
          if (!normalizedPrintCode) continue
          printCodeById.set(row.id, normalizedPrintCode)
        }

        const printIds = [...printCodeById.keys()]
        const { data: linksData } = await supabaseServiceServer
          .from('cardmarket_print_links')
          .select('card_print_id, cardmarket_product_id')
          .in('card_print_id', printIds)

        const links =
          (linksData as Array<{ card_print_id: string; cardmarket_product_id: string }> | null) ||
          []

        const productIds = [...new Set(links.map((row) => row.cardmarket_product_id).filter(Boolean))]
        if (productIds.length > 0) {
          const { data: catalogPriceData } = await supabaseServiceServer
            .from('cardmarket_price_guide_entries')
            .select('product_id, avg_price')
            .in('product_id', productIds)

          const avgPriceByProductId = new Map<string, number>()
          for (const row of
            ((catalogPriceData as Array<{ product_id: string; avg_price: number | null }> | null) ||
              [])) {
            const avgPrice = Number(row.avg_price)
            if (!row.product_id || !Number.isFinite(avgPrice)) continue
            avgPriceByProductId.set(row.product_id, avgPrice)
          }

          for (const link of links) {
            const printCode = printCodeById.get(link.card_print_id)
            if (!printCode) continue
            const cmAvgPrice = avgPriceByProductId.get(link.cardmarket_product_id)
            if (cmAvgPrice != null && Number.isFinite(cmAvgPrice)) {
              prices[printCode] = cmAvgPrice
              sources[printCode] = 'cardmarket'
            }
            if (link.cardmarket_product_id) {
              cardmarketProductIds[printCode] = link.cardmarket_product_id
            }
          }
        }
      }
    }

    return NextResponse.json({ prices, sources, cardmarketProductIds })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
