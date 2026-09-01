import { fetchJsonWithAuth } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import type { WishlistItem } from './types'

const STORAGE_BASE_URL = (process.env.EXPO_PUBLIC_IMAGES_BASE_URL || `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/public/cards-images`).replace(/\/$/, '')
const MISSING_IMAGE_PATH = '__missing__'

function normalizeVariantType(value: string | null | undefined): string {
  const raw = (value || '').trim()
  if (!raw) return 'normal'

  const lower = raw.toLowerCase()
  if (lower === 'normal') return 'normal'
  if (lower === 'aa') return 'Parallel'
  if (lower.includes('parallel')) return 'Parallel'
  if (lower.includes('alternate')) return 'Parallel'
  if (lower.includes('pirate foil')) return 'Foil'
  if (lower === 'foil' || lower.endsWith(' foil')) return 'Foil'
  if (lower === 'sp' || lower.includes(' sp')) return 'SP'
  if (lower.includes('manga')) return 'Manga'
  if (lower.includes('wanted poster')) return 'Wanted Poster'
  return 'normal'
}

function getPrintBaseCode(printCode: string | null | undefined): string {
  const code = (printCode || '').trim()
  if (!code) return ''
  return code.split('_')[0]
}

function getPrintVariantLabel(print: {
  print_code?: string | null
  variant_type?: string | null
}): string | null {
  const variant = normalizeVariantType(print.variant_type)
  if (variant !== 'normal') return variant

  const code = (print.print_code || '').trim()
  const suffix = code.split('_')[1] || ''
  if (/^p\d+$/i.test(suffix)) return 'Parallel'
  return null
}

