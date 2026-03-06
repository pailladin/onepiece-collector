import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { isAdminEmail, parseAdminEmails } from '@/lib/admin'
import { DEFAULT_LOCALE } from '@/lib/locale'
import { getRequestUser } from '@/lib/server/authUser'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type PrintRow = {
  id: string
  print_code: string
  distribution_set_id: string
  card_id: string
}

type CardRow = {
  id: string
  base_code: string
  rarity: string | null
  card_translations?: Array<{ locale: string; name: string }> | null
}

type SetRow = {
  id: string
  code: string
  name: string | null
}

type PriceGuideExpansionRow = {
  source_expansion_id: string | null
}

type CatalogRow = {
  product_id: string
  name: string | null
  id_expansion: number | null
  id_metacard: number | null
  date_added: string | null
  raw_json: unknown
}

function clean(value: string | null | undefined): string {
  return (value || '').trim().toUpperCase()
}

function basePrintCode(printCode: string): string {
  return clean(printCode).split('_')[0] || clean(printCode)
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function tokenSimilarity(a: string, b: string): number {
  const aTokens = new Set(normalizeText(a).split(' ').filter((token) => token.length >= 2))
  const bTokens = new Set(normalizeText(b).split(' ').filter((token) => token.length >= 2))
  if (aTokens.size === 0 || bTokens.size === 0) return 0
  let common = 0
  for (const token of aTokens) {
    if (bTokens.has(token)) common += 1
  }
  return common / Math.max(aTokens.size, bTokens.size)
}

function nameContainsCode(name: string, code: string): boolean {
  const n = clean(name)
  const c = clean(code)
  if (!n || !c) return false
  return n.includes(`(${c})`) || n.includes(c)
}

function extractSetPrefixFromName(name: string | null): string | null {
  const text = (name || '').toUpperCase()
  const match = text.match(/\(([A-Z0-9]{2,6})-\d{2,4}[A-Z]?\)/)
  return match?.[1] || null
}

function findImageUrlsInRawJson(value: unknown, out: Set<string>) {
  if (typeof value === 'string') {
    if (value.includes('product-images.s3.cardmarket.com')) out.add(value)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) findImageUrlsInRawJson(item, out)
    return
  }
  if (!value || typeof value !== 'object') return
  for (const nested of Object.values(value as Record<string, unknown>)) {
    findImageUrlsInRawJson(nested, out)
  }
}

function buildCandidateImageUrls(params: {
  productId: string
  setCode: string
  name: string | null
  idExpansion: number | null
  rawJson: unknown
}): string[] {
  const urls = new Set<string>()
  const rawUrls = new Set<string>()
  findImageUrlsInRawJson(params.rawJson, rawUrls)
  for (const url of rawUrls) urls.add(url)

  const prefixes = new Set<string>()
  prefixes.add(clean(params.setCode))
  const fromName = extractSetPrefixFromName(params.name)
  if (fromName) prefixes.add(clean(fromName))

  for (const prefix of prefixes) {
    if (!prefix) continue
    urls.add(`https://product-images.s3.cardmarket.com/1621/${prefix}/${params.productId}/${params.productId}.jpg`)
    urls.add(`https://product-images.s3.cardmarket.com/1621/${prefix}/${params.productId}/${params.productId}.png`)
    urls.add(`https://product-images.s3.cardmarket.com/1621/${prefix}/${params.productId}/${params.productId}.webp`)
  }

  if (params.idExpansion != null) {
    const exp = String(params.idExpansion)
    urls.add(`https://product-images.s3.cardmarket.com/1621/${exp}/${params.productId}/${params.productId}.jpg`)
    urls.add(`https://product-images.s3.cardmarket.com/1621/${exp}/${params.productId}/${params.productId}.png`)
    urls.add(`https://product-images.s3.cardmarket.com/1621/${exp}/${params.productId}/${params.productId}.webp`)
  }

  return [...urls]
}

