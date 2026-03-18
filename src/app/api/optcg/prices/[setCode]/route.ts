import { NextResponse } from 'next/server'
import { getSetPricing } from '@/lib/server/setPricing'

const CACHE_CONTROL = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400'

export async function GET(
  _request: Request,
  context: { params: Promise<{ setCode: string }> }
) {
  try {
    const { setCode } = await context.params
    const payload = await getSetPricing(setCode)
    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': CACHE_CONTROL
      }
    })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
