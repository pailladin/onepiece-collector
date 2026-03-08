#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Extract many cards from a Cardmarket listing page (local-only, no Vercel).
 *
 * Usage:
 *   node scripts/cardmarket-extract-list-local.mjs "https://www.cardmarket.com/en/OnePiece/Products/Singles/Heroines-Edition?searchMode=v2&idCategory=1621&idExpansion=6449&idRarity=290&perSite=30" --headful --out tmp/list.json
 *
 * Options:
 *   --headful     Open visible browser
 *   --out <file>  Write JSON array to file
 *   --max <n>     Max number of cards to output (default: 200)
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import readline from 'node:readline'

function parseArgs(argv) {
  const args = [...argv]
  let url = ''
  let outFile = ''
  let headful = false
  let max = 200
  let startDelayMs = 0
  let manualStart = false

  for (let i = 0; i < args.length; i += 1) {
    const value = args[i]
    if (!value) continue
    if (value === '--headful') {
      headful = true
      continue
    }
    if (value === '--out') {
      outFile = args[i + 1] || ''
      i += 1
      continue
    }
    if (value === '--max') {
      const parsed = Number.parseInt(args[i + 1] || '', 10)
      if (Number.isFinite(parsed) && parsed > 0) max = parsed
      i += 1
      continue
    }
    if (value === '--start-delay') {
      const parsed = Number.parseInt(args[i + 1] || '', 10)
      if (Number.isFinite(parsed) && parsed >= 0) startDelayMs = parsed * 1000
      i += 1
      continue
    }
    if (value === '--manual-start') {
      manualStart = true
      continue
    }
    if (!value.startsWith('--') && !url) {
      url = value
    }
  }

  return { url, outFile, headful, max, startDelayMs, manualStart }
}

