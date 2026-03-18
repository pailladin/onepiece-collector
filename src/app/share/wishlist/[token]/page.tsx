import type { Metadata } from 'next'
import { SharedWishlistPageClient } from '@/components/SharedWishlistPageClient'

export const metadata: Metadata = {
  title: 'Wishlist partagee',
  description: 'Vue partagee d une wishlist One Piece.',
  robots: {
    index: false,
    follow: false
  }
}

export default function SharedWishlistPage() {
  return <SharedWishlistPageClient />
}