function computeScore(params: {
  row: CatalogRow
  printCode: string
  baseCode: string
  cardName: string
  setCode: string
  rarity: string
}): number {
  const productName = params.row.name || ''
  const printCode = clean(params.printCode)
  const baseCode = clean(params.baseCode)
  const setCode = clean(params.setCode)
  const rarity = clean(params.rarity)
  const normalizedName = clean(productName)

  let score = 0
  if (nameContainsCode(productName, printCode)) score += 70
  if (nameContainsCode(productName, baseCode)) score += 55
  if (nameContainsCode(productName, setCode)) score += 25
  if (rarity && normalizedName.includes(rarity)) score += 6

  score += Math.round(tokenSimilarity(params.cardName, productName) * 30)

  return score
}

async function inferExpansionId(setCode: string): Promise<number | null> {
  const patterns = [setCode, setCode.replace(/-/g, ''), `${setCode.slice(0, -2)}-${setCode.slice(-2)}`]
  for (const pattern of patterns) {
    const value = pattern.trim()
    if (!value) continue
    const { data, error } = await supabase
      .from('cardmarket_price_guide_entries')
      .select('source_expansion_id')
      .ilike('set_code', `%${value}%`)
      .not('source_expansion_id', 'is', null)
      .limit(1)

    if (!error) {
      const row = ((data as PriceGuideExpansionRow[] | null) || [])[0]
      const parsed = Number.parseInt(String(row?.source_expansion_id || ''), 10)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return null
}

export async function GET(request: Request) {
  const userResult = await getRequestUser(request)
  if (!userResult.user) {
    return NextResponse.json(
      { error: userResult.error || 'Unauthorized' },
      { status: 401 }
    )
  }

  const adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS)
  if (!isAdminEmail(userResult.user.email, adminEmails)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const printId = (url.searchParams.get('printId') || '').trim()
  const expansionIdRaw = (url.searchParams.get('expansionId') || '').trim()
  if (!printId) {
    return NextResponse.json({ error: 'printId requis' }, { status: 400 })
  }

  const { data: printData, error: printError } = await supabase
    .from('card_prints')
    .select('id, print_code, distribution_set_id, card_id')
    .eq('id', printId)
    .single()

  if (printError || !printData) {
    return NextResponse.json({ error: 'Print introuvable' }, { status: 404 })
  }

  const print = printData as PrintRow
  const [cardResult, setResult] = await Promise.all([
    supabase
      .from('cards')
      .select(
        `
        id,
        base_code,
        rarity,
        card_translations (
          locale,
          name
        )
      `
      )
      .eq('id', print.card_id)
      .single(),
    supabase
      .from('sets')
      .select('id, code, name')
      .eq('id', print.distribution_set_id)
      .single()
  ])

  if (cardResult.error || !cardResult.data) {
    return NextResponse.json({ error: 'Card introuvable' }, { status: 404 })
  }
  if (setResult.error || !setResult.data) {
    return NextResponse.json({ error: 'Set introuvable' }, { status: 404 })
  }

  const card = cardResult.data as CardRow
  const set = setResult.data as SetRow
  const cardName =
    card.card_translations?.find((t) => t.locale === DEFAULT_LOCALE)?.name ||
    card.card_translations?.[0]?.name ||
    card.base_code

  const printCode = clean(print.print_code)
  const searchCode = basePrintCode(printCode)
  const expansionIdOverride = Number.parseInt(expansionIdRaw, 10)
  const inferredExpansionId = await inferExpansionId(set.code)
  const effectiveExpansionId = Number.isFinite(expansionIdOverride)
    ? expansionIdOverride
    : inferredExpansionId
  const searchUrl = `https://www.cardmarket.com/en/OnePiece/Products/Search?searchMode=v2&idCategory=0&idExpansion=0&searchString=${encodeURIComponent(
    searchCode
  )}&idRarity=0&perSite=30`

  const byCodeQuery = supabase
    .from('cardmarket_catalog_entries')
    .select('product_id, name, id_expansion, id_metacard, date_added, raw_json')
    .ilike('name', `%${searchCode}%`)
    .limit(120)
  const byNameQuery = supabase
    .from('cardmarket_catalog_entries')
    .select('product_id, name, id_expansion, id_metacard, date_added, raw_json')
    .ilike('name', `%${cardName.split(' ').slice(0, 2).join(' ')}%`)
    .limit(120)

  const [byCodeResult, byNameResult] = await Promise.all([
    Number.isFinite(effectiveExpansionId) ? byCodeQuery.eq('id_expansion', effectiveExpansionId) : byCodeQuery,
    Number.isFinite(effectiveExpansionId) ? byNameQuery.eq('id_expansion', effectiveExpansionId) : byNameQuery
  ])

  if (byCodeResult.error) {
    return NextResponse.json(
      { error: `Erreur recherche catalogue: ${byCodeResult.error.message}` },
      { status: 500 }
    )
  }
  if (byNameResult.error) {
    return NextResponse.json(
      { error: `Erreur recherche catalogue: ${byNameResult.error.message}` },
      { status: 500 }
    )
  }

  const map = new Map<string, CatalogRow>()
  for (const row of (byCodeResult.data as CatalogRow[] | null) || []) {
    map.set(row.product_id, row)
  }
  for (const row of (byNameResult.data as CatalogRow[] | null) || []) {
    map.set(row.product_id, row)
  }

  const candidateRows = [...map.values()]
  const candidateProductIds = candidateRows.map((row) => row.product_id)
  const linkedByProductId = new Map<string, string>()

  if (candidateProductIds.length > 0) {
    const { data: linksData, error: linksError } = await supabase
      .from('cardmarket_print_links')
      .select('card_print_id, cardmarket_product_id')
      .in('cardmarket_product_id', candidateProductIds)

    if (linksError) {
      return NextResponse.json(
        { error: `Erreur lecture mappings existants: ${linksError.message}` },
        { status: 500 }
      )
    }

    for (const row of (linksData as Array<{ card_print_id: string; cardmarket_product_id: string }> | null) ||
      []) {
      linkedByProductId.set(row.cardmarket_product_id, row.card_print_id)
    }
  }

  const candidates = candidateRows
    .filter((row) => {
      const linkedPrintId = linkedByProductId.get(row.product_id)
      if (!linkedPrintId) return true
      return linkedPrintId === print.id
    })
    .map((row) => {
      const imageUrls = buildCandidateImageUrls({
        productId: row.product_id,
        setCode: set.code,
        name: row.name,
        idExpansion: row.id_expansion,
        rawJson: row.raw_json
      })
      const score = computeScore({
        row,
        printCode,
        baseCode: card.base_code,
        cardName,
        setCode: set.code,
        rarity: card.rarity || ''
      })
      return {
        imageUrl: imageUrls[0] || '',
        imageFallbackUrls: imageUrls.slice(1),
        proxyImageUrl: imageUrls[0]
          ? `/api/cardmarket/image?src=${encodeURIComponent(imageUrls[0])}`
          : '',
        proxyImageFallbackUrls: imageUrls
          .slice(1)
          .map((url) => `/api/cardmarket/image?src=${encodeURIComponent(url)}`),
        imageCode: row.product_id,
        productId: row.product_id,
        cardmarketUrl: `https://www.cardmarket.com/en/OnePiece/Products?idProduct=${row.product_id}`,
        cardName: row.name,
        score,
        idExpansion: row.id_expansion,
        idMetacard: row.id_metacard
      }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 30)

  return NextResponse.json({
    print: {
      id: print.id,
      printCode: print.print_code,
      baseCode: card.base_code,
      cardName,
      setCode: set.code,
      setName: set.name || set.code
    },
    searchUrl,
    effectiveExpansionId,
    candidates
  })
}
