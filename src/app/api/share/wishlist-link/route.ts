import { NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/server/authUser'
import { createShareWishlistToken } from '@/lib/server/shareToken'

export async function POST(request: Request) {
  const userResult = await getRequestUser(request)
  if (!userResult.user) {
    return NextResponse.json(
      { error: userResult.error || 'Unauthorized' },
      { status: 401 }
    )
  }

  const token = createShareWishlistToken({
    userId: userResult.user.id
  })

  const origin = new URL(request.url).origin
  const shareUrl = `${origin}/share/wishlist/${encodeURIComponent(token)}`

  return NextResponse.json({ shareUrl })
}
