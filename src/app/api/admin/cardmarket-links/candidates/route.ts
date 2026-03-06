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

type CatalogRow = {
  product_id: string
  name: string | null
  id_expansion: number | null
  id_metacard: number | null
  date_added: string | null
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
  const searchUrl = `https://www.cardmarket.com/en/OnePiece/Products/Search?searchMode=v2&idCategory=0&idExpansion=0&searchString=${encodeURIComponent(
    searchCode
  )}&idRarity=0&perSite=30`

  const [byCodeResult, byNameResult] = await Promise.all([
    supabase
      .from('cardmarket_catalog_entries')
      .select('product_id, name, id_expansion, id_metacard, date_added')
      .ilike('name', `%${searchCode}%`)
      .limit(120),
    supabase
      .from('cardmarket_catalog_entries')
      .select('product_id, name, id_expansion, id_metacard, date_added')
      .ilike('name', `%${cardName.split(' ').slice(0, 2).join(' ')}%`)
      .limit(120)
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

  const candidates = [...map.values()]
    .map((row) => {
      const score = computeScore({
        row,
        printCode,
        baseCode: card.base_code,
        cardName,
        setCode: set.code,
        rarity: card.rarity || ''
      })
      return {
        imageUrl: `https://product-images.s3.cardmarket.com/1621/${set.code}/${row.product_id}/${row.product_id}.jpg`,
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
    candidates
  })
}
