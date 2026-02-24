import { DEFAULT_LOCALE } from '@/lib/locale'
import { parseCardCode } from '@/lib/sorting/parseCardCode'

export type AltFilter = 'all' | 'normal' | 'alt'

export type CardPrintFilterOptions = {
  query?: string
  rarity?: string
  type?: string
  alt?: AltFilter
}

export function isAltVersion(print: {
  print_code?: string
  variant_type?: string
}): boolean {
  const parsed = parseCardCode(print.print_code || 'OP00-000')
  return parsed.variant > 0 || print.variant_type !== 'normal'
}

export function filterCardPrints<T extends any[]>(
  items: T,
  options: CardPrintFilterOptions
): T {
  const query = (options.query || '').trim().toLowerCase()
  const rarity = options.rarity || 'all'
  const type = options.type || 'all'
  const alt = options.alt || 'all'

  return items.filter((item: any) => {
    const name =
      item.card?.card_translations?.find((t: any) => t.locale === DEFAULT_LOCALE)
        ?.name || ''

    if (query) {
      const searchable = `${item.print_code || ''} ${name}`.toLowerCase()
      if (!searchable.includes(query)) return false
    }

    if (rarity !== 'all' && item.card?.rarity !== rarity) return false
    if (type !== 'all' && item.card?.type !== type) return false

    const altVersion = isAltVersion(item)
    if (alt === 'alt' && !altVersion) return false
    if (alt === 'normal' && altVersion) return false

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

  return { rarities, types }
}
