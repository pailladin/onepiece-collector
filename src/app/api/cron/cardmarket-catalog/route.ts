import { NextRequest, NextResponse } from 'next/server'

import { supabaseServiceServer } from '@/lib/server/supabaseServer'

const DEFAULT_CATALOG_URL =
  'https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_18.json'
const FILE_NAME = 'products_singles_18.json'
const DB_TABLE = 'cardmarket_catalog_entries'
const UPSERT_CHUNK_SIZE = 2000

type CatalogItem = {
  idProduct?: number | string
  name?: string
  idCategory?: number | string
  categoryName?: string
  idExpansion?: number | string
  idMetacard?: number | string
  dateAdded?: string
}

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false
  const authHeader = request.headers.get('authorization')
  return authHeader === `Bearer ${cronSecret}`
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function subtractDays(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000)
}

function buildDatedPath(date: Date): string {
  const y = String(date.getUTCFullYear())
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `cardmarket/catalog/${y}-${m}-${d}/${FILE_NAME}`
}

function asText(value: unknown): string | null {
  if (value == null) return null
  const normalized = String(value).trim()
  return normalized ? normalized : null
}

function asInt(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : null
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value.trim(), 10)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function parseCatalog(fileBuffer: ArrayBuffer): CatalogItem[] {
  const jsonText = new TextDecoder('utf-8').decode(fileBuffer)
  const parsed = JSON.parse(jsonText) as unknown
  if (Array.isArray(parsed)) {
    return parsed as CatalogItem[]
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Catalog JSON has unsupported format')
  }

  const root = parsed as Record<string, unknown>
  const directKeys = ['products', 'product', 'data', 'items', 'rows', 'result']

  for (const key of directKeys) {
    const value = root[key]
    if (Array.isArray(value)) {
      return value as CatalogItem[]
    }
  }

  for (const value of Object.values(root)) {
    if (Array.isArray(value)) {
      return value as CatalogItem[]
    }
    if (value && typeof value === 'object') {
      const nested = value as Record<string, unknown>
      for (const nestedValue of Object.values(nested)) {
        if (Array.isArray(nestedValue)) {
          return nestedValue as CatalogItem[]
        }
      }
    }
  }

  throw new Error('Catalog JSON is not an array and no array field was found')
}

function toDbRows(items: CatalogItem[], refreshDate: string) {
  return items
    .map((item) => {
      const productId = asText(item.idProduct)
      if (!productId) return null
      return {
        product_id: productId,
        name: asText(item.name),
        id_category: asInt(item.idCategory),
        category_name: asText(item.categoryName),
        id_expansion: asInt(item.idExpansion),
        id_metacard: asInt(item.idMetacard),
        date_added: asText(item.dateAdded),
        raw_json: item,
        last_seen_on: refreshDate
      }
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
}

async function upsertCatalog(items: CatalogItem[], refreshDate: string) {
  const rows = toDbRows(items, refreshDate)

  for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK_SIZE)
    const { error } = await supabaseServiceServer.from(DB_TABLE).upsert(chunk, {
      onConflict: 'product_id'
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

  return rows.length
}

async function runJob() {
  const catalogUrl = process.env.CARDMARKET_CATALOG_URL || DEFAULT_CATALOG_URL
  const bucket = process.env.CARDMARKET_PRICE_GUIDE_BUCKET || 'cron'

  const response = await fetch(catalogUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      Accept: 'application/json,text/plain,*/*'
    },
    cache: 'no-store'
  })

  if (!response.ok) {
    throw new Error(`Cannot download cardmarket catalog: ${response.status}`)
  }

  const fileBuffer = await response.arrayBuffer()
  const items = parseCatalog(fileBuffer)
  if (items.length === 0) {
    throw new Error('Catalog downloaded but empty')
  }

  const now = new Date()
  const refreshDate = toIsoDate(now)
  const datedPath = buildDatedPath(now)
  const previousDayPath = buildDatedPath(subtractDays(now, 1))
  const latestPath = `cardmarket/catalog/latest/${FILE_NAME}`

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

  const upserted = await upsertCatalog(items, refreshDate)

  return {
    ok: true,
    bucket,
    catalogUrl,
    files: [datedPath, latestPath],
    removedFiles: [previousDayPath],
    dbTable: DB_TABLE,
    dbRowsUpserted: upserted,
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
