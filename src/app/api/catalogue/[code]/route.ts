import { NextResponse } from 'next/server'
import { getCatalogueIndex } from '@/lib/server/catalogueIndex'

function normalizeCode(value: string | null | undefined) {
  return (value || '').replace(/-/g, '').trim().toUpperCase()
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> }
) {
  const code = normalizeCode((await context.params).code)

  try {
    const index = await getCatalogueIndex()
    const set = index.sets.find((row) => row.code === code)
    if (!set) {
      return NextResponse.json({ error: 'Set introuvable' }, { status: 404 })
    }

    const items = (index.itemsBySetCode.get(code) || []).map((item) => ({
      id: item.id,
      print_code: item.print_code,
      variant_type: item.variant_type,
      image_path: item.image_path,
      card_id: item.card_id,
      available_languages: item.available_languages,
      card: item.card
        ? {
            id: item.card.id,
            number: item.card.number,
            rarity: item.card.rarity,
            type: item.card.type,
            card_translations: item.card.card_translations
          }
        : null
    }))

    return NextResponse.json(
      {
        set: {
          id: set.id,
          code: set.code,
          name: set.name,
          availableLanguages: set.available_languages || []
        },
        items
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300'
        }
      }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur chargement catalogue'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
