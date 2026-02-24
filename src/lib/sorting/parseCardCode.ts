export type ParsedCode = {
  set: string
  number: number
  variant: number
}

export function parseCardCode(code: string): ParsedCode {
  const [base, variantPart] = code.split('_')
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
