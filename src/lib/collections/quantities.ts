import {
  getCollectionLanguageFlag,
  getCollectionLanguageLabel,
  getCollectionLanguageShortLabel,
  normalizeCollectionLanguage
} from '@/lib/collections/languages'

export type CollectionQuantityRow = {
  card_print_id: string
  quantity: number | null
  language_code?: string | null
}

export function aggregateCollectionRows(rows: CollectionQuantityRow[] | null | undefined) {
  const totalByPrintId = new Map<string, number>()
  const byPrintIdLanguage = new Map<string, Map<string, number>>()

  for (const row of rows || []) {
    const printId = String(row.card_print_id || '').trim()
    const quantity = Number(row.quantity || 0)
    if (!printId || quantity <= 0) continue

    const languageCode = normalizeCollectionLanguage(row.language_code)
    totalByPrintId.set(printId, (totalByPrintId.get(printId) || 0) + quantity)

    if (!byPrintIdLanguage.has(printId)) {
      byPrintIdLanguage.set(printId, new Map<string, number>())
    }
    const languageMap = byPrintIdLanguage.get(printId)!
    languageMap.set(languageCode, (languageMap.get(languageCode) || 0) + quantity)
  }

  return { totalByPrintId, byPrintIdLanguage }
}

export function getLanguageBreakdownEntries(
  languageMap: Map<string, number> | null | undefined
) {
  return [...(languageMap?.entries() || [])]
    .filter(([, quantity]) => quantity > 0)
    .sort((a, b) => {
      if (a[0] === 'unknown') return -1
      if (b[0] === 'unknown') return 1
      return a[0].localeCompare(b[0])
    })
    .map(([languageCode, quantity]) => ({
      languageCode,
      quantity,
      label: getCollectionLanguageLabel(languageCode),
      shortLabel: getCollectionLanguageShortLabel(languageCode),
      flag: getCollectionLanguageFlag(languageCode)
    }))
}
