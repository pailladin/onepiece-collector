export const UNKNOWN_LANGUAGE = 'unknown'

export const COLLECTION_LANGUAGE_OPTIONS = [
  { code: UNKNOWN_LANGUAGE, label: 'Sans langue', flag: '🏳️' },
  { code: 'fr', label: 'Francais', flag: '🇫🇷' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'jp', label: 'Japanese', flag: '🇯🇵' },
  { code: 'cn', label: 'Chinese', flag: '🇨🇳' }
] as const

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
