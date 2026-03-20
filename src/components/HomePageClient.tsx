'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'

export function HomePageClient() {
  const { user } = useAuth()
  const primaryHref = user ? '/collection' : '/auth'
  const primaryLabel = user ? 'Ouvrir ma collection' : 'Commencer'

  return (
    <div
      className="home-page"
      style={{
        minHeight: 'calc(100vh - 70px)',
        background:
          'radial-gradient(circle at 15% 10%, #fff4e6 0%, #eef2ff 40%, #e0f2fe 100%)',
        padding: '40px 24px 56px'
      }}
    >
      <div className="home-shell" style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gap: 24 }}>
        <section
          className="home-hero-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.3fr) minmax(280px, 0.9fr)',
            gap: 20,
            alignItems: 'stretch'
          }}
        >
          <div
            className="home-panel home-panel-main"
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.96), rgba(239,246,255,0.9))',
              border: '1px solid rgba(191,219,254,0.95)',
              borderRadius: 24,
              padding: 28,
              boxShadow: '0 20px 50px -34px rgba(15, 23, 42, 0.45)'
            }}
          >
            <div
              style={{
                display: 'inline-flex',
                padding: '6px 10px',
                borderRadius: 999,
                background: '#dbeafe',
                color: '#1d4ed8',
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 0.3,
                textTransform: 'uppercase'
              }}
            >
              Collection One Piece TCG
            </div>
            <h1
              className="home-hero-title"
              style={{
                fontSize: 42,
                lineHeight: 1.05,
                margin: '16px 0 0',
                color: '#0f172a'
              }}
            >
              Suis chaque carte, chaque set, et chaque progression au meme endroit.
            </h1>
            <p
              className="home-hero-copy"
              style={{
                marginTop: 16,
                color: '#334155',
                fontSize: 17,
                lineHeight: 1.6,
                maxWidth: 700
              }}
            >
              Explore le catalogue, note ce que tu possedes, repere ce qu il te manque et
              partage facilement ta collection avec tes amis.
            </p>

            <div className="home-actions" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 22 }}>
              <ActionLink href={primaryHref} primary>
                {primaryLabel}
              </ActionLink>
              <ActionLink href="/catalogue">Voir le catalogue</ActionLink>
            </div>

            <div
              className="home-stats-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: 12,
                marginTop: 24
              }}
            >
              <HeroStat
                value="Sets"
                label="Catalogue organise par extension avec navigation claire."
              />
              <HeroStat
                value="Progression"
                label="Suivi detaille des normales, alternatives et total."
              />
              <HeroStat
                value="Partage"
                label="Liens publics faciles a envoyer pour montrer tes vues."
              />
            </div>
          </div>

          <div
            className="home-panel home-panel-side"
            style={{
              background: 'linear-gradient(180deg, rgba(15,23,42,0.96), rgba(30,41,59,0.92))',
              border: '1px solid rgba(148,163,184,0.35)',
              borderRadius: 24,
              padding: 24,
              color: '#e2e8f0',
              boxShadow: '0 20px 50px -36px rgba(15, 23, 42, 0.7)'
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.2, color: '#93c5fd' }}>
              Ce que tu peux faire
            </div>
            <div style={{ display: 'grid', gap: 14, marginTop: 18 }}>
              <FeaturePoint
                title="Verifier un set rapidement"
                text="Vois instantanement les cartes presentes, les variantes et ce qu il te manque."
              />
              <FeaturePoint
                title="Filtrer sans perdre le fil"
                text="Trie par rarete, type, nom ou version pour aller droit a la carte voulue."
              />
              <FeaturePoint
                title="Comparer avec tes amis"
                text="Analyse vos collections pour preparer des echanges plus facilement."
              />
            </div>
          </div>
        </section>

        <section
          className="home-link-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
            gap: 14,
            marginBottom: 4
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
              href="/community"
              title="Contributions"
              text="Proposer des corrections, ajouter des cartes et monter dans le classement des contributeurs."
            />
          )}
          {user && (
            <LinkCard
              href="/friends"
              title="Amis"
              text="Comparer vos collections et preparer rapidement des echanges."
            />
          )}
        </section>

        <section
          className="home-info-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.1fr) minmax(280px, 0.9fr)',
            gap: 18
          }}
        >
          <div
            className="home-panel"
            style={{
              background: '#ffffffd9',
              border: '1px solid #dbeafe',
              borderRadius: 20,
              padding: 22
            }}
          >
            <h2 style={{ margin: 0, color: '#0f172a', fontSize: 26 }}>Fonctionnalites principales</h2>
            <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
              <InfoRow
                title="Progression par set"
                text="Visualise tes avances avec separation normales, alternatives et total."
              />
              <InfoRow
                title="Recherche et filtres avances"
                text="Affiche rapidement les cartes voulues selon leur rarete, type ou variante."
              />
              <InfoRow
                title="Partage public"
                text="Genere une vue partageable de tes sets et garde les filtres dans l URL."
              />
            </div>
          </div>

          <div
            className="home-panel"
            style={{
              background: '#fff7ed',
              border: '1px solid #fdba74',
              borderRadius: 20,
              padding: 22
            }}
          >
            <h2 style={{ margin: 0, color: '#7c2d12', fontSize: 24 }}>Comment ca marche</h2>
            <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
              <StepCard
                step="1"
                title="Explore"
                text="Parcours les sets et ouvre les cartes qui t interessent."
              />
              <StepCard
                step="2"
                title="Renseigne"
                text="Indique ce que tu possedes pour construire ta progression."
              />
              <StepCard
                step="3"
                title="Partage"
                text="Compare avec tes amis ou envoie une vue claire de ta collection."
              />
            </div>
          </div>
        </section>

        <section
          className="home-cta"
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.88), rgba(224,242,254,0.88))',
            border: '1px solid #bfdbfe',
            borderRadius: 22,
            padding: 24,
            display: 'flex',
            justifyContent: 'space-between',
            gap: 16,
            alignItems: 'center',
            flexWrap: 'wrap'
          }}
        >
          <div style={{ maxWidth: 700 }}>
            <h2 className="home-cta-title" style={{ margin: 0, color: '#0f172a', fontSize: 28 }}>
              Tout est pret pour suivre ta collection plus facilement.
            </h2>
            <p style={{ margin: '10px 0 0', color: '#334155', lineHeight: 1.6 }}>
              Commence par le catalogue si tu veux explorer, ou connecte-toi pour enregistrer
              ta progression et utiliser les fonctions sociales.
            </p>
          </div>
          <div className="home-actions" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <ActionLink href="/catalogue">Explorer</ActionLink>
            <ActionLink href={primaryHref} primary>
              {primaryLabel}
            </ActionLink>
          </div>
        </section>
      </div>
    </div>
  )
}

