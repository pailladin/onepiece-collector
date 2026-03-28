import { Suspense } from 'react'
import type { Metadata } from 'next'
import { PlacesPageClient } from '@/components/PlacesPageClient'

export const metadata: Metadata = {
  title: 'Lieux One Piece TCG',
  description:
    'Trouve des boutiques, lieux de jeu et tournois One Piece TCG par ville, code postal ou activites.',
  alternates: {
    canonical: '/lieux'
  }
}

export default function PlacesPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40 }}>Chargement...</div>}>
      <PlacesPageClient />
    </Suspense>
  )
}
