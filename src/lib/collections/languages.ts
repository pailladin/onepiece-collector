export const UNKNOWN_LANGUAGE = 'unknown'

export const COLLECTION_LANGUAGE_OPTIONS = [
  { code: UNKNOWN_LANGUAGE, label: 'Sans langue', shortLabel: 'UNK', flag: '🏳️' },
  { code: 'fr', label: 'Francais', shortLabel: 'FR', flag: '🇫🇷' },
  { code: 'en', label: 'English', shortLabel: 'EN', flag: '🇬🇧' },
  { code: 'jp', label: 'Japanese', shortLabel: 'JP', flag: '🇯🇵' },
  { code: 'cn', label: 'Chinese', shortLabel: 'CN', flag: '🇨🇳' }
] as const

export const SET_LANGUAGE_CODES = COLLECTION_LANGUAGE_OPTIONS.filter(
  (option) => option.code !== UNKNOWN_LANGUAGE
).map((option) => option.code)

export function normalizeCollectionLanguage(value: string | null | undefined) {
  const normalized = (value || '').trim().toLowerCase()
  return normalized || UNKNOWN_LANGUAGE
}

export function getCollectionLanguageLabel(value: string | null | undefined) {
  const normalized = normalizeCollectionLanguage(value)
  return (
    COLLECTION_LANGUAGE_OPTIONS.find((option) => option.code === normalized)?.label ||
    normalized.toUpperCase()
  )
}

export function getCollectionLanguageFlag(value: string | null | undefined) {
  const normalized = normalizeCollectionLanguage(value)
  return (
    COLLECTION_LANGUAGE_OPTIONS.find((option) => option.code === normalized)?.flag || '🏳️'
  )
}

export function getCollectionLanguageShortLabel(value: string | null | undefined) {
  const normalized = normalizeCollectionLanguage(value)
  return (
    COLLECTION_LANGUAGE_OPTIONS.find((option) => option.code === normalized)?.shortLabel ||
    normalized.toUpperCase()
  )
}

export function normalizeSetLanguages(values: string[] | null | undefined) {
  const allowed = new Set<string>(SET_LANGUAGE_CODES)
  const normalized = (values || [])
    .map((value) => normalizeCollectionLanguage(value))
    .filter((value) => allowed.has(value))
  return [...new Set(normalized)]
}

export function resolveSetLanguages(values: string[] | null | undefined) {
  const normalized = normalizeSetLanguages(values)
  return normalized.length > 0 ? normalized : [...SET_LANGUAGE_CODES]
}

export function resolveAvailableLanguages(params: {
  setLanguages?: string[] | null
  itemLanguages?: string[] | null
}) {
  const itemLanguages = normalizeSetLanguages(params.itemLanguages)
  if (itemLanguages.length > 0) return itemLanguages
  return resolveSetLanguages(params.setLanguages)
}
