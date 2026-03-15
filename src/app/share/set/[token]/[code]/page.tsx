import type { Metadata } from 'next'
import { SharedSetPageClient } from '@/components/SharedSetPageClient'

export const metadata: Metadata = {
  title: 'Collection partagee',
  description: 'Vue partagee d un set de collection One Piece.',
  robots: {
    index: false,
    follow: false
  }
}

export default function SharedSetPage() {
  return <SharedSetPageClient />
}

