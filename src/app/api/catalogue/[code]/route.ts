import { NextResponse } from 'next/server'
import { getSetCatalogue } from '@/lib/server/setCatalogue'

function normalizeCode(value: string | null | undefined) {
  return (value || '').replace(/-/g, '').trim().toUpperCase()
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> }
) {
  const code = normalizeCode((await context.params).code)
  const startedAt = Date.now()
  try {
    const catalogue = await getSetCatalogue(code)
    if (!catalogue) {
      return NextResponse.json({ error: 'Set introuvable' }, { status: 404 })
    }
    return NextResponse.json(catalogue, {
      headers: {
        'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
        'Server-Timing': `set-catalogue;dur=${Date.now() - startedAt}`
      }
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur chargement catalogue'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
