import { NextRequest, NextResponse } from 'next/server'

import { supabaseServiceServer } from '@/lib/server/supabaseServer'

const DEFAULT_SOURCE_PAGE = 'https://www.cardmarket.com/en/Spoils/Data/Price-Guide'
const ONE_PIECE_LINK_REGEX = /href="([^"]*price_guide_18\.json[^"]*)"/i
const ONE_PIECE_TEXT_LINK_REGEX = /<a[^>]*href="([^"]+)"[^>]*>\s*One Piece price guide\s*<\/a>/i
const FILE_NAME = 'price_guide_18.json'
const DB_TABLE = 'cardmarket_price_guide_entries'
const UPSERT_CHUNK_SIZE = 500

function absoluteUrl(base: string, maybeRelative: string): string {
  try {
    return new URL(maybeRelative).toString()
  } catch {
    return new URL(maybeRelative, base).toString()
  }
}

function buildDatedPath(date: Date): string {
  const y = String(date.getUTCFullYear())
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `cardmarket/price-guide/${y}-${m}-${d}/${FILE_NAME}`
}

function subtractDays(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000)
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function normalizeKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function getValueByKeys(row: Record<string, unknown>, keys: string[]): unknown {
  const wanted = new Set(keys.map((key) => normalizeKey(key)))
  for (const [rawKey, value] of Object.entries(row)) {
    if (wanted.has(normalizeKey(rawKey))) return value
  }
  return undefined
}

function asString(value: unknown): string | null {
  if (value == null) return null
  const str = String(value).trim()
  return str ? str : null
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const normalized = value.trim().replace(',', '.')
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function buildEntryKey(
  row: Record<string, unknown>,
  rowIndex: number
): { entryKey: string; productId: string | null } {
  const productId = asString(
    getValueByKeys(row, [
      'idProduct',
      'productId',
      'idArticle',
      'articleId',
      'id',
      'article'
    ])
  )
  if (productId) return { entryKey: `product:${productId}`, productId }

  const printCode = asString(
    getValueByKeys(row, ['printCode', 'cardImageId', 'card_id', 'cardNumber'])
  )
  if (printCode) return { entryKey: `print:${printCode.toUpperCase()}`, productId: null }

  const cardName = asString(getValueByKeys(row, ['name', 'cardName', 'productName'])) || 'unknown'
  return { entryKey: `row:${rowIndex}:${cardName}`, productId: null }
}

function findRowsInPayload(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.map(toRecord).filter((row): row is Record<string, unknown> => Boolean(row))
  }

  const root = toRecord(payload)
  if (!root) return []

  const directCandidates = [
    'data',
    'items',
    'rows',
    'products',
    'articles',
    'priceGuide',
    'price_guide',
    'result'
  ]
  for (const key of directCandidates) {
    const value = getValueByKeys(root, [key])
    if (Array.isArray(value)) {
      return value.map(toRecord).filter((row): row is Record<string, unknown> => Boolean(row))
    }
  }

  for (const value of Object.values(root)) {
    if (Array.isArray(value)) {
      const rows = value.map(toRecord).filter((row): row is Record<string, unknown> => Boolean(row))
      if (rows.length) return rows
    }
  }

  return []
}

function parsePriceGuideRows(fileBuffer: ArrayBuffer): Record<string, unknown>[] {
  const jsonText = new TextDecoder('utf-8').decode(fileBuffer)
  const payload = JSON.parse(jsonText) as unknown
  return findRowsInPayload(payload)
}

function toDbRows(rows: Record<string, unknown>[], refreshDate: string) {
  return rows.map((row, rowIndex) => {
    const { entryKey, productId } = buildEntryKey(row, rowIndex)
    const printCode = asString(
      getValueByKeys(row, ['printCode', 'cardImageId', 'card_id', 'cardNumber'])
    )

    return {
      entry_key: entryKey,
      product_id: productId,
      print_code: printCode ? printCode.toUpperCase() : null,
      card_name: asString(getValueByKeys(row, ['name', 'cardName', 'productName'])),
      set_code: asString(getValueByKeys(row, ['setCode', 'expansionCode', 'set', 'expansion'])),
      rarity: asString(getValueByKeys(row, ['rarity', 'rarityName'])),
      trend_price: asNumber(getValueByKeys(row, ['trendPrice', 'priceTrend', 'avg1'])),
      low_price: asNumber(getValueByKeys(row, ['lowPrice', 'priceLow', 'sell', 'fromPrice'])),
      avg_price: asNumber(getValueByKeys(row, ['averagePrice', 'avgPrice', 'avg'])),
      reverse_holo_trend: asNumber(getValueByKeys(row, ['reverseHoloTrend', 'reverseTrend'])),
      lowex_plus_trend: asNumber(getValueByKeys(row, ['lowexPlusTrend', 'lowExPlusTrend'])),
      available: asNumber(getValueByKeys(row, ['available', 'countAvailable', 'itemsAvailable'])),
      source_game_id: asString(getValueByKeys(row, ['idGame', 'gameId'])),
      source_expansion_id: asString(getValueByKeys(row, ['idExpansion', 'expansionId'])),
      currency: asString(getValueByKeys(row, ['currency'])) || 'EUR',
      raw_json: row,
      last_seen_on: refreshDate
    }
  })
}

