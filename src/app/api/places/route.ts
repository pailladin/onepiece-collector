import { NextRequest, NextResponse } from 'next/server'
import { getPublicPlaces } from '@/lib/server/publicPlaces'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const rows = await getPublicPlaces(request.nextUrl.searchParams.get('q') || '', request.nextUrl.searchParams.get('activity') || 'all')
    return NextResponse.json({ rows })
  } catch {
    return NextResponse.json({ error: 'Impossible de charger les lieux.' }, { status: 500 })
  }
}
