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

    const simpleResult = {
      base_code: printCode,
      print_code: printCode,
      name: normalizeWhitespace(data.title) || '',
      rarity: '',
      type: '',
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
