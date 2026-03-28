'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { isAdminEmail, parseAdminEmails } from '@/lib/admin'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabaseClient'

export function RootShell({
  children
}: {
  children: React.ReactNode
}) {
  const { user } = useAuth()
  const adminEmails = parseAdminEmails(process.env.NEXT_PUBLIC_ADMIN_EMAILS)
  const canAccessAdmin = isAdminEmail(user?.email, adminEmails)
  const [hasPendingFriendRequests, setHasPendingFriendRequests] = useState(false)
  const [hasPendingAdminSubmissions, setHasPendingAdminSubmissions] = useState(false)
  const [supportTarget, setSupportTarget] = useState<{ id: string; email: string; username: string } | null>(null)
  const [profileUsername, setProfileUsername] = useState<string>('')
  const [useCompactNav, setUseCompactNav] = useState(false)

  const getAuthHeader = async () => {
    const { data } = await supabase.auth.getSession()
    const accessToken = data.session?.access_token
    return accessToken ? ({ Authorization: `Bearer ${accessToken}` } as Record<string, string>) : {}
  }

  useEffect(() => {
    const loadPendingRequests = async () => {
      if (!user) {
        setHasPendingFriendRequests(false)
        return
      }

      const { count, error } = await supabase
        .from('friend_requests')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', user.id)
        .eq('status', 'pending')

      if (error) {
        setHasPendingFriendRequests(false)
        return
      }

      setHasPendingFriendRequests((count || 0) > 0)
    }

    void loadPendingRequests()
  }, [user])

  useEffect(() => {
    const loadPendingAdminSubmissions = async () => {
      if (!user || !canAccessAdmin) {
        setHasPendingAdminSubmissions(false)
        return
      }

      const { count, error } = await supabase
        .from('community_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')

      if (error) {
        setHasPendingAdminSubmissions(false)
        return
      }

      setHasPendingAdminSubmissions((count || 0) > 0)
    }

    void loadPendingAdminSubmissions()
  }, [user, canAccessAdmin])

  useEffect(() => {
    const loadProfileUsername = async () => {
      if (!user) {
        setProfileUsername('')
        return
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', user.id)
        .maybeSingle()

      if (error) {
        setProfileUsername('')
        return
      }

      setProfileUsername(typeof data?.username === 'string' ? data.username : '')
    }

    void loadProfileUsername()
  }, [user])

  useEffect(() => {
    const syncCompactNav = () => {
      if (typeof window === 'undefined') return
      setUseCompactNav(window.innerWidth <= 1100)
    }

    syncCompactNav()
    window.addEventListener('resize', syncCompactNav)
    return () => window.removeEventListener('resize', syncCompactNav)
  }, [])

  useEffect(() => {
    const loadSupportTarget = async () => {
      if (!user || !canAccessAdmin) {
        setSupportTarget(null)
        return
      }

      const authHeaders = await getAuthHeader()
      const res = await fetch('/api/admin/support/current', { headers: authHeaders })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.active || !data?.user) {
        setSupportTarget(null)
        return
      }

      setSupportTarget({
        id: data.user.id,
        email: data.user.email || '',
        username: data.user.username || ''
      })
    }

    void loadSupportTarget()
  }, [user, canAccessAdmin])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  const stopSupportMode = async () => {
    const authHeaders = await getAuthHeader()
    await fetch('/api/admin/support/stop', {
      method: 'POST',
      headers: authHeaders
    })
    setSupportTarget(null)
    window.location.href = '/admin/users'
  }

  const displayIdentity = profileUsername.trim() || user?.email || ''
  const accountBadgeContent = user ? (
    <>
      <Link
        href="/account"
        className="root-shell-account-link"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          color: '#fff',
          textDecoration: 'none',
          fontSize: 13,
          fontWeight: 700
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 24,
            height: 24,
            borderRadius: 999,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255,255,255,0.16)',
            border: '1px solid rgba(255,255,255,0.22)',
            fontSize: 13,
            lineHeight: 1
          }}
        >
          @
        </span>
        {displayIdentity}
      </Link>
      <button
        onClick={handleLogout}
        className="root-shell-logout"
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
  )

  return (
    <html lang="fr">
      <body className="root-shell-body" style={{ margin: 0, fontFamily: 'Arial, sans-serif' }}>
        <header
          className="root-shell-header"
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
            className="root-shell-header-inner"
            style={{
              position: 'relative',
              display: 'flex',
              justifyContent: 'space-between',
              gap: 14,
              alignItems: 'center',
              flexWrap: 'wrap'
            }}
          >
            <div className="root-shell-brand-nav" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <Link
                href="/"
                className="root-shell-home-link"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  textDecoration: 'none',
                  marginRight: 14,
                  lineHeight: 0
                }}
              >
                <Image
                  src="/maison_pirate.png?v=1"
                  alt="Accueil"
                  className="root-shell-nav-image root-shell-home-image"
                  width={96}
                  height={64}
                  unoptimized
                />
              </Link>

              {useCompactNav && (
                <div
                  className="root-shell-account root-shell-account-mobile"
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
                  {accountBadgeContent}
                </div>
              )}

              {useCompactNav ? (
                <nav className="root-shell-nav root-shell-mobile-nav" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'nowrap' }}>
                  <Link
                    href="/catalogue"
                    className="root-shell-mobile-link"
                    style={{ color: '#fff', textDecoration: 'none' }}
                  >
                    Catalogue
                  </Link>
                  {user && (
                    <Link
                      href="/collection"
                      className="root-shell-mobile-link"
                      style={{ color: '#fff', textDecoration: 'none' }}
                    >
                      Collection
                    </Link>
                  )}
                  {user && (
                    <Link
                      href="/friends"
                      className="root-shell-mobile-link"
                      style={{ color: '#fff', textDecoration: 'none' }}
                    >
                      Amis
                    </Link>
                  )}
                  {user && (
                    <Link
                      href="/community"
                      className="root-shell-mobile-link"
                      style={{ color: '#fff', textDecoration: 'none' }}
                    >
                      Contrib
                    </Link>
                  )}
                  <Link
                    href="/lieux"
                    className="root-shell-mobile-link"
                    style={{ color: '#fff', textDecoration: 'none' }}
                  >
                    Lieux
                  </Link>
                  {user && canAccessAdmin && (
                    <Link
                      href="/admin"
                      className="root-shell-mobile-link root-shell-mobile-link-admin"
                      style={{ color: '#fff7ed', textDecoration: 'none' }}
                    >
                      Admin
                    </Link>
                  )}
                </nav>
              ) : (
                <nav className="root-shell-nav root-shell-desktop-nav" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Link
                    href="/catalogue"
                    className="root-shell-nav-link"
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
                      className="root-shell-nav-image"
                      width={96}
                      height={64}
                      unoptimized
                    />
                  </Link>

                  {user && (
                    <Link
                      href="/collection"
                      className="root-shell-nav-link"
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
                        className="root-shell-nav-image"
                        width={96}
                        height={64}
                        unoptimized
                      />
                    </Link>
                  )}

                  {user && (
                    <Link
                      href="/friends"
                      className="root-shell-nav-link"
                      style={{
                        textDecoration: 'none',
                        padding: 0,
                        display: 'inline-flex',
                        alignItems: 'center',
                        lineHeight: 0,
                        borderRadius: 18,
                        boxShadow: hasPendingFriendRequests
                          ? '0 0 0 3px rgba(250, 204, 21, 0.98), 0 0 22px rgba(245, 158, 11, 0.75)'
                          : 'none'
                      }}
                    >
                      <Image
                        src="/bouton_amis.png?v=3"
                        alt="Amis"
                        className="root-shell-nav-image"
                        width={96}
                        height={64}
                        unoptimized
                      />
                    </Link>
                  )}

                  {user && (
                    <Link
                      href="/community"
                      className="root-shell-nav-link root-shell-community-link"
                      style={{
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: 0,
                        lineHeight: 0,
                        width: 96,
                        height: 64,
                        position: 'relative',
                        overflow: 'hidden',
                        borderRadius: 18
                      }}
                    >
                      <Image
                        src="/bouton_contributions.png?v=1"
                        alt="Contributions"
                        className="root-shell-nav-image"
                        fill
                        style={{ objectFit: 'cover', objectPosition: 'center 62%' }}
                        unoptimized
                      />
                    </Link>
                  )}

                  <Link
                    href="/lieux"
                    className="root-shell-admin-link"
                    style={{
                      color: '#fff7ed',
                      textDecoration: 'none',
                      padding: '18px 14px',
                      borderRadius: 999,
                      background: 'rgba(249, 115, 22, 0.82)',
                      border: '1px solid rgba(255,255,255,0.28)',
                      fontWeight: 700,
                      fontSize: 16,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 7
                    }}
                  >
                    Lieux
                  </Link>

                  {user && canAccessAdmin && (
                    <Link
                      href="/admin"
                      className="root-shell-admin-link"
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
                        gap: 7,
                        boxShadow: hasPendingAdminSubmissions
                          ? '0 0 0 3px rgba(250, 204, 21, 0.98), 0 0 22px rgba(245, 158, 11, 0.75)'
                          : 'none'
                      }}
                    >
                      <Image src="/op-jolly.svg" alt="" width={13} height={13} />
                      Admin
                    </Link>
                  )}
                </nav>
              )}
            </div>

            {!useCompactNav && (
            <div
              className="root-shell-account"
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
                  <Link
                    href="/account"
                    className="root-shell-account-link"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      color: '#fff',
                      textDecoration: 'none',
                      fontSize: 13,
                      fontWeight: 700
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 999,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(255,255,255,0.16)',
                        border: '1px solid rgba(255,255,255,0.22)',
                        fontSize: 13,
                        lineHeight: 1
                      }}
                    >
                      👤
                    </span>
                    {displayIdentity}
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="root-shell-logout"
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
            )}
          </div>
        </header>

        {supportTarget && (
          <div
            style={{
              background: '#7f1d1d',
              color: '#fff',
              padding: '10px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap'
            }}
          >
            <div style={{ fontWeight: 700 }}>
              Mode support lecture seule actif: {supportTarget.username || supportTarget.email || supportTarget.id}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <Link href="/admin/support/account" style={{ color: '#fff' }}>
                Compte
              </Link>
              <Link href="/admin/support/collection" style={{ color: '#fff' }}>
                Collection
              </Link>
              <button
                onClick={() => void stopSupportMode()}
                style={{
                  border: '1px solid rgba(255,255,255,0.5)',
                  background: 'rgba(255,255,255,0.12)',
                  color: '#fff',
                  borderRadius: 999,
                  padding: '6px 12px',
                  cursor: 'pointer'
                }}
              >
                Quitter le mode support
              </button>
            </div>
          </div>
        )}

        <main>{children}</main>
      </body>
    </html>
  )
}
