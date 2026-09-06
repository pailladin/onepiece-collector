const PROMOS_URL = 'https://www.optcgapi.com/api/allPromos/'
const PROMO_SET_NAME = 'Promos Speciales'
const API_TIMEOUT_MS = 20_000
const CACHE_TTL_MS = 15 * 60_000

export type PromoApiCard = {
  set_id: string
  set_name: string
  card_set_id: string
  card_name: string
  rarity: string
  card_type: string
  card_image: string
  card_image_id: string | null
}

type PromoIdentityCard = Pick<PromoApiCard, 'card_set_id' | 'card_name'>

let cachedCatalog: { expiresAt: number; cards: PromoApiCard[] } | null = null
let pendingCatalog: Promise<PromoApiCard[]> | null = null

function asTrimmedString(value: unknown) {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function extractPrintCodeFromImageUrl(value: string) {
  const match = value.match(/\/([^/?#]+)\.(?:jpg|jpeg|png|webp)(?:[?#].*)?$/i)
  return match?.[1]?.trim() || null
}

function extractVariantTag(cardName: string) {
  const groups = Array.from(cardName.matchAll(/\(([^()]*)\)/g)).map((match) =>
    (match[1] || '').trim()
  )
  const tag =
    [...groups].reverse().find((value) => value && !/^\d+$/.test(value)) || null
  return tag?.toLowerCase() === 'reprint' ? null : tag
}

function slugifyVariantTag(value: string | null) {
  const slug = (value || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '')
  return slug || null
}

export function resolvePromoPrintCode(card: PromoIdentityCard) {
  const baseCode = card.card_set_id.trim().toUpperCase()
  const variantSlug = slugifyVariantTag(extractVariantTag(card.card_name))
  return variantSlug ? `${baseCode}_PROMO_${variantSlug}` : baseCode
}

function normalizePromo(rawCard: unknown, fallbackIndex: number) {
  const row =
    rawCard && typeof rawCard === 'object'
      ? (rawCard as Record<string, unknown>)
      : null
  if (!row) return null

  const cardSetId =
    asTrimmedString(row.card_set_id) ||
    asTrimmedString(row.cardSetId) ||
    asTrimmedString(row.print_code) ||
    asTrimmedString(row.printCode) ||
    asTrimmedString(row.card_id) ||
    asTrimmedString(row.cardId) ||
    asTrimmedString(row.id)
  if (!cardSetId) return null

  const cardImage =
    asTrimmedString(row.card_image) ||
    asTrimmedString(row.cardImage) ||
    asTrimmedString(row.image) ||
    asTrimmedString(row.image_url) ||
    asTrimmedString(row.imageUrl)

  return {
    set_id: 'PROMO',
    set_name: PROMO_SET_NAME,
    card_set_id: cardSetId.toUpperCase(),
    card_name:
      asTrimmedString(row.card_name) ||
      asTrimmedString(row.cardName) ||
      asTrimmedString(row.name_en) ||
      asTrimmedString(row.name) ||
      `Promo ${fallbackIndex + 1}`,
    rarity: asTrimmedString(row.rarity) || 'Promo',
    card_type: asTrimmedString(row.card_type) || asTrimmedString(row.type) || 'Promo',
    card_image: cardImage,
    card_image_id:
      asTrimmedString(row.card_image_id) ||
      asTrimmedString(row.cardImageId) ||
      extractPrintCodeFromImageUrl(cardImage) ||
      null
  } satisfies PromoApiCard
}

async function loadPromoCatalog() {
  const controller = new AbortController()
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const operation = (async () => {
    const response = await fetch(PROMOS_URL, { signal: controller.signal })
    if (!response.ok) throw new Error(`Erreur API promos ${response.status}`)

    const raw = await response.json()
    if (!Array.isArray(raw)) throw new Error('Format API promos invalide')

    const cards = raw
      .map((card, index) => normalizePromo(card, index))
      .filter((card): card is PromoApiCard => Boolean(card))
    if (cards.length === 0) throw new Error('Catalogue promos vide')
    return cards
  })()
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort()
      reject(new Error(`API promos: delai depasse (${API_TIMEOUT_MS / 1000}s)`))
    }, API_TIMEOUT_MS)
  })

  try {
    return await Promise.race([operation, timeout])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

export async function getPromoCatalog(): Promise<PromoApiCard[]> {
  if (cachedCatalog && cachedCatalog.expiresAt > Date.now()) {
    return cachedCatalog.cards
  }
  if (pendingCatalog) return pendingCatalog

  pendingCatalog = loadPromoCatalog()
  try {
    const cards = await pendingCatalog
    cachedCatalog = { cards, expiresAt: Date.now() + CACHE_TTL_MS }
    return cards
  } finally {
    pendingCatalog = null
  }
}
