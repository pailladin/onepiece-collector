export type DonImportOverrideRow = {
  external_id: string
  suggested_set_code: string | null
  target_set_code: string | null
  is_validated: boolean | null
  notes: string | null
}

export type NormalizedDonApiCard = {
  externalId: string
  baseCode: string
  number: string
  cardName: string
  cardText: string
  rarity: string
  cardType: string
  imageUrl: string
  imageId: string
  optcgDonName: string
  suggestedSetCode: string | null
  suggestedSetLabel: string | null
}

function asTrimmedString(value: unknown) {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

export function normalizeImportSetCode(value: string | null | undefined) {
  return (value || '').replace(/-/g, '').trim().toUpperCase()
}

export function parseDonSuggestedSet(optcgDonName: string | null | undefined) {
  const raw = (optcgDonName || '').trim()
  if (!raw) {
    return {
      suggestedSetCode: null,
      suggestedSetLabel: null
    }
  }

  const match = raw.match(/\(([^()]+)\)\s*$/)
  if (!match?.[1]) {
    return {
      suggestedSetCode: null,
      suggestedSetLabel: raw
    }
  }

  const suggestedSetCode = normalizeImportSetCode(match[1])
  const suggestedSetLabel = raw
    .slice(0, match.index || 0)
    .replace(/\s*-\s*$/, '')
    .trim()

  return {
    suggestedSetCode: suggestedSetCode || null,
    suggestedSetLabel: suggestedSetLabel || null
  }
}

function slugifyFallback(value: string) {
  const slug = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return slug || 'UNKNOWN'
}

function buildDonExternalId(raw: Record<string, unknown>, fallbackIndex: number) {
  const imageId = asTrimmedString(raw.card_image_id)
  if (imageId) return imageId.toUpperCase()

  const optcgDonName = asTrimmedString(raw.optcg_don_name)
  if (optcgDonName) return `DON_${slugifyFallback(optcgDonName)}`

  const cardName = asTrimmedString(raw.card_name)
  if (cardName) return `DON_${slugifyFallback(cardName)}`

  return `DON_${fallbackIndex + 1}`
}

function buildDonBaseCode(externalId: string) {
  const normalized = externalId
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  if (/^DON-\d+$/i.test(normalized)) {
    return normalized
  }

  if (normalized.startsWith('DON-')) {
    return normalized
  }

  return `DON-${normalized || '0'}`
}

function buildDonNumber(baseCode: string, fallbackIndex: number) {
  const match = baseCode.match(/-(\d+)$/)
  if (match?.[1]) return match[1]
  return String(fallbackIndex + 1)
}

export function normalizeDonApiCard(
  rawCard: unknown,
  fallbackIndex: number
): NormalizedDonApiCard | null {
  const row =
    rawCard && typeof rawCard === 'object'
      ? (rawCard as Record<string, unknown>)
      : null
  if (!row) return null

  const externalId = buildDonExternalId(row, fallbackIndex)
  const baseCode = buildDonBaseCode(externalId)
  const optcgDonName = asTrimmedString(row.optcg_don_name)
  const parsedSuggestion = parseDonSuggestedSet(optcgDonName)
  const imageUrl = asTrimmedString(row.card_image)

  return {
    externalId,
    baseCode,
    number: buildDonNumber(baseCode, fallbackIndex),
    cardName: asTrimmedString(row.card_name) || `DON!! Card ${fallbackIndex + 1}`,
    cardText: asTrimmedString(row.card_text),
    rarity: asTrimmedString(row.rarity) || 'DON!!',
    cardType: asTrimmedString(row.card_type) || 'DON!!',
    imageUrl,
    imageId: asTrimmedString(row.card_image_id),
    optcgDonName,
    suggestedSetCode: parsedSuggestion.suggestedSetCode,
    suggestedSetLabel: parsedSuggestion.suggestedSetLabel
  }
}

export function resolveDonTargetSetCode(
  card: Pick<NormalizedDonApiCard, 'suggestedSetCode'>,
  override?: DonImportOverrideRow | null
) {
  const overrideTarget = normalizeImportSetCode(override?.target_set_code)
  const suggestedFromOverride = normalizeImportSetCode(override?.suggested_set_code)
  const suggestedFromCard = normalizeImportSetCode(card.suggestedSetCode)

  const targetSetCode = overrideTarget || suggestedFromOverride || suggestedFromCard || null
  const isValidated = Boolean(override?.is_validated && targetSetCode)

  return {
    targetSetCode,
    isValidated
  }
}
