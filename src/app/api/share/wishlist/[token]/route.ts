import { NextResponse } from 'next/server'
import { verifyShareWishlistToken } from '@/lib/server/shareToken'
import {
  fetchWishlistBaseItemsForUser,
  fetchWishlistOwnerName
} from '@/lib/server/wishlist'

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params
    const payload = verifyShareWishlistToken(token)
    const [ownerName, items] = await Promise.all([
      fetchWishlistOwnerName(payload.userId),
      fetchWishlistBaseItemsForUser(payload.userId)
    ])

    return NextResponse.json({
      ownerName,
      items
    })
  } catch {
    return NextResponse.json({ error: 'Invalid or expired share link' }, { status: 401 })
  }
}