function ActionLink({
  href,
  children,
  primary = false
}: {
  href: string
  children: ReactNode
  primary?: boolean
}) {
  return (
    <Link
      className={primary ? 'home-action-link home-action-link-primary' : 'home-action-link'}
      href={href}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 44,
        padding: '0 16px',
        borderRadius: 999,
        textDecoration: 'none',
        fontWeight: 700,
        background: primary ? '#0f172a' : '#ffffff',
        color: primary ? '#ffffff' : '#0f172a',
        border: primary ? '1px solid #0f172a' : '1px solid #cbd5e1',
        boxShadow: primary ? '0 16px 30px -22px rgba(15, 23, 42, 0.9)' : 'none'
      }}
    >
      {children}
    </Link>
  )
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <div
      style={{
        borderRadius: 16,
        padding: 14,
        background: 'rgba(255,255,255,0.72)',
        border: '1px solid rgba(191,219,254,0.9)'
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{value}</div>
      <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.5, color: '#475569' }}>{label}</div>
    </div>
  )
}

function FeaturePoint({ title, text }: { title: string; text: string }) {
  return (
    <div
      style={{
        borderRadius: 16,
        padding: 16,
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(148,163,184,0.22)'
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>{title}</div>
      <div style={{ marginTop: 6, fontSize: 14, lineHeight: 1.6, color: '#cbd5e1' }}>{text}</div>
    </div>
  )
}

function InfoRow({ title, text }: { title: string; text: string }) {
  return (
    <div
      style={{
        padding: '14px 0',
        borderTop: '1px solid #e2e8f0'
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{title}</div>
      <div style={{ marginTop: 4, lineHeight: 1.6, color: '#475569' }}>{text}</div>
    </div>
  )
}

function StepCard({
  step,
  title,
  text
}: {
  step: string
  title: string
  text: string
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '40px minmax(0, 1fr)',
        gap: 12,
        alignItems: 'start',
        padding: 14,
        borderRadius: 16,
        background: 'rgba(255,255,255,0.65)',
        border: '1px solid rgba(251,146,60,0.3)'
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 999,
          background: '#fb923c',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 800
        }}
      >
        {step}
      </div>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#7c2d12' }}>{title}</div>
        <div style={{ marginTop: 4, lineHeight: 1.6, color: '#9a3412' }}>{text}</div>
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
      className="home-link-card"
      href={href}
      style={{
        textDecoration: 'none',
        color: 'inherit',
        border: '1px solid #cbd5e1',
        borderRadius: 18,
        padding: 18,
        background: '#fff',
        boxShadow: '0 16px 34px -28px #0f172a'
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: '#0f172a' }}>
        {title}
      </div>
      <div style={{ fontSize: 14, color: '#475569' }}>{text}</div>
    </Link>
  )
}
