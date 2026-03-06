import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

function isAllowedImageUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'product-images.s3.cardmarket.com' ||
        url.hostname === 'downloads.s3.cardmarket.com')
    )
  } catch {
    return false
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const src = searchParams.get('src') || ''

  if (!isAllowedImageUrl(src)) {
    return NextResponse.json({ error: 'Invalid image URL' }, { status: 400 })
  }

  const response = await fetch(src, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      Referer: 'https://www.cardmarket.com/'
    },
    cache: 'no-store'
  })

  if (!response.ok) {
    return NextResponse.json(
      { error: `Image fetch failed: ${response.status}` },
      { status: response.status }
    )
  }

  const contentType = response.headers.get('content-type') || 'image/jpeg'
  const cacheControl = response.headers.get('cache-control') || 'public, max-age=3600'
  const body = await response.arrayBuffer()

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': cacheControl
    }
  })
}
