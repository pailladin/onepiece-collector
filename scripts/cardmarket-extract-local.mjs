#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Local-only extractor for Cardmarket product pages.
 * Usage:
 *   node scripts/cardmarket-extract-local.mjs "https://www.cardmarket.com/fr/OnePiece/Products/Singles/Promos-Japanese/MonkeyDLuffy-P-110"
 *
 * Optional flags:
 *   --headful      Open visible browser (helps if anti-bot challenge appears)
 *   --out <file>   Write JSON output to file
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

function parseArgs(argv) {
  const args = [...argv]
  let url = ''
  let outFile = ''
  let headful = false

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
    if (!value.startsWith('--') && !url) {
      url = value
    }
  }

  return { url, outFile, headful }
}

function normalizeWhitespace(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function inferPrintCode(text) {
  const source = String(text || '').toUpperCase()
  const patterns = [
    /([A-Z]{1,4}\d{0,2}-\d{3,4}[A-Z]?)/g,
    /(P-\d{2,4})/g,
    /(ST\d{2}-\d{3,4}[A-Z]?)/g
  ]
  for (const pattern of patterns) {
    const match = source.match(pattern)
    if (match?.[0]) return match[0]
  }
  return null
}

function cleanProductName(value) {
  return normalizeWhitespace(String(value || '').replace(/\s+-\s+Singles?$/i, ''))
}

function slugPart(value) {
  return normalizeWhitespace(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function parseDonMetaFromName(name) {
  const clean = cleanProductName(name)
  if (!/^DON!!?/i.test(clean)) return null

  const groups = [...clean.matchAll(/\(([^)]+)\)/g)].map((m) => normalizeWhitespace(m[1]))
  if (groups.length === 0) {
    return {
      setHint: null,
      character: 'DON',
      version: null
    }
  }

  const first = groups[0] || ''
  const second = groups[1] || ''

  // First group often contains "<Character> <SET>"
  // Example: "Robin EB03"
  let setHint = null
  const setMatch = first.match(/\b([A-Z]{2}\d{2}|OP\d{2}|ST\d{2}|PRB\d{2}|P-\d{2,4})\b/i)
  if (setMatch?.[1]) {
    setHint = setMatch[1].toUpperCase().replace(/[^A-Z0-9-]/g, '')
  }

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
  return {
    baseCode: code,
    printCode: code
  }
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

async function run() {
  const { url, outFile, headful } = parseArgs(process.argv.slice(2))
  if (!url) {
    console.error('Missing URL.')
    console.error(
      'Example: node scripts/cardmarket-extract-local.mjs "https://www.cardmarket.com/fr/OnePiece/Products/Singles/Promos-Japanese/MonkeyDLuffy-P-110" --headful'
    )
    process.exit(1)
  }

  let chromium
  try {
    ;({ chromium } = await import('playwright'))
  } catch {
    console.error('Playwright is not installed.')
    console.error('Run: npm i -D playwright')
    process.exit(1)
  }

  const browser = await chromium.launch({
    headless: !headful,
    slowMo: headful ? 80 : 0
  })

  try {
    const context = await browser.newContext({
      locale: 'fr-FR',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    })
    const page = await context.newPage()
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })

    // Give dynamic content some time to render.
    await page.waitForTimeout(1200)

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
        // 1) Structured rows where first item is the label.
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

        // 2) Fallback: label element then next sibling text.
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
          const rowText = txt(row.textContent)
          if (!rowText) continue
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

      const canonicalUrl =
        q('link[rel="canonical"]')?.getAttribute('href') || window.location.href

      const ogImage = q('meta[property="og:image"]')?.getAttribute('content') || null

      const breadcrumb = qa('nav a, .breadcrumb a, ol.breadcrumb a')
        .map((el) => txt(el.textContent))
        .filter(Boolean)

      const allLinks = qa('a[href]')
        .map((a) => a.getAttribute('href') || '')
        .filter(Boolean)

      const html = document.documentElement.outerHTML

      const fromLabel = qa('*')
        .map((el) => txt(el.textContent))
        .find((line) => /price trend|from|low|avg|moyenne|tendance/i.test(line))

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
        breadcrumb,
        allLinks,
        snippetPriceText: fromLabel || null,
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

    const productIds = unique(productIdMatches)
    const productId = productIds[0] || null
    const printCode = inferPrintCode(`${data.title} ${data.pageUrl} ${data.description || ''}`)
    const directProductUrl = productId
      ? `https://www.cardmarket.com/en/OnePiece/Products?idProduct=${productId}`
      : null

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
      const ariaCandidates = [
        ...String(data.html || '').matchAll(/aria-label=["']([^"']{1,24})["']/gi)
      ]
        .map((m) => normalizeWhitespace(m[1]))
        .filter(Boolean)
      const rarityLike = ariaCandidates.find((v) =>
        Boolean(normalizeRarity(v))
      )
      if (rarityLike) rarity = normalizeRarity(rarityLike)
    }

    const cleanName = cleanProductName(data.title) || ''
    const donCodes = buildDonCodes(cleanName)
    const finalRarity = rarity || (donCodes ? 'DON!!' : '')
    const detectedType = normalizeWhitespace(data.cardType || typeFromHtml || '')
    const finalType = donCodes ? 'DON' : detectedType

    const simpleResult = {
      base_code: donCodes?.baseCode || printCode,
      print_code: donCodes?.printCode || printCode,
      name: cleanName,
      rarity: finalRarity,
      type: finalType,
      variant_type: 'normal',
      image_url: data.ogImage || null,
      cardmarket_product_id: productId
    }

    const output = JSON.stringify(simpleResult, null, 2)
    if (outFile) {
      const abs = path.resolve(outFile)
      fs.writeFileSync(abs, output, 'utf8')
      console.log(`Saved: ${abs}`)
    }

    console.log(output)
  } finally {
    await browser.close()
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
