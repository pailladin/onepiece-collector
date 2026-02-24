export type ParsedCode = {
  set: string
  number: number
  variant: number
}

export function parseCardCode(code: string): ParsedCode {
  const [base, variantPart] = code.split('_')
  const [set, numberStr] = base.split('-')

  return {
    set,
    number: parseInt(numberStr, 10),
    variant: variantPart ? parseInt(variantPart.replace('p', ''), 10) : 0
  }
}
