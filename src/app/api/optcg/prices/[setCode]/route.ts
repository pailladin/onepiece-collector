import { NextResponse } from 'next/server'

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

export async function GET(
  _request: Request,
  context: { params: Promise<{ setCode: string }> }
) {
  try {
    const { setCode } = await context.params
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

    for (const card of cards) {
      const key = normalizePrintCode(card?.card_image_id)
      const price = Number(card?.market_price)
      if (!key || !Number.isFinite(price)) continue
      prices[key] = price
    }

    return NextResponse.json({ prices })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
