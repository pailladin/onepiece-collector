import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
require('@next/env').loadEnvConfig(process.cwd())
const origin = process.env.SCANNER_TEST_URL || 'http://localhost:3000'
const supabaseOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined })
const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
const user = { id: '00000000-0000-4000-8000-000000000099', email: 'scanner-test@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {}, identities: [], created_at: new Date().toISOString() }
const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' })).toString('base64url')}.test-signature`
await context.addInitScript(({ key, user, token }) => {
  localStorage.setItem('opc.analytics-consent.v1', JSON.stringify({ choice: 'rejected', expiresAt: Date.now() + 86400000 }))
  localStorage.setItem(key, JSON.stringify({ access_token: token, refresh_token: 'test-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user }))
}, { key: `sb-${new URL(supabaseOrigin).hostname.split('.')[0]}-auth-token`, user, token })

let writes = []
// All Supabase traffic is mocked; this test can never change a real collection.
await context.route(`${supabaseOrigin}/**`, async (route) => {
  const request = route.request()
  const url = new URL(request.url())
  if (url.pathname === '/auth/v1/user') return route.fulfill({ json: user })
  if (url.pathname === '/rest/v1/rpc/change_collection_quantity') {
    writes.push(request.postDataJSON())
    await new Promise((resolve) => setTimeout(resolve, 300))
    return route.fulfill({ json: 5 })
  }
  if (request.method() !== 'GET' && request.method() !== 'HEAD') throw new Error(`Unexpected write: ${url.pathname}`)
  if (url.pathname === '/rest/v1/collections') return route.fulfill({ json: { quantity: 3 } })
  return route.fulfill({ json: [] })
})
const item = { id: '00000000-0000-4000-8000-000000000001', print_code: 'OP01-001', variant_type: 'normal', image_path: null, available_languages: ['fr', 'en'], set: { code: 'OP01', name: 'Romance Dawn', availableLanguages: ['fr', 'en'] }, card: { base_code: 'OP01-001', rarity: 'L', card_translations: [{ locale: 'fr', name: 'Test Luffy' }] } }
await context.route('**/api/catalogue/scan?*', (route) => {
  const code = new URL(route.request().url()).searchParams.get('code')
  return route.fulfill({ json: { code, items: code === 'OP01-001' ? [item, { ...item, id: '00000000-0000-4000-8000-000000000002', print_code: 'OP01-001_p1', variant_type: 'Parallel' }] : [] } })
})
const page = await context.newPage()
const errors = []
const ocrRequests = []
page.on('pageerror', (error) => errors.push(error.message))
context.on('request', (request) => {
  if (request.url().includes('/ocr/')) ocrRequests.push(request.url())
})
try {
  await page.goto(`${origin}/collection/scan`)
  assert.equal(ocrRequests.length, 0, 'OCR assets should load only when a photo is selected')
  const raster = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 900; canvas.height = 1250
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 900, 1250)
    ctx.fillStyle = 'black'; ctx.font = 'bold 60px Arial'
    ctx.fillText('ONE PIECE CARD GAME', 45, 120)
    ctx.fillText('OP01-001', 450, 1150)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  await page.getByLabel('Choisir une image', { exact: true }).setInputFiles({ name: 'test-card.png', mimeType: 'image/png', buffer: Buffer.from(raster, 'base64') })
  await page.getByRole('heading', { name: '3. Choisis l’illustration exacte' }).waitFor({ timeout: 90_000 })
  assert.equal(await page.getByLabel('Numéro de carte', { exact: true }).inputValue(), 'OP01-001')
  assert(ocrRequests.some((url) => url.includes('eng.traineddata.gz')), 'Use the real local OCR model')
  assert(ocrRequests.every((url) => url.startsWith(origin)), 'OCR assets must be self-hosted')
  assert.equal(writes.length, 0, 'Recognition must never add a card automatically')
  await page.getByRole('button', { name: /Test Luffy.*Parallel/ }).click()
  await page.getByLabel('Langue', { exact: true }).selectOption('fr')
  await page.getByLabel('Quantité à ajouter').fill('2')
  assert.equal(writes.length, 0, 'Selection must not add a card')
  await page.getByRole('button', { name: 'Confirmer et ajouter' }).dblclick()
  await page.getByText(/Total pour cette version et cette langue : 5/).waitFor()
  assert.equal(writes.length, 1, 'Double tap must cause one mutation')
  assert.deepEqual(writes[0], { p_card_print_id: '00000000-0000-4000-8000-000000000002', p_language_code: 'fr', p_delta: 2 })
  assert(await page.getByRole('button', { name: 'Confirmer et ajouter' }).isDisabled())
  await page.getByRole('button', { name: 'Scanner une autre carte' }).click()
  await page.getByLabel('Numéro de carte', { exact: true }).fill('OP99-999')
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click()
  await page.getByText(/Aucune carte trouvée pour OP99-999/).waitFor()
  await page.getByLabel('Choisir une image', { exact: true }).setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not an image') })
  await page.getByRole('alert').filter({ hasText: 'Photo illisible' }).waitFor()
  await page.getByLabel('Numéro de carte', { exact: true }).fill('OP01-001')
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click()
  await page.getByRole('heading', { name: '3. Choisis l’illustration exacte' }).waitFor()
  assert.equal(writes.length, 1, 'Manual lookup must not mutate collections')

  await context.route('**/ocr/worker.min.js', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500))
    await route.continue()
  })
  await page.getByLabel('Choisir une image', { exact: true }).setInputFiles({ name: 'cancel.png', mimeType: 'image/png', buffer: Buffer.from(raster, 'base64') })
  await page.getByRole('button', { name: 'Annuler', exact: true }).click()
  await page.getByLabel('Numéro de carte', { exact: true }).fill('OP99-999')
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click()
  await page.getByText(/Aucune carte trouvée pour OP99-999/).waitFor()
  await page.waitForTimeout(1000)
  assert.equal(await page.getByLabel('Numéro de carte', { exact: true }).inputValue(), 'OP99-999', 'Cancelled OCR must not overwrite a later search')

  const guestContext = await browser.newContext()
  await guestContext.route(`${supabaseOrigin}/**`, (route) => route.fulfill({ json: [] }))
  await guestContext.route('**/api/catalogue/scan?*', (route) => route.fulfill({ json: { code: 'OP01-001', items: [item] } }))
  const guestPage = await guestContext.newPage()
  await guestPage.goto(`${origin}/collection/scan`)
  await guestPage.getByLabel('Numéro de carte', { exact: true }).fill('OP01-001')
  await guestPage.getByRole('button', { name: 'Rechercher', exact: true }).click()
  await guestPage.getByRole('button', { name: /Test Luffy/ }).click()
  await guestPage.getByRole('link', { name: 'Connecte-toi', exact: true }).waitFor()
  assert.equal(await guestPage.getByRole('button', { name: 'Confirmer et ajouter' }).count(), 0)
  await guestContext.close()
  assert.deepEqual(errors, [])
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'No horizontal overflow on mobile')
  console.log('PASS: real browser OCR on a synthetic photo, local assets, explicit variant/language/quantity confirmation, double-tap protection, corrupt photo fallback, cancellation, guest access, manual lookup and mobile layout. Database writes mocked.')
} catch (error) {
  console.error((await page.locator('main').innerText()).slice(-2200))
  console.error('Browser errors:', errors)
  throw error
} finally {
  await browser.close()
}
