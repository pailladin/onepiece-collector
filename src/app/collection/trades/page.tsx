'use client'

import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { CollectionCardsSearch } from '@/components/CollectionCardsSearch'

export default function CollectionTradesPage() {
  const { user, loading } = useAuth()
  if (loading) return <p style={{ padding: 24 }}>Chargement…</p>
  if (!user) return <p style={{ padding: 24 }}><Link href="/auth">Connecte-toi</Link> pour voir tes cartes à échanger.</p>
  return <>
    <div style={{ padding: '24px 20px 12px' }}>
      <Link href="/collection" style={{ color: '#0f766e' }}>← Ma collection</Link>
      <h1 style={{ color: '#132943', fontSize: 26 }}>Mes cartes à échanger</h1>
      <p style={{ color: '#475569' }}>Toutes les cartes que tu proposes, par langue. Clique sur « À l’échange » pour ajuster les quantités ou retirer une offre.</p>
      <Link href="/friends" style={{ color: '#0f766e' }}>Comparer avec mes amis →</Link>
    </div>
    <CollectionCardsSearch tradeOnly />
  </>
}
