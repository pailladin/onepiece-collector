'use client'

import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabaseClient'
import { isAdminEmail, parseAdminEmails } from '@/lib/admin'

export default function RootLayout({
  children,
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
            background: '#111',
            color: 'white',
            padding: '15px 30px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <Link href="/" style={{ color: 'white', marginRight: 20 }}>
              Accueil
            </Link>

            <Link href="/catalogue" style={{ color: 'white', marginRight: 20 }}>
              Catalogue
            </Link>

            {user && (
              <Link href="/collection" style={{ color: 'white', marginRight: 20 }}>
                Ma Collection
              </Link>
            )}

            {user && (
              <Link href="/friends" style={{ color: 'white', marginRight: 20 }}>
                Amis
              </Link>
            )}

            {user && canAccessAdmin && (
              <Link href="/admin" style={{ color: 'white' }}>
                Admin
              </Link>
            )}
          </div>

          <div>
            {user ? (
              <>
                <span style={{ marginRight: 15 }}>
                  {user.email}
                </span>
                <button onClick={handleLogout}>
                  Déconnexion
                </button>
              </>
            ) : (
              <Link href="/auth" style={{ color: 'white' }}>
                Connexion
              </Link>
            )}
          </div>
        </header>

        <main>{children}</main>
      </body>
    </html>
  )
}
