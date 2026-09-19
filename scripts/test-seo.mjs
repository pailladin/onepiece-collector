import assert from 'node:assert/strict'
import { chromium } from 'playwright'

// Run against a production server: npm run build, npm start, then this script.
const origin = process.env.SEO_TEST_URL || 'http://localhost:3000'
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined })
const context = await browser.newContext({ javaScriptEnabled: false })
const page = await context.newPage()

try {
  const sitemapResponse = await context.request.get(`${origin}/sitemap.xml`)
  assert.equal(sitemapResponse.status(), 200)
  const xml = await sitemapResponse.text()
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]))
  assert.equal(new Set(urls.map(String)).size, urls.length, 'Sitemap URLs must be unique')
  assert(urls.every((url) => !/^\/(admin|collection|friends|account|share|auth|community)/.test(url.pathname)))
  const setUrl = urls.find((url) => url.pathname.startsWith('/catalogue/'))
  assert(setUrl, 'At least one set is required for the integration test')
  assert(!setUrl.pathname.split('/').at(-1).includes('-'), 'Set codes must be canonical')
  const placeUrl = urls.find((url) => url.pathname.startsWith('/lieux/'))

  for (const path of ['/', '/catalogue', setUrl.pathname, '/lieux', ...(placeUrl ? [placeUrl.pathname] : [])]) {
    const response = await page.goto(origin + path)
    assert.equal(response.status(), 200, path)
    assert.equal(await page.locator('h1').count(), 1, `One visible main heading: ${path}`)
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href')
    assert.equal(new URL(canonical).pathname, path)
    assert.equal(await page.locator('meta[property="og:url"]').getAttribute('content'), canonical)
    assert(await page.locator('meta[name="description"]').getAttribute('content'))
    assert.equal(await page.locator('meta[name="robots"][content*="noindex"]').count(), 0)
    const schemas = await page.locator('script[type="application/ld+json"]').allTextContents()
    assert(schemas.length > 0, `Structured data: ${path}`)
    schemas.forEach((schema) => JSON.parse(schema))
    if (path === setUrl.pathname) {
      assert(await page.locator('img[alt*=" - "]').count() > 0, 'Card images must be rendered without JavaScript')
      assert(await page.locator('a[href="/catalogue"]').count() > 0)
    }
    if (path === '/lieux' && placeUrl) {
      assert(await page.locator(`a[href="${placeUrl.pathname}"]`).count() > 0, 'Place links must be rendered without JavaScript')
    }
  }

  const redirect = await context.request.get(origin + setUrl.pathname.toLowerCase(), { maxRedirects: 0 })
  assert.equal(redirect.status(), 308)
  assert.equal(new URL(redirect.headers().location, origin).pathname, setUrl.pathname)
  // A crawler that cannot execute streamed JavaScript must receive the right status.
  const missing = await context.request.get(`${origin}/catalogue/SEO-UNKNOWN-SET`, { headers: { 'User-Agent': 'Googlebot' } })
  assert.equal(missing.status(), 404)

  for (const path of ['/account', '/auth', '/collection', '/collection/wishlist', '/friends', '/community', '/community-chat', '/admin', '/share/wishlist/test-token']) {
    await page.goto(origin + path)
    assert(await page.locator('meta[name="robots"][content*="noindex"]').count() > 0, `Private page must be noindex: ${path}`)
    assert.equal(await page.locator('link[rel="canonical"]').count(), 0, `No inherited home canonical: ${path}`)
  }
  const image = await context.request.get(`${origin}/opengraph-image`)
  assert.equal(image.status(), 200)
  assert(image.headers()['content-type'].startsWith('image/png'))

  const interactiveContext = await browser.newContext()
  const interactivePage = await interactiveContext.newPage()
  const errors = []
  interactivePage.on('pageerror', (error) => errors.push(error.message))
  await interactivePage.goto(origin + setUrl.pathname)
  const search = interactivePage.locator('input').first()
  await search.fill('SEO-NO-MATCH-92731')
  await interactivePage.waitForFunction(() => document.querySelectorAll('img[alt*=" - "]').length === 0)
  await search.fill('')
  await interactivePage.locator('img[alt*=" - "]').first().waitFor()
  await interactivePage.goto(origin + '/lieux')
  const placeSearch = interactivePage.locator('input').first()
  const searchResponse = interactivePage.waitForResponse((response) => response.url().includes('/api/places?') && response.status() === 200)
  await placeSearch.fill('SEO-NO-MATCH-92731')
  await searchResponse
  await interactivePage.getByText('Aucun lieu ne correspond a la recherche.').waitFor()
  assert.equal(new URL(interactivePage.url()).searchParams.get('q'), 'SEO-NO-MATCH-92731')
  await placeSearch.fill('')
  if (placeUrl) await interactivePage.locator(`a[href="${placeUrl.pathname}"]`).waitFor()
  assert.deepEqual(errors, [], 'No hydration or runtime errors')
  await interactiveContext.close()
  console.log('PASS: public content without JavaScript, metadata, structured data, sitemap, redirect, 404, private noindex, sharing image and interactive filters.')
} finally {
  await browser.close()
}
