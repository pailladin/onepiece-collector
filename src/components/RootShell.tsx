'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { isAdminEmail, parseAdminEmails } from '@/lib/admin'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabaseClient'

const DISCORD_INVITE_URL = 'https://discord.gg/sbAx5KWe6'

function DiscordInviteLink() {
  return (
    <a
      href={DISCORD_INVITE_URL}
      target="_blank"
      rel="noreferrer"
      aria-label="Rejoindre le Discord"
      title="Rejoindre le Discord"
      className="root-shell-discord-link"
      style={{
        width: 30,
        height: 30,
        borderRadius: 999,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: '0 0 auto',
        background: '#5865f2',
        border: '1px solid rgba(255,255,255,0.45)',
        color: '#fff',
        boxShadow: '0 8px 18px rgba(15, 23, 42, 0.24)'
      }}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width="19"
        height="19"
        fill="currentColor"
        focusable="false"
      >
        <path d="M19.3 5.2A16.4 16.4 0 0 0 15.2 4l-.2.4c-.2.4-.4.8-.5 1.2a15 15 0 0 0-5 0c-.2-.4-.3-.8-.6-1.2L8.7 4a16.4 16.4 0 0 0-4 1.2C2.1 9 1.5 12.7 1.9 16.4A16.6 16.6 0 0 0 6.8 19c.4-.5.7-1.1 1-1.7-.6-.2-1.2-.5-1.7-.8l.4-.3c3.3 1.5 7.1 1.5 10.2 0l.4.3c-.5.3-1.1.6-1.7.8.3.6.6 1.2 1 1.7a16.6 16.6 0 0 0 4.9-2.6c.5-4.2-.6-7.9-2-11.2ZM8.7 14.2c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm6.6 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z" />
      </svg>
    </a>
  )
}

export function RootShell({
  children
}: {
  children: React.ReactNode
}) {
  const { user } = useAuth()
  const adminEmails = parseAdminEmails(process.env.NEXT_PUBLIC_ADMIN_EMAILS)
  const canAccessAdmin = isAdminEmail(user?.email, adminEmails)
  const [hasPendingFriendRequests, setHasPendingFriendRequests] = useState(false)
  const [pendingAdminSubmissionsCount, setPendingAdminSubmissionsCount] = useState(0)
  const [hasOverdueAdminSubmissions, setHasOverdueAdminSubmissions] = useState(false)
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
        setPendingAdminSubmissionsCount(0)
        setHasOverdueAdminSubmissions(false)
        return
      }

      const authHeaders = await getAuthHeader()
      const res = await fetch('/api/admin/community/pending-count', {
        headers: authHeaders,
        cache: 'no-store'
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setPendingAdminSubmissionsCount(0)
        setHasOverdueAdminSubmissions(false)
        return
      }

      setPendingAdminSubmissionsCount(Number(data?.pendingCount || 0))
      setHasOverdueAdminSubmissions(Number(data?.overdueCount || 0) > 0)
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
  const hasPendingAdminSubmissions = pendingAdminSubmissionsCount > 0
  const adminSubmissionsAlertColor = hasOverdueAdminSubmissions ? '#dc2626' : '#f59e0b'
  const adminSubmissionsAlertTitle = hasPendingAdminSubmissions
    ? `${pendingAdminSubmissionsCount} contribution(s) en attente${
        hasOverdueAdminSubmissions ? ', dont au moins une depuis plus de 48h' : ''
      }`
    : 'Aucune contribution en attente'
  const accountBadgeContent = user ? (
    <>
      <DiscordInviteLink />
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
    <>
      <DiscordInviteLink />
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
    </>
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
                      title={adminSubmissionsAlertTitle}
                      style={{
                        color: '#fff7ed',
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6
                      }}
                    >
                      Admin
                      {hasPendingAdminSubmissions && (
                        <span
                          aria-label={adminSubmissionsAlertTitle}
                          style={{
                            minWidth: 18,
                            height: 18,
                            padding: '0 5px',
                            borderRadius: 999,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: adminSubmissionsAlertColor,
                            color: '#fff',
                            fontSize: 11,
                            fontWeight: 800,
                            lineHeight: 1
                          }}
                        >
                          {pendingAdminSubmissionsCount > 99 ? '99+' : pendingAdminSubmissionsCount}
                        </span>
                      )}
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
                      src="/bouton_lieu.png?v=1"
                      alt="Lieux"
                      className="root-shell-nav-image"
                      width={96}
                      height={64}
                      unoptimized
                    />
                  </Link>

                  {user && canAccessAdmin && (
                    <Link
                      href="/admin"
                      className="root-shell-admin-link"
                      title={adminSubmissionsAlertTitle}
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
                        position: 'relative',
                        gap: 7,
                        boxShadow: hasPendingAdminSubmissions
                          ? `0 0 0 3px ${hasOverdueAdminSubmissions ? 'rgba(220, 38, 38, 0.9)' : 'rgba(250, 204, 21, 0.98)'}, 0 0 22px ${
                              hasOverdueAdminSubmissions
                                ? 'rgba(220, 38, 38, 0.65)'
                                : 'rgba(245, 158, 11, 0.75)'
                            }`
                          : 'none'
                      }}
                    >
                      <Image src="/op-jolly.svg" alt="" width={13} height={13} />
                      Admin
                      {hasPendingAdminSubmissions && (
                        <span
                          aria-label={adminSubmissionsAlertTitle}
                          style={{
                            minWidth: 22,
                            height: 22,
                            padding: '0 7px',
                            borderRadius: 999,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: adminSubmissionsAlertColor,
                            color: '#fff',
                            border: '1px solid rgba(255,255,255,0.7)',
                            fontSize: 12,
                            fontWeight: 900,
                            lineHeight: 1,
                            boxShadow: '0 6px 16px rgba(15, 23, 42, 0.28)'
                          }}
                        >
                          {pendingAdminSubmissionsCount > 99 ? '99+' : pendingAdminSubmissionsCount}
                        </span>
                      )}
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
                  <DiscordInviteLink />
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
                <>
                  <DiscordInviteLink />
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
                </>
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
