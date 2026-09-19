import type { Metadata } from 'next'
import { CardScanner } from '@/components/CardScanner'

export const metadata: Metadata = {
  title: 'Scanner une carte One Piece',
  robots: { index: false, follow: false }
}

export default function ScanPage() {
  return <CardScanner />
}
