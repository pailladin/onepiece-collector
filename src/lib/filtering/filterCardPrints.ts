import { DEFAULT_LOCALE } from '@/lib/locale'
import { getDisplayPrintCode, normalizeVariantType } from '@/lib/cards/printDisplay'
import { parseCardCode } from '@/lib/sorting/parseCardCode'

export type AltFilter = 'all' | 'normal' | 'alt'
export type AltTypeFilter = 'all' | string

export type CardPrintFilterOptions = {
  query?: string
  rarity?: string
  type?: string
  alt?: AltFilter
  altType?: AltTypeFilter
}

export function isAltVersion(print: {
  print_code?: string
  variant_type?: string
}): boolean {
  const parsed = parseCardCode(print.print_code || 'OP00-000')
  const variant = normalizeVariantType(print.variant_type)
  return parsed.variant > 0 || variant !== 'normal'
}

const ALT_TYPE_ORDER: Record<string, number> = {
  parallel: 1,
  foil: 2,
  sp: 3,
  manga: 4,
  'wanted poster': 5
}

const ALLOWED_ALT_TYPES = new Set(['parallel', 'foil', 'sp', 'manga', 'wanted poster'])

export function getAltTypeKey(print: {
  print_code?: string
  variant_type?: string
}): string {
  const parsed = parseCardCode(print.print_code || 'OP00-000')
  const variant = normalizeVariantType(print.variant_type)
  const normalizedVariant = variant.toLowerCase()

  if (ALLOWED_ALT_TYPES.has(normalizedVariant)) return normalizedVariant
  if (parsed.variant > 0) return 'parallel'
  return 'normal'
}

export function getAltTypeLabel(value: string): string {
  const key = (value || '').trim().toLowerCase()
  if (key === 'parallel') return 'Parallel'
  if (key === 'foil') return 'Foil'
  if (key === 'sp') return 'SP'
  if (key === 'manga') return 'Manga'
  if (key === 'wanted poster') return 'Wanted Poster'
  if (!key) return 'Normal'
  return value
}

export function filterCardPrints<T extends any[]>(
  items: T,
  options: CardPrintFilterOptions
): T {
  const query = (options.query || '').trim().toLowerCase()
  const rarity = options.rarity || 'all'
  const type = options.type || 'all'
  const alt = options.alt || 'all'
  const altType = (options.altType || 'all').toLowerCase()

  return items.filter((item: any) => {
    const name =
      item.card?.card_translations?.find((t: any) => t.locale === DEFAULT_LOCALE)
        ?.name || ''

    if (query) {
      const displayCode = getDisplayPrintCode(item)
      const searchable =
        `${item.print_code || ''} ${displayCode} ${name} ${item.variant_type || ''}`.toLowerCase()
      if (!searchable.includes(query)) return false
    }

    if (rarity !== 'all' && item.card?.rarity !== rarity) return false
    if (type !== 'all' && item.card?.type !== type) return false

    const altVersion = isAltVersion(item)
    if (alt === 'alt' && !altVersion) return false
    if (alt === 'normal' && altVersion) return false
    if (altType !== 'all' && getAltTypeKey(item) !== altType) return false

    return true
  }) as T
}

export function getFilterOptions(items: any[]) {
  const rarities = Array.from(
    new Set(items.map((item) => item.card?.rarity).filter(Boolean))
  ).sort((a, b) => String(a).localeCompare(String(b)))

  const types = Array.from(
    new Set(items.map((item) => item.card?.type).filter(Boolean))
  ).sort((a, b) => String(a).localeCompare(String(b)))

  const altTypes = Array.from(
    new Set(items.map((item) => getAltTypeKey(item)).filter((v) => v !== 'normal'))
  ).sort((a, b) => (ALT_TYPE_ORDER[a] ?? 99) - (ALT_TYPE_ORDER[b] ?? 99))

  return { rarities, types, altTypes }
}