async function upsertPriceGuideRows(rows: Record<string, unknown>[], refreshDate: string) {
  const dbRows = toDbRows(rows, refreshDate)

  for (let i = 0; i < dbRows.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = dbRows.slice(i, i + UPSERT_CHUNK_SIZE)
    const { error } = await supabaseServiceServer.from(DB_TABLE).upsert(chunk, {
      onConflict: 'entry_key'
    })
    if (error) {
      throw new Error(`DB upsert failed (${DB_TABLE}): ${error.message}`)
    }
  }

  const { error: cleanupError } = await supabaseServiceServer
    .from(DB_TABLE)
    .delete()
    .lt('last_seen_on', refreshDate)
  if (cleanupError) {
    throw new Error(`DB cleanup failed (${DB_TABLE}): ${cleanupError.message}`)
  }
}

async function resolveDownloadUrl(sourcePageUrl: string): Promise<string> {
  const response = await fetch(sourcePageUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8',
      Referer: 'https://www.cardmarket.com/'
    },
    cache: 'no-store'
  })

  if (!response.ok) {
    throw new Error(`Cannot load Cardmarket source page: ${response.status}`)
  }

  const html = await response.text()
  const byFileName = html.match(ONE_PIECE_LINK_REGEX)
  if (byFileName?.[1]) return absoluteUrl(sourcePageUrl, byFileName[1])

  const byText = html.match(ONE_PIECE_TEXT_LINK_REGEX)
  if (byText?.[1]) return absoluteUrl(sourcePageUrl, byText[1])

  throw new Error('One Piece price guide link not found on Cardmarket page')
}

async function downloadFile(downloadUrl: string): Promise<ArrayBuffer> {
  const response = await fetch(downloadUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      Accept: 'application/json,text/plain,*/*',
      'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8',
      Referer: 'https://www.cardmarket.com/'
    },
    cache: 'no-store'
  })

  if (!response.ok) {
    throw new Error(`Cannot download price guide file: ${response.status}`)
  }

  return response.arrayBuffer()
}

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false

  const authHeader = request.headers.get('authorization')
  return authHeader === `Bearer ${cronSecret}`
}

async function runJob() {
  const sourcePageUrl = process.env.CARDMARKET_PRICE_GUIDE_SOURCE_URL || DEFAULT_SOURCE_PAGE
  const directDownloadUrl = process.env.CARDMARKET_PRICE_GUIDE_DIRECT_URL
  const bucket = process.env.CARDMARKET_PRICE_GUIDE_BUCKET || 'cron'

  const downloadUrl = directDownloadUrl || (await resolveDownloadUrl(sourcePageUrl))
  const fileBuffer = await downloadFile(downloadUrl)
  const parsedRows = parsePriceGuideRows(fileBuffer)
  if (parsedRows.length === 0) {
    throw new Error('Price guide JSON parsed but no rows were found')
  }

  const now = new Date()
  const refreshDate = toIsoDate(now)
  const datedPath = buildDatedPath(now)
  const previousDayPath = buildDatedPath(subtractDays(now, 1))
  const latestPath = `cardmarket/price-guide/latest/${FILE_NAME}`

  const [datedUpload, latestUpload] = await Promise.all([
    supabaseServiceServer.storage.from(bucket).upload(datedPath, fileBuffer, {
      upsert: true,
      contentType: 'application/json'
    }),
    supabaseServiceServer.storage.from(bucket).upload(latestPath, fileBuffer, {
      upsert: true,
      contentType: 'application/json'
    })
  ])

  if (datedUpload.error) {
    throw new Error(`Upload failed (${datedPath}): ${datedUpload.error.message}`)
  }

  if (latestUpload.error) {
    throw new Error(`Upload failed (${latestPath}): ${latestUpload.error.message}`)
  }

  const removeResult = await supabaseServiceServer.storage.from(bucket).remove([previousDayPath])
  if (removeResult.error) {
    throw new Error(`Cleanup failed (${previousDayPath}): ${removeResult.error.message}`)
  }

  await upsertPriceGuideRows(parsedRows, refreshDate)

  return {
    ok: true,
    bucket,
    sourcePageUrl,
    downloadUrl,
    files: [datedPath, latestPath],
    removedFiles: [previousDayPath],
    dbTable: DB_TABLE,
    dbRowsUpserted: parsedRows.length,
    bytes: fileBuffer.byteLength,
    executedAt: new Date().toISOString()
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const payload = await runJob()
    return NextResponse.json(payload)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
