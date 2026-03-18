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

function chunkArray<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return []

  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
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

export async function fetchAllUserCollectionRows(params: {
  supabase: any
  userId: string
}) {
  const pageSize = 1000
  let from = 0
  const rows: CollectionQuantityRow[] = []

  while (true) {
    const to = from + pageSize - 1
    const { data, error } = await params.supabase
      .from('collections')
      .select('card_print_id, quantity, language_code')
      .eq('user_id', params.userId)
      .gt('quantity', 0)
      .order('card_print_id', { ascending: true })
      .order('language_code', { ascending: true, nullsFirst: true })
      .range(from, to)

    if (error) {
      throw new Error(error.message)
    }

    const page = (data as CollectionQuantityRow[] | null) || []
    rows.push(...page)
    if (page.length < pageSize) break
    from += pageSize
  }

  return rows
}

export async function fetchUserCollectionRowsForPrintIds(params: {
  supabase: any
  userId: string
  printIds: string[]
}) {
  const normalizedPrintIds = [...new Set(params.printIds.map((id) => String(id || '').trim()).filter(Boolean))]
  if (normalizedPrintIds.length === 0) return [] as CollectionQuantityRow[]

  const rows: CollectionQuantityRow[] = []

  for (const idsChunk of chunkArray(normalizedPrintIds, 500)) {
    const { data, error } = await params.supabase
      .from('collections')
      .select('card_print_id, quantity, language_code')
      .eq('user_id', params.userId)
      .gt('quantity', 0)
      .in('card_print_id', idsChunk)

    if (error) {
      throw new Error(error.message)
    }

    rows.push(...(((data as CollectionQuantityRow[] | null) || []) as CollectionQuantityRow[]))
  }

  return rows
}
