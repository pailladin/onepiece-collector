import { NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/server/authUser'
import { createShareSetToken } from '@/lib/server/shareToken'

function normalizeSetCode(value: string) {
  return value.trim().toUpperCase().replace(/-/g, '')
}

export async function POST(request: Request) {
  const userResult = await getRequestUser(request)
  if (!userResult.user) {
    return NextResponse.json(
      { error: userResult.error || 'Unauthorized' },
      { status: 401 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const setCode = normalizeSetCode(String(body?.setCode || ''))
  const queryStringRaw = String(body?.queryString || '')

  if (!setCode) {
    return NextResponse.json({ error: 'setCode is required' }, { status: 400 })
  }

  const token = createShareSetToken({
    userId: userResult.user.id,
    setCode
  })

  const origin = new URL(request.url).origin
  const normalizedQuery = queryStringRaw.replace(/^\?+/, '').trim()
  const shareUrl = `${origin}/share/set/${encodeURIComponent(token)}/${setCode}${
    normalizedQuery ? `?${normalizedQuery}` : ''
  }`

  return NextResponse.json({ shareUrl })
}
