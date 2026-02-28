'use client'

import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { isAdminEmail, parseAdminEmails } from '@/lib/admin'

export default function Home() {
  const { user } = useAuth()
  const adminEmails = parseAdminEmails(process.env.NEXT_PUBLIC_ADMIN_EMAILS)
  const canAccessAdmin = isAdminEmail(user?.email, adminEmails)

  return (
    <div
      style={{
        minHeight: 'calc(100vh - 70px)',
        background:
          'radial-gradient(circle at 15% 10%, #fff4e6 0%, #eef2ff 40%, #e0f2fe 100%)',
        padding: 40
      }}
    >
      <div style={{ maxWidth: 1020, margin: '0 auto' }}>
        <section style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 36, margin: 0, color: '#0f172a' }}>
            One Piece Collector
          </h1>
          <p style={{ marginTop: 12, color: '#334155', fontSize: 16 }}>
            Gere ta collection de cartes One Piece, suis ta progression par set, et
            partage facilement tes vues avec tes amis.
          </p>
        </section>

        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
            gap: 14,
            marginBottom: 28
          }}
        >
          <LinkCard
            href="/catalogue"
            title="Catalogue"
            text="Voir tous les sets et leurs cartes, filtrer par rarete, type et variantes."
          />
          {user ? (
            <LinkCard
              href="/collection"
              title="Ma Collection"
              text="Suivre ce que tu possedes, les manquantes, et la progression detaillee."
            />
          ) : (
            <LinkCard
              href="/auth"
              title="Connexion"
              text="Connecte-toi pour enregistrer ta collection et debloquer les fonctions sociales."
            />
          )}
          {user && (
            <LinkCard
              href="/friends"
              title="Amis"
              text="Comparer vos collections et preparer rapidement des echanges."
            />
          )}
          {user && canAccessAdmin && (
            <LinkCard
              href="/admin"
              title="Admin"
              text="Importer les sets, corriger les erreurs source et gerer les donnees."
            />
          )}
        </section>

        <section
          style={{
            background: '#ffffffcc',
            border: '1px solid #dbeafe',
            borderRadius: 12,
            padding: 18
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: 12, color: '#0f172a' }}>
            Fonctionnalites principales
          </h2>
          <ul style={{ margin: 0, paddingLeft: 20, color: '#334155', lineHeight: 1.6 }}>
            <li>Progression par set avec separation normales / alternatives / total.</li>
            <li>Filtres avances dans le catalogue et la collection.</li>
            <li>Lien de partage public d un set avec filtres conserves dans l URL.</li>
            <li>Outils admin pour importer, mettre a jour et corriger les cartes.</li>
          </ul>
        </section>
      </div>
    </div>
  )
}

function LinkCard({
  href,
  title,
  text
}: {
  href: string
  title: string
  text: string
}) {
  return (
    <Link
      href={href}
      style={{
        textDecoration: 'none',
        color: 'inherit',
        border: '1px solid #cbd5e1',
        borderRadius: 12,
        padding: 14,
        background: '#fff',
        boxShadow: '0 10px 22px -22px #0f172a'
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: '#0f172a' }}>
        {title}
      </div>
      <div style={{ fontSize: 14, color: '#475569' }}>{text}</div>
    </Link>
  )
}
