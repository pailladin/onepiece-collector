import type { Metadata } from 'next'
import { AccountPageClient } from '@/components/AccountPageClient'

export const metadata: Metadata = {
  title: 'Mon compte',
  description: 'Gere tes moyens de connexion et la securite de ton compte.',
  robots: {
    index: false,
    follow: false
  }
}

export default function AccountPage() {
  return <AccountPageClient />
}
