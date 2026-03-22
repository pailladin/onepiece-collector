export function getSiteUrl() {
  const vercelProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : ''
  const vercelPreviewUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : ''

  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    vercelProductionUrl ||
    vercelPreviewUrl ||
    (process.env.NODE_ENV === 'production'
      ? 'https://onepiece-collector.com'
      : 'http://localhost:3000')

  return raw.replace(/\/+$/, '')
}
