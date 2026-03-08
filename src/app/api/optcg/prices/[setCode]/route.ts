import { NextResponse } from 'next/server'
import { getSetPricing } from '@/lib/server/setPricing'

export async function GET(
  _request: Request,
  context: { params: Promise<{ setCode: string }> }
) {
  try {
    const { setCode } = await context.params
    const payload = await getSetPricing(setCode)
    return NextResponse.json(payload)
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
