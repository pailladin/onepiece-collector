export type ParsedCode = {
  set: string
  number: number
  variant: number
}

export function parseCardCode(code: string): ParsedCode {
  const normalizedCode = code.trim().toUpperCase()
  const [base, variantPart] = normalizedCode.split('_')
  const donMatch = base.match(/^(DON-[^-]+-[^-]+)-(.+)-V(\d+)$/i)

  // DON!! print codes use the trailing V-number as the visual version.
  // For set sorting we group by the DON family + character slug, then by version.
  if (donMatch) {
    return {
      set: `${donMatch[1]}-${donMatch[2]}`,
      number: parseInt(donMatch[3], 10),
      variant: 0
    }
  }

  const [set, numberStr] = base.split('-')
  const parsedNumber = parseInt(numberStr, 10)
  const parsedVariant = variantPart
    ? parseInt(variantPart.replace('p', ''), 10)
    : 0

  return {
    set,
    number: Number.isNaN(parsedNumber) ? 0 : parsedNumber,
    variant: Number.isNaN(parsedVariant) ? 0 : parsedVariant
  }
}
