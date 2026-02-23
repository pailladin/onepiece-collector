import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const { setCode } = await req.json()

    const response = await fetch(
      `https://optcgapi.com/api/cards?set=${setCode}`
    )

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Erreur récupération cartes' },
        { status: 500 }
      )
    }

    const cards = await response.json()

    const rows = cards.map((card: any) => ({
      set_code: setCode,
      base_set_code: setCode,
      card_number: card.number,
      name_fr: card.name,
      name_en: card.name,
      rarity: card.rarity,
      type: card.type,
      variant_type: 'normal',
      image_filename: `${setCode}-${card.number}.png`
    }))

    return NextResponse.json(rows)
  } catch (error) {
    return NextResponse.json(
      { error: 'Erreur génération fichier' },
      { status: 500 }
    )
  }
}
