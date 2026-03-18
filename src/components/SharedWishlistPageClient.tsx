'use client'

import { useParams } from 'next/navigation'
import { CollectionWishlistClient } from '@/components/CollectionWishlistClient'

export function SharedWishlistPageClient() {
  const params = useParams()
  const token = Array.isArray(params.token) ? params.token[0] : params.token

  if (!token) {
    return <div style={{ padding: 40 }}>Lien de partage invalide.</div>
  }

  return <CollectionWishlistClient shareToken={token} />
}
