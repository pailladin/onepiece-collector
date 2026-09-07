'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { ANALYTICS_CONSENT_KEY, analyticsPath, clearAnalyticsCookies, readAnalyticsConsent, saveAnalyticsConsent } from '@/lib/analytics'
import styles from './GoogleAnalytics.module.css'

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

export function GoogleAnalytics({ measurementId }: { measurementId: string }) {
  const pathname = usePathname()
  const [choice, setChoice] = useState<'accepted' | 'rejected' | null>(null)
  const [ready, setReady] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const initialized = useRef(false)
  const lastPage = useRef<string | null>(null)
  const validId = /^G-[A-Z0-9]+$/.test(measurementId)

  useEffect(() => {
    const sync = () => {
      const saved = readAnalyticsConsent()
      if (initialized.current && saved !== 'accepted') {
        clearAnalyticsCookies()
        window.location.reload()
        return
      }
      setChoice(saved)
      setReady(true)
    }
    // Defer browser storage hydration until after the initial server render.
    const timer = window.setTimeout(sync, 0)
    const onStorage = (event: StorageEvent) => {
      if (event.key === ANALYTICS_CONSENT_KEY || event.key === null) sync()
    }
    window.addEventListener('storage', onStorage)
    return () => { clearTimeout(timer); window.removeEventListener('storage', onStorage) }
  }, [])

  useEffect(() => {
    if (!validId || !ready || choice !== 'accepted') return
    const path = analyticsPath(pathname)
    if (!path) { lastPage.current = null; return }

    if (!initialized.current) {
      window.dataLayer = window.dataLayer || []
      // gtag's command queue expects Arguments objects, not arrays.
      // eslint-disable-next-line prefer-rest-params
      window.gtag = function () { window.dataLayer!.push(arguments) }
      window.gtag('consent', 'default', {
        analytics_storage: 'granted', ad_storage: 'denied',
        ad_user_data: 'denied', ad_personalization: 'denied'
      })
      window.gtag('js', new Date())
      window.gtag('config', measurementId, {
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
        page_location: `${location.origin}${path}`,
        page_referrer: document.referrer ? new URL(document.referrer).origin : '',
        page_title: path
      })
      const script = document.createElement('script')
      script.async = true
      script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`
      script.id = 'opc-google-analytics'
      document.head.appendChild(script)
      initialized.current = true
    }

    if (lastPage.current === pathname) return
    window.gtag?.('event', 'page_view', {
      send_to: measurementId,
      page_location: `${location.origin}${path}`,
      page_title: path,
      page_referrer: lastPage.current
        ? `${location.origin}${analyticsPath(lastPage.current) || '/'}`
        : document.referrer ? new URL(document.referrer).origin : ''
    })
    lastPage.current = pathname
  }, [choice, measurementId, pathname, ready, validId])

  function choose(next: 'accepted' | 'rejected') {
    saveAnalyticsConsent(next)
    setChoice(next)
    setSettingsOpen(false)
    if (next === 'rejected') {
      clearAnalyticsCookies()
      if (initialized.current) {
        // Unload the Google tag entirely when consent is withdrawn.
        Object.assign(window, { [`ga-disable-${measurementId}`]: true })
        window.location.reload()
      }
    }
  }

  if (!validId || !ready) return null
  return (
    <>
      <div className={styles.preferences}>
        <button type="button" onClick={() => setSettingsOpen(true)}>Préférences de statistiques</button>
      </div>
      {(choice === null || settingsOpen) && (
        <section className={styles.banner} aria-label="Choix des cookies de statistiques">
          <div>
            <h2>Un coup de main pour améliorer le site ?</h2>
            <p>Avec ton accord, Google Analytics utilise des cookies pour mesurer les visites et les pages consultées. Tu peux refuser et continuer à utiliser le site, ou modifier ton choix à tout moment en bas de page.</p>
            <a href="https://policies.google.com/privacy?hl=fr" target="_blank" rel="noreferrer">Confidentialité chez Google</a>
          </div>
          <div className={styles.actions}>
            <button type="button" onClick={() => choose('rejected')}>Refuser</button>
            <button type="button" onClick={() => choose('accepted')}>Accepter</button>
            {choice !== null && <button type="button" onClick={() => setSettingsOpen(false)}>Fermer</button>}
          </div>
        </section>
      )}
    </>
  )
}
