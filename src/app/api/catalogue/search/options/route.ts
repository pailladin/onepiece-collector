import { NextResponse } from 'next/server'
import { getCatalogueIndex } from '@/lib/server/catalogueIndex'

export async function GET() {
  try {
    const { filterOptions } = await getCatalogueIndex()
    return NextResponse.json(filterOptions, {
      headers: {
        'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600'
      }
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur chargement options'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
