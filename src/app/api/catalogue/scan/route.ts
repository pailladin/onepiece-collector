import { NextResponse } from 'next/server'
import { getCatalogueIndex } from '@/lib/server/catalogueIndex'
import { matchesCardCode, normalizeCardCode } from '@/lib/scanner/cardCode'

export async function GET(request: Request) {
  const code = normalizeCardCode(new URL(request.url).searchParams.get('code') || '')
  if (!code) return NextResponse.json({ error: 'Numéro de carte invalide.' }, { status: 400 })
  try {
    const { items } = await getCatalogueIndex()
    // Include reprints in other sets. A printed number alone never identifies the artwork.
    return NextResponse.json({ code, items: items.filter((item) => matchesCardCode(item, code)) }, {
      headers: { 'Cache-Control': 'public, max-age=30, s-maxage=60' }
    })
  } catch {
    return NextResponse.json({ error: 'Le catalogue est indisponible. Réessaie dans un instant.' }, { status: 503 })
  }
}
