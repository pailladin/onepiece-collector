import type { Metadata } from 'next'
import { AuthPageClient } from '@/components/AuthPageClient'

export const metadata: Metadata = {
  title: 'Connexion',
  description: 'Connecte-toi pour gerer ta collection One Piece et acceder aux fonctions sociales.',
  robots: {
    index: false,
    follow: false
  }
}

export default function AuthPage() {
  return <AuthPageClient />
}

