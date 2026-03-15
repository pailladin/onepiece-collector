import type { Metadata } from 'next'
import { RootShell } from '@/components/RootShell'
import { getSiteUrl } from '@/lib/site'

const siteUrl = getSiteUrl()

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'One Piece Collector',
    template: '%s | One Piece Collector'
  },
  description:
    'Catalogue et gestion de collection de cartes One Piece TCG: sets, cartes, variantes, progression et partage.',
  applicationName: 'One Piece Collector',
  keywords: [
    'one piece card game',
    'one piece tcg',
    'catalogue cartes one piece',
    'collection one piece',
    'cartes one piece',
    'one piece collector'
  ],
  authors: [{ name: 'One Piece Collector' }],
  creator: 'One Piece Collector',
  alternates: {
    canonical: '/'
  },
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    url: siteUrl,
    title: 'One Piece Collector',
    description:
      'Catalogue et gestion de collection de cartes One Piece TCG avec progression par set et partage.',
    siteName: 'One Piece Collector'
  },
  twitter: {
    card: 'summary_large_image',
    title: 'One Piece Collector',
    description:
      'Catalogue et gestion de collection de cartes One Piece TCG avec progression par set et partage.'
  },
  robots: {
    index: true,
    follow: true
  }
}

export default function RootLayout({
  children
}: {
  children: React.ReactNode
}) {
  return <RootShell>{children}</RootShell>
}

