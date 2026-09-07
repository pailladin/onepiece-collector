export const ANALYTICS_CONSENT_KEY = 'opc.analytics-consent.v1'
const CONSENT_LIFETIME = 180 * 24 * 60 * 60 * 1000

export function readAnalyticsConsent(): 'accepted' | 'rejected' | null {
  try {
    const saved = JSON.parse(localStorage.getItem(ANALYTICS_CONSENT_KEY) || 'null')
    return saved && typeof saved.expiresAt === 'number' && saved.expiresAt > Date.now()
      && (saved.choice === 'accepted' || saved.choice === 'rejected') ? saved.choice : null
  } catch {
    return null
  }
}

export function saveAnalyticsConsent(choice: 'accepted' | 'rejected') {
  try {
    localStorage.setItem(ANALYTICS_CONSENT_KEY, JSON.stringify({ choice, expiresAt: Date.now() + CONSENT_LIFETIME }))
  } catch {
    // The choice still applies to this page if browser storage is unavailable.
  }
}

export function analyticsPath(path: string): string | null {
  if (/^\/(admin|auth|account)(\/|$)/.test(path)) return null
  return path
    .replace(/^(\/share\/(?:set|wishlist))\/[^/]+/, '$1/[token]')
    .replace(/^(\/friends)\/[^/]+/, '$1/[friendId]')
}

export function clearAnalyticsCookies() {
  const domains = location.hostname.split('.')
  for (const cookie of document.cookie.split(';')) {
    const name = cookie.trim().split('=')[0]
    if (!/^_ga(?:_|$)/.test(name)) continue
    document.cookie = `${name}=; Max-Age=0; path=/`
    for (let i = 0; i < domains.length - 1; i++) {
      document.cookie = `${name}=; Max-Age=0; path=/; domain=${domains.slice(i).join('.')}`
    }
  }
}
