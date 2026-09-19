/** Extract printed identifiers, allowing common OCR confusions only in numeric positions. */
export function extractCardCodes(text: string): string[] {
  const normalized = text.toUpperCase().replace(/[–—−]/g, '-')
  const pattern = /\b((?:[O0]P|ST|EB|PRB)\s*-?\s*[0-9OIL]{2}|P)\s*[-:.]?\s*([0-9OIL]{3})(?![A-Z0-9])/g
  const codes = new Set<string>()
  const digits = (value: string) => value.replace(/O/g, '0').replace(/[IL]/g, '1')
  for (const match of normalized.matchAll(pattern)) {
    const family = match[1].replace(/[\s-]/g, '').replace(/^0P/, 'OP')
    const set = family === 'P' ? 'P' : family.slice(0, -2) + digits(family.slice(-2))
    codes.add(`${set}-${digits(match[2])}`)
  }
  return [...codes]
}

export function normalizeCardCode(value: string): string | null {
  const compact = value.toUpperCase().replace(/\s/g, '').replace(/[–—−]/g, '-')
  const match = compact.match(/^((?:OP|ST|EB|PRB)-?\d{2}|P)-?(\d{3})$/)
  return match ? `${match[1].replace(/-/g, '')}-${match[2]}` : null
}

export function matchesCardCode(item: {
  print_code?: string | null
  card?: { base_code?: string | null } | null
}, code: string): boolean {
  return [item.card?.base_code, item.print_code?.split('_')[0]]
    .some((value) => value && normalizeCardCode(value) === code)
}