function normalizeWhitespace(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanProductName(value) {
  return normalizeWhitespace(String(value || '').replace(/\s+-\s+Singles?$/i, ''))
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function slugPart(value) {
  return normalizeWhitespace(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function inferPrintCode(text) {
  const source = String(text || '').toUpperCase()
  const patterns = [
    /([A-Z]{1,4}\d{0,2}-\d{3,4}[A-Z]?)/g,
    /(P-\d{2,4})/g,
    /(ST\d{2}-\d{3,4}[A-Z]?)/g,
    /(EB\d{2})/g
  ]
  for (const pattern of patterns) {
    const match = source.match(pattern)
    if (match?.[0]) return match[0]
  }
  return null
}

function normalizeRarity(value) {
  const raw = normalizeWhitespace(value)
  if (!raw) return ''

  const upper = raw.toUpperCase()
  const compact = upper.replace(/\s+/g, ' ')
  const noSpace = upper.replace(/\s+/g, '')

  const blocked = new Set([
    'ENGLISH',
    'FRENCH',
    'GERMAN',
    'ITALIAN',
    'SPANISH',
    'PORTUGUESE',
    'JAPANESE',
    'KOREAN'
  ])
  if (blocked.has(compact)) return ''

  if (/^DON!?!?$/.test(noSpace)) return 'DON!!'
  if (/^TREASURERARE$/.test(noSpace)) return 'TR'
  if (/^WANTEDPOSTER$/.test(noSpace)) return 'WP'

  const allowed = new Set([
    'C',
    'UC',
    'R',
    'SR',
    'SEC',
    'L',
    'SP',
    'TR',
    'DON!!',
    'DON!'
  ])
  if (allowed.has(compact)) return compact === 'DON!' ? 'DON!!' : compact

  return ''
}

function parseDonMetaFromName(name) {
  const clean = cleanProductName(name)
  if (!/^DON!!?/i.test(clean) && !/\bDON!!?\b/i.test(clean)) return null

  const groups = [...clean.matchAll(/\(([^)]+)\)/g)].map((m) => normalizeWhitespace(m[1]))
  const first = groups[0] || ''
  const second = groups[1] || ''

  let setHint = null
  const setMatch = first.match(/\b([A-Z]{2}\d{2}|OP\d{2}|ST\d{2}|PRB\d{2}|P-\d{2,4})\b/i)
  if (setMatch?.[1]) setHint = setMatch[1].toUpperCase().replace(/[^A-Z0-9-]/g, '')

  const character = normalizeWhitespace(
    first.replace(/\b([A-Z]{2}\d{2}|OP\d{2}|ST\d{2}|PRB\d{2}|P-\d{2,4})\b/gi, '')
  )

  let version = null
  const versionMatch = second.match(/\bV\.?\s*([0-9]+)\b/i)
  if (versionMatch?.[1]) version = `V${versionMatch[1]}`

  return {
    setHint,
    character: character || 'DON',
    version
  }
}

function buildDonCodes(name) {
  const meta = parseDonMetaFromName(name)
  if (!meta) return null

  const setPart = slugPart(meta.setHint || 'GEN')
  const charPart = slugPart(meta.character || 'DON')
  const versionPart = slugPart(meta.version || 'V1')
  const code = `DON-${setPart}-${charPart}-${versionPart}`
  return { baseCode: code, printCode: code }
}

function extractProductIdFromUrl(url) {
  const asText = String(url || '')
  const m1 = asText.match(/[?&]idProduct=(\d+)/i)
  if (m1?.[1]) return m1[1]
  const m2 = asText.match(/\/(\d+)\/\1\.(?:jpg|jpeg|png|webp)(?:[?#].*)?$/i)
  if (m2?.[1]) return m2[1]
  return null
}

async function extractSingleCard(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForTimeout(900)

  const data = await page.evaluate(() => {
    const txt = (v) => (v || '').replace(/\s+/g, ' ').trim()
    const q = (sel) => document.querySelector(sel)
    const qa = (sel) => [...document.querySelectorAll(sel)]
    const cleanKey = (v) =>
      txt(v)
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[:\-]+$/g, '')

    const extractByLabels = (labels) => {
      const wanted = new Set(labels.map((v) => cleanKey(v)))
      for (const row of qa('tr, li, .row, .product-info-row, .product-attributes-row, .specification-row')) {
        const cells = [...row.querySelectorAll('th, td, dt, dd, div, span, strong, b')]
          .map((c) => txt(c.textContent))
          .filter(Boolean)
        if (cells.length < 2) continue
        const key = cleanKey(cells[0])
        if (wanted.has(key)) {
          const value = cells.find((c, idx) => idx > 0 && cleanKey(c) !== key) || ''
          if (value) return value
        }
      }

      for (const el of qa('th, dt, strong, b, span, div')) {
        const key = cleanKey(el.textContent)
        if (!wanted.has(key)) continue
        const next = el.nextElementSibling
        if (next) {
          const value = txt(next.textContent)
          if (value && !wanted.has(cleanKey(value))) return value
        }
      }

      return ''
    }

    const extractAriaByLabel = (labels) => {
      const wanted = new Set(labels.map((v) => cleanKey(v)))
      for (const row of qa('tr, li, .row, .product-info-row, .product-attributes-row, .specification-row')) {
        const cells = [...row.querySelectorAll('th, td, dt, dd, div, span, strong, b')]
          .map((c) => txt(c.textContent))
          .filter(Boolean)
        const first = cleanKey(cells[0] || '')
        if (!wanted.has(first)) continue
        const ariaNode = row.querySelector('[aria-label]')
        const ariaValue = txt(ariaNode?.getAttribute('aria-label'))
        if (ariaValue) return ariaValue
      }
      return ''
    }

    const title =
      txt(q('h1')?.textContent) ||
      txt(q('meta[property="og:title"]')?.getAttribute('content')) ||
      txt(document.title)

    const description = txt(
      q('meta[property="og:description"]')?.getAttribute('content') ||
        q('meta[name="description"]')?.getAttribute('content')
    )

    const canonicalUrl = q('link[rel="canonical"]')?.getAttribute('href') || window.location.href
    const ogImage = q('meta[property="og:image"]')?.getAttribute('content') || null
    const allLinks = qa('a[href]')
      .map((a) => a.getAttribute('href') || '')
      .filter(Boolean)
    const html = document.documentElement.outerHTML

    return {
      title,
      description: description || null,
      canonicalUrl,
      pageUrl: window.location.href,
      ogImage,
      rarity:
        extractByLabels(['Rarity', 'Rarete']) ||
        extractAriaByLabel(['Rarity', 'Rarete']) ||
        txt(q('[data-field="rarity"]')?.textContent) ||
        null,
      cardType:
        extractByLabels(['Card Type', 'Type', 'Categorie']) ||
        txt(q('[data-field="cardType"]')?.textContent) ||
        null,
      allLinks,
      html
    }
  })

  const productIdMatches = unique([
    ...String(data.canonicalUrl || '').matchAll(/idProduct=(\d+)/gi),
    ...String(data.pageUrl || '').matchAll(/idProduct=(\d+)/gi),
    ...String(data.html || '').matchAll(/"idProduct"\s*:\s*(\d+)/gi),
    ...String(data.html || '').matchAll(/idProduct["']?\s*[:=]\s*["']?(\d+)/gi),
    ...String(data.html || '').matchAll(/idProduct=(\d+)/gi)
  ]).map((m) => m[1])

  for (const link of data.allLinks || []) {
    const m = String(link).match(/idProduct=(\d+)/i)
    if (m?.[1]) productIdMatches.push(m[1])
  }

  const productId = unique(productIdMatches)[0] || extractProductIdFromUrl(data.ogImage) || null
  const printCode = inferPrintCode(`${data.title} ${data.pageUrl} ${data.description || ''}`)

  const rarityFromHtml =
    String(data.html || '').match(/>\s*Rarity\s*<\s*\/[^>]+>\s*<[^>]*>\s*([^<]{1,24})\s*</i)?.[1] ||
    String(data.html || '').match(/Rarity[\s\S]{0,900}?aria-label=["']([^"']{1,24})["']/i)?.[1] ||
    String(data.html || '').match(/["']Rarity["']\s*[:,]\s*["']([^"']{1,24})["']/i)?.[1] ||
    null
  const typeFromHtml =
    String(data.html || '').match(/>\s*(?:Card\s*Type|Type)\s*<\s*\/[^>]+>\s*<[^>]*>\s*([^<]{1,24})\s*</i)?.[1] ||
    null

  const cleanedRarity = normalizeWhitespace(data.rarity || rarityFromHtml || '')
  let rarity =
    /printed in|language|seller|price/i.test(cleanedRarity)
      ? ''
      : normalizeRarity(cleanedRarity)

  if (!rarity) {
    const ariaCandidates = [...String(data.html || '').matchAll(/aria-label=["']([^"']{1,24})["']/gi)]
      .map((m) => normalizeWhitespace(m[1]))
      .filter(Boolean)
    const rarityLike = ariaCandidates.find((v) => Boolean(normalizeRarity(v)))
    if (rarityLike) rarity = normalizeRarity(rarityLike)
  }

  const cleanName = cleanProductName(data.title) || ''
  const donCodes = buildDonCodes(cleanName)

  return {
    base_code: donCodes?.baseCode || printCode,
    print_code: donCodes?.printCode || printCode,
    name: cleanName,
    rarity: rarity || (donCodes ? 'DON!!' : ''),
    type: donCodes ? 'DON' : normalizeWhitespace(data.cardType || typeFromHtml || ''),
    variant_type: 'normal',
    image_url: data.ogImage || null,
    cardmarket_product_id: productId
  }
}

async function waitForEnter(message) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })
  await new Promise((resolve) => {
    rl.question(message, () => resolve())
  })
  rl.close()
}

async function run() {
  const { url, outFile, headful, max, startDelayMs, manualStart } = parseArgs(process.argv.slice(2))
  if (!url) {
    console.error('Missing listing URL.')
    process.exit(1)
  }

  let chromium
  try {
    ;({ chromium } = await import('playwright'))
  } catch {
    console.error('Playwright is not installed. Run: npm i -D playwright')
    process.exit(1)
  }

  const browser = await chromium.launch({
    headless: !headful,
    slowMo: headful ? 80 : 0
  })

  try {
    const context = await browser.newContext({
      locale: 'en-US',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    })
    const page = await context.newPage()
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForTimeout(1500)
    if (startDelayMs > 0) {
      process.stderr.write(
        `Waiting ${Math.round(startDelayMs / 1000)}s on first page (captcha/manual check)...\n`
      )
      await page.waitForTimeout(startDelayMs)
    }
    if (manualStart) {
      await waitForEnter('Validation captcha terminee ? Appuie sur Entree pour continuer...')
    }

    // Try to load lazy cards by scrolling.
    for (let i = 0; i < 4; i += 1) {
      await page.mouse.wheel(0, 3000)
      await page.waitForTimeout(350)
    }

    const cards = await page.evaluate(() => {
      const txt = (v) => (v || '').replace(/\s+/g, ' ').trim()
      const asAbs = (href) => {
        try {
          return new URL(href, window.location.origin).toString()
        } catch {
          return ''
        }
      }
      const isProductPageUrl = (href) => {
        try {
          const u = new URL(href, window.location.origin)
          if (!u.pathname.includes('/Products/Singles/')) return false
          const parts = u.pathname.split('/').filter(Boolean)
          const singlesIndex = parts.findIndex((p) => p.toLowerCase() === 'singles')
          if (singlesIndex < 0) return false
          const trailing = parts.slice(singlesIndex + 1)
          // Keep only concrete product page: /Singles/<set>/<product-slug>
          if (trailing.length < 2) return false
          if (!trailing[0] || !trailing[1]) return false
          return true
        } catch {
          return false
        }
      }

      const anchors = [...document.querySelectorAll('a[href*="/Products/Singles/"]')]
      const rows = []

      for (const a of anchors) {
        const href = asAbs(a.getAttribute('href') || '')
        if (!href) continue
        if (!isProductPageUrl(href)) continue

        const text = txt(a.textContent)
        const img = a.querySelector('img')
        const imgSrcRaw =
          img?.getAttribute('src') ||
          img?.getAttribute('data-src') ||
          img?.getAttribute('srcset')?.split(' ')[0] ||
          ''
        const imgSrc = asAbs(imgSrcRaw)

        rows.push({
          href,
          title: text,
          image: imgSrc || null
        })
      }

      // Deduplicate by href, keep first.
      const map = new Map()
      for (const row of rows) {
        if (!row.href || map.has(row.href)) continue
        map.set(row.href, row)
      }
      return [...map.values()]
    })

    const targets = cards.slice(0, max).map((row) => row.href).filter(Boolean)
    const outputRows = []
    for (let i = 0; i < targets.length; i += 1) {
      const productUrl = targets[i]
      process.stderr.write(`[${i + 1}/${targets.length}] ${productUrl}\n`)
      try {
        const row = await extractSingleCard(page, productUrl)
        outputRows.push(row)
      } catch (error) {
        outputRows.push({
          base_code: null,
          print_code: null,
          name: '',
          rarity: '',
          type: '',
          variant_type: 'normal',
          image_url: null,
          cardmarket_product_id: extractProductIdFromUrl(productUrl),
          error: error instanceof Error ? error.message : String(error),
          url: productUrl
        })
      }
      // Reduce bot-detection risk by pacing requests.
      if (i < targets.length - 1) {
        await page.waitForTimeout(5000)
      }
    }

    const json = JSON.stringify(outputRows, null, 2)
    if (outFile) {
      const abs = path.resolve(outFile)
      fs.writeFileSync(abs, json, 'utf8')
      console.log(`Saved: ${abs}`)
    }
    console.log(json)
  } finally {
    await browser.close()
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
