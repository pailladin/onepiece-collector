export function normalizeVariantType(value: string | null | undefined): string {
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

  // Ignore unknown labels (nicknames, notes, etc.) so they don't become variants.
  return 'normal'
}

export function getPrintBaseCode(printCode: string | null | undefined): string {
  const code = (printCode || '').trim()
  if (!code) return ''
  return code.split('_')[0]
}

export function getPrintVariantLabel(print: {
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

export function getDisplayPrintCode(print: {
  print_code?: string | null
  variant_type?: string | null
}): string {
  const base = getPrintBaseCode(print.print_code)
  const label = getPrintVariantLabel(print)

  if (!base) return ''
  if (!label) return base

  return `${base} (${label})`
}
