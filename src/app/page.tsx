import type { Metadata } from 'next'
import { HomePageClient } from '@/components/HomePageClient'

export const metadata: Metadata = {
  title: 'Catalogue et gestion de collection One Piece TCG',
  description:
    'Decouvre les sets et cartes One Piece TCG, suis ta collection, partage tes vues et compare avec tes amis.',
  alternates: {
    canonical: '/'
  },
  openGraph: {
    title: 'One Piece Collector',
    description:
      'Catalogue et gestion de collection One Piece TCG avec progression, partage et comparaison entre amis.'
  }
}

export default function Home() {
  return <HomePageClient />
}

