import { parseCardCode } from './parseCardCode'

type CardPrintLike = {
  print_code?: string | null
  variant_type?: string | null
  card?: {
    type?: string | null
  } | null
}

type CompareCardPrintNumberOptions = {
  fallbackSetCode: string
  directionMultiplier: 1 | -1
  nameA: string
  nameB: string
  variantPriority: Record<string, number>
}

export function isDonCardType(type: string | null | undefined) {
  const normalized = (type || '').trim().toUpperCase()
  return normalized === 'DON' || normalized === 'DON!!'
}

export function compareCardPrintNumberSort(
  a: CardPrintLike,
  b: CardPrintLike,
  options: CompareCardPrintNumberOptions
) {
  const isDonA = isDonCardType(a.card?.type)
  const isDonB = isDonCardType(b.card?.type)

  if (isDonA !== isDonB) return isDonA ? 1 : -1

  if (isDonA && isDonB) {
    const byName = options.nameA.localeCompare(options.nameB, 'fr', { numeric: true })
    if (byName !== 0) return byName * options.directionMultiplier
    return String(a.print_code || '').localeCompare(String(b.print_code || ''), 'fr', {
      numeric: true
    })
  }

  const parsedA = parseCardCode(a.print_code || `${options.fallbackSetCode}-0`)
  const parsedB = parseCardCode(b.print_code || `${options.fallbackSetCode}-0`)

  if (parsedA.set !== parsedB.set) {
    return parsedA.set.localeCompare(parsedB.set) * options.directionMultiplier
  }

  if (parsedA.number !== parsedB.number) {
    return (parsedA.number - parsedB.number) * options.directionMultiplier
  }

  if (parsedA.variant !== parsedB.variant) {
    return (parsedA.variant - parsedB.variant) * options.directionMultiplier
  }

  const varA = options.variantPriority[a.variant_type ?? ''] ?? 99
  const varB = options.variantPriority[b.variant_type ?? ''] ?? 99
  return (varA - varB) * options.directionMultiplier
}
