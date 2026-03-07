'use client'

import Image from 'next/image'
import Link from 'next/link'
import { isAdminEmail, parseAdminEmails } from '@/lib/admin'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabaseClient'

export default function RootLayout({
  children
}: {
  children: React.ReactNode
}) {
  const { user } = useAuth()
  const adminEmails = parseAdminEmails(process.env.NEXT_PUBLIC_ADMIN_EMAILS)
  const canAccessAdmin = isAdminEmail(user?.email, adminEmails)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <html lang="fr">
      <body style={{ margin: 0, fontFamily: 'Arial, sans-serif' }}>
        <header
          style={{
            color: 'white',
            padding: '10px 18px 10px',
            background:
              'linear-gradient(120deg, #0f172a 0%, #1e3a8a 38%, #0ea5e9 68%, #f59e0b 100%)',
            borderBottom: '1px solid rgba(255,255,255,0.28)',
            position: 'sticky',
            top: 0,
            zIndex: 50,
            overflow: 'hidden'
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'radial-gradient(circle at 10% 30%, rgba(255,255,255,0.22) 0%, transparent 40%), radial-gradient(circle at 85% 70%, rgba(255,255,255,0.18) 0%, transparent 38%)',
              pointerEvents: 'none'
            }}
          />

          <div
            style={{
              position: 'relative',
              display: 'flex',
              justifyContent: 'space-between',
              gap: 14,
              alignItems: 'center',
              flexWrap: 'wrap'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <Link href="/" style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <Image
                    src="/logo-opc-badge.svg"
                    alt="One Piece Collector"
                    width={170}
                    height={42}
                    priority
                  />
                </Link>
              </div>

              <nav style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Link
                  href="/"
                  style={{
                    color: 'white',
                    textDecoration: 'none',
                    padding: '18px 14px',
                    borderRadius: 999,
                    background: 'rgba(15,23,42,0.34)',
                    border: '1px solid rgba(255,255,255,0.22)',
                    fontWeight: 700,
                    fontSize: 16,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7
                  }}
                >
                  <Image src="/op-hat.svg" alt="" width={16} height={11} />
                  Accueil
                </Link>

                <Link
                  href="/catalogue"
                  style={{
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: 0,
                    lineHeight: 0
                  }}
                >
                  <Image
                    src="/bouton_catalogue.png?v=3"
                    alt="Catalogue"
                    width={96}
                    height={64}
                    unoptimized
                  />
                </Link>

                {user && (
                  <Link
                    href="/collection"
                    style={{
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: 0,
                      lineHeight: 0
                    }}
                  >
                    <Image
                      src="/bouton_collection.png?v=3"
                      alt="Ma Collection"
                      width={96}
                      height={64}
                      unoptimized
                    />
                  </Link>
                )}

                {user && (
                  <Link
                    href="/friends"
                    style={{
                      textDecoration: 'none',
                      padding: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      lineHeight: 0
                    }}
                  >
                    <Image
                      src="/bouton_amis.png?v=3"
                      alt="Amis"
                      width={96}
                      height={64}
                      unoptimized
                    />
                  </Link>
                )}

                {user && canAccessAdmin && (
                  <Link
                    href="/admin"
                    style={{
                      color: '#fffbeb',
                      textDecoration: 'none',
                      padding: '18px 14px',
                      borderRadius: 999,
                      background: 'rgba(220, 38, 38, 0.74)',
                      border: '1px solid rgba(255,255,255,0.28)',
                      fontWeight: 700,
                      fontSize: 16,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 7
                    }}
                  >
                    <Image src="/op-jolly.svg" alt="" width={13} height={13} />
                    Admin
                  </Link>
                )}
              </nav>
            </div>

            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                background: 'rgba(15, 23, 42, 0.42)',
                border: '1px solid rgba(255,255,255,0.25)',
                borderRadius: 999,
                padding: '6px 10px'
              }}
            >
              {user ? (
                <>
                  <span style={{ fontSize: 13 }}>{user.email}</span>
                  <button
                    onClick={handleLogout}
                    style={{
                      border: '1px solid rgba(255,255,255,0.35)',
                      background: 'rgba(255,255,255,0.15)',
                      color: '#fff',
                      borderRadius: 999,
                      padding: '6px 12px',
                      cursor: 'pointer'
                    }}
                  >
                    Deconnexion
                  </button>
                </>
              ) : (
                <Link
                  href="/auth"
                  style={{
                    color: 'white',
                    textDecoration: 'none',
                    fontWeight: 700
                  }}
                >
                  Connexion
                </Link>
              )}
            </div>
          </div>
        </header>

        <main>{children}</main>
      </body>
    </html>
  )
}
