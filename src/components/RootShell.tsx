'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import styles from './RootShell.module.css'
import { NavigationIcon } from './NavigationIcon'
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
      className={styles.discord}
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
  const pathname = usePathname()

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
        className={styles.accountLink}
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
        className={styles.logout}

      >
        Déconnexion
      </button>
    </>
  ) : (
    <>
      <DiscordInviteLink />
      <Link
        href="/auth"
        className={styles.login}
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
        <header className={styles.header}>
          <div className={styles.inner}>
            <Link href="/" className={styles.brand} aria-label="One Piece Collector — Accueil">
              <Image src="/maison_pirate.png?v=1" alt="" width={84} height={56} unoptimized />
              <span>ONE PIECE<small>COLLECTOR</small></span>
            </Link>
            <nav className={styles.nav} aria-label="Navigation principale">
              {([
                { href: '/catalogue', label: 'Catalogue', icon: 'catalogue', visible: true },
                { href: '/collection', label: 'Ma Collection', icon: 'collection', visible: !!user },
                { href: '/friends', label: 'Amis', icon: 'friends', visible: !!user },
                { href: '/community', label: 'Contributions', icon: 'community', visible: !!user },
                { href: '/lieux', label: 'Lieux', icon: 'places', visible: true },
                { href: '/admin', label: 'Admin', icon: 'admin', visible: !!user && canAccessAdmin }
              ] as const).filter(item => item.visible).map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={styles.navLink}
                  aria-current={pathname === item.href || pathname.startsWith(item.href + '/') ? 'page' : undefined}
                  title={item.icon === 'admin' ? adminSubmissionsAlertTitle : undefined}
                >
                  <NavigationIcon name={item.icon} />
                  <span>{item.label}</span>
                  {item.icon === 'friends' && hasPendingFriendRequests && (
                    <span className={styles.notification} role="status" aria-label="Demandes d’amis en attente" />
                  )}
                  {item.icon === 'admin' && hasPendingAdminSubmissions && (
                    <span className={styles.count} style={{ background: adminSubmissionsAlertColor }} aria-label={adminSubmissionsAlertTitle}>
                      {pendingAdminSubmissionsCount > 99 ? '99+' : pendingAdminSubmissionsCount}
                    </span>
                  )}
                </Link>
              ))}
            </nav>
            <div className={styles.account}>{accountBadgeContent}</div>
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