function getDisplayPrintCode(print: {
  print_code?: string | null
  variant_type?: string | null
}): string {
  const base = getPrintBaseCode(print.print_code)
  const label = getPrintVariantLabel(print)
  if (!base) return ''
  if (!label) return base
  return `${base} (${label})`
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getDropMagnitude(value: number | null) {
  return value != null && value < 0 ? -value : 0
}

function calculateInterestIndex(params: {
  trendScore: number | null
  pct1d: number | null
  pct7d: number | null
  pct30d: number | null
  low: number | null
  avg: number | null
  unitPrice: number | null
}) {
  if (params.unitPrice == null) return null

  const baseDrop = getDropMagnitude(params.trendScore)
  const drop1d = getDropMagnitude(params.pct1d)
  const drop7d = getDropMagnitude(params.pct7d)
  const drop30d = getDropMagnitude(params.pct30d)
  const snapshotDrop = drop1d * 0.5 + drop7d * 0.3 + drop30d * 0.2
  const dropScore = baseDrop * 0.7 + snapshotDrop * 0.3

  const spreadScore =
    params.avg && params.avg > 0 && params.low != null && params.low >= 0
      ? clamp((params.avg - params.low) / params.avg, 0, 0.6)
      : 0

  const priceAccessibility = clamp(1 / (1 + params.unitPrice / 60), 0, 1)
  const interestRaw = dropScore * 0.75 + spreadScore * 0.15 + priceAccessibility * 0.1
  return clamp(Math.round(interestRaw * 1000) / 10, 0, 100)
}

async function fetchPricingForSet(setCode: string) {
  return fetchJsonWithAuth<{
    pricesByPrintId?: Record<string, number>
    prices?: Record<string, number>
    cardmarketProductIdsByPrintId?: Record<string, string>
    cardmarketProductIds?: Record<string, string>
    cardmarketRangesByPrintId?: Record<string, { low: number | null; avg: number | null }>
    cardmarketRanges?: Record<string, { low: number | null; avg: number | null }>
    cardmarketTrendsByPrintId?: Record<
      string,
      {
        direction?: 'up' | 'down' | 'flat' | 'unknown'
        score?: number | null
        pct1d?: number | null
        pct7d?: number | null
        pct30d?: number | null
      }
    >
    cardmarketTrends?: Record<
      string,
      {
        direction?: 'up' | 'down' | 'flat' | 'unknown'
        score?: number | null
        pct1d?: number | null
        pct7d?: number | null
        pct30d?: number | null
      }
    >
  }>(`/api/optcg/prices/${encodeURIComponent(setCode)}`)
}

export async function fetchWishlistItems(userId: string): Promise<WishlistItem[]> {
  const { data: wishlistData, error: wishlistError } = await supabase
    .from('wishlists')
    .select('card_print_id')
    .eq('user_id', userId)

  if (wishlistError) {
    throw new Error(`Erreur wishlist: ${wishlistError.message}`)
  }

  const printIds = [
    ...new Set(
      (((wishlistData as Array<{ card_print_id: string }> | null) || []) as Array<{
        card_print_id: string
      }>)
        .map((row) => String(row.card_print_id || '').trim())
        .filter(Boolean)
    )
  ]

  if (printIds.length === 0) {
    return []
  }

  const { data: printData, error: printError } = await supabase
    .from('card_prints')
    .select('id, print_code, variant_type, image_path, distribution_set_id, card_id')
    .in('id', printIds)

  if (printError) {
    throw new Error(`Erreur prints: ${printError.message}`)
  }

  const prints =
    ((printData as Array<{
      id: string
      print_code: string | null
      variant_type: string | null
      image_path: string | null
      distribution_set_id: string
      card_id: string
    }> | null) || []) as Array<{
      id: string
      print_code: string | null
      variant_type: string | null
      image_path: string | null
      distribution_set_id: string
      card_id: string
    }>

  const setIds = [...new Set(prints.map((row) => row.distribution_set_id))]
  const cardIds = [...new Set(prints.map((row) => row.card_id))]

  const [{ data: setsData, error: setsError }, { data: cardsData, error: cardsError }] =
    await Promise.all([
      supabase.from('sets').select('id, code, name').in('id', setIds),
      supabase
        .from('cards')
        .select(
          `
          id,
          rarity,
          type,
          card_translations (
            locale,
            name
          )
        `
        )
        .in('id', cardIds)
    ])

  if (setsError) throw new Error(`Erreur sets: ${setsError.message}`)
  if (cardsError) throw new Error(`Erreur cards: ${cardsError.message}`)

  const setsById = new Map(
    ((((setsData as Array<{ id: string; code: string; name: string | null }> | null) || []) as Array<{
      id: string
      code: string
      name: string | null
    }>)).map((row) => [row.id, row])
  )
  const cardsById = new Map(
    ((((cardsData as Array<{
      id: string
      rarity: string | null
      type: string | null
      card_translations?: Array<{ locale: string; name: string }> | null
    }> | null) || []) as Array<{
      id: string
      rarity: string | null
      type: string | null
      card_translations?: Array<{ locale: string; name: string }> | null
    }>)).map((row) => [row.id, row])
  )

  const pricingBySet = new Map<
    string,
    Awaited<ReturnType<typeof fetchPricingForSet>>
  >()

  for (const setCode of [
    ...new Set(
      prints
        .map((row) => setsById.get(row.distribution_set_id)?.code)
        .filter(Boolean)
    )
  ] as string[]) {
    try {
      const pricing = await fetchPricingForSet(setCode)
      pricingBySet.set(setCode, pricing)
    } catch {
      pricingBySet.set(setCode, {})
    }
  }

  return prints
    .map((print) => {
      const set = setsById.get(print.distribution_set_id)
      const card = cardsById.get(print.card_id)
      const printCode = String(print.print_code || '').trim().toUpperCase()
      const setCode = set?.code || '?'
      const pricing = pricingBySet.get(setCode) || {}
      const unitPriceRaw = pricing.pricesByPrintId?.[print.id] ?? pricing.prices?.[printCode]
      const unitPrice = Number.isFinite(Number(unitPriceRaw)) ? Number(unitPriceRaw) : null
      const range =
        pricing.cardmarketRangesByPrintId?.[print.id] || pricing.cardmarketRanges?.[printCode]
      const trend =
        pricing.cardmarketTrendsByPrintId?.[print.id] || pricing.cardmarketTrends?.[printCode] || {}
      const low = Number.isFinite(Number(range?.low)) ? Number(range?.low) : null
      const avg = Number.isFinite(Number(range?.avg)) ? Number(range?.avg) : null

      return {
        id: print.id,
        setCode,
        setName: set?.name || setCode,
        printCode,
        displayCode: getDisplayPrintCode(print),
        variantLabel: getPrintVariantLabel(print),
        imageUrl:
          print.image_path && print.image_path !== MISSING_IMAGE_PATH
            ? `${STORAGE_BASE_URL}/${setCode}/${print.image_path}`
            : null,
        rarity: card?.rarity || null,
        type: card?.type || null,
        name:
          card?.card_translations?.find((entry) => entry.locale === 'fr')?.name ||
          card?.card_translations?.[0]?.name ||
          printCode ||
          'Carte',
        price: unitPrice,
        cardmarketProductId:
          pricing.cardmarketProductIdsByPrintId?.[print.id] ||
          pricing.cardmarketProductIds?.[printCode] ||
          null,
        low,
        avg,
        trendDirection: trend.direction || 'unknown',
        trendScore: Number.isFinite(Number(trend.score)) ? Number(trend.score) : null,
        trendPct1d: Number.isFinite(Number(trend.pct1d)) ? Number(trend.pct1d) : null,
        trendPct7d: Number.isFinite(Number(trend.pct7d)) ? Number(trend.pct7d) : null,
        trendPct30d: Number.isFinite(Number(trend.pct30d)) ? Number(trend.pct30d) : null,
        interestIndex: calculateInterestIndex({
          trendScore: Number.isFinite(Number(trend.score)) ? Number(trend.score) : null,
          pct1d: Number.isFinite(Number(trend.pct1d)) ? Number(trend.pct1d) : null,
          pct7d: Number.isFinite(Number(trend.pct7d)) ? Number(trend.pct7d) : null,
          pct30d: Number.isFinite(Number(trend.pct30d)) ? Number(trend.pct30d) : null,
          low,
          avg,
          unitPrice
        })
      }
    })
    .sort((a, b) => {
      if (a.setCode !== b.setCode) return a.setCode.localeCompare(b.setCode)
      if ((b.interestIndex || 0) !== (a.interestIndex || 0)) {
        return (b.interestIndex || 0) - (a.interestIndex || 0)
      }
      return a.name.localeCompare(b.name)
    })
}

export function buildCardmarketProductOrSearchUrl(params: {
  productId?: string | number | null
  search: string
}) {
  const locale = 'fr'
  const game = 'OnePiece'
  if (params.productId) {
    return `https://www.cardmarket.com/${locale}/${game}/Products?idProduct=${encodeURIComponent(String(params.productId))}`
  }
  return `https://www.cardmarket.com/${locale}/${game}/Products/Singles?searchMode=v2&idCategory=1621&idExpansion=0&searchString=${encodeURIComponent(
    params.search
  )}&idRarity=0&perSite=30`
}
