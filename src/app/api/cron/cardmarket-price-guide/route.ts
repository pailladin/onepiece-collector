import { NextRequest, NextResponse } from 'next/server'

import { supabaseServiceServer } from '@/lib/server/supabaseServer'

const DEFAULT_SOURCE_PAGE = 'https://www.cardmarket.com/en/Spoils/Data/Price-Guide'
const ONE_PIECE_LINK_REGEX = /href="([^"]*price_guide_18\.json[^"]*)"/i
const ONE_PIECE_TEXT_LINK_REGEX = /<a[^>]*href="([^"]+)"[^>]*>\s*One Piece price guide\s*<\/a>/i
const FILE_NAME = 'price_guide_18.json'

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

async function resolveDownloadUrl(sourcePageUrl: string): Promise<string> {
  const response = await fetch(sourcePageUrl, {
    headers: { 'User-Agent': 'onepiece-collector-cron/1.0' },
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
      'User-Agent': 'onepiece-collector-cron/1.0',
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
  const bucket = process.env.CARDMARKET_PRICE_GUIDE_BUCKET || 'cron'

  const downloadUrl = await resolveDownloadUrl(sourcePageUrl)
  const fileBuffer = await downloadFile(downloadUrl)

  const datedPath = buildDatedPath(new Date())
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

  return {
    ok: true,
    bucket,
    sourcePageUrl,
    downloadUrl,
    files: [datedPath, latestPath],
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
