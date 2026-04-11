import { supabase } from '../../lib/supabase'
import type {
  CollectionOverview,
  CollectionSetCard,
  CollectionSetDetail,
  CollectionSetItem,
  SetRow,
  SetStats
} from './types'

type CollectionQuantityRow = {
  card_print_id: string
  quantity: number | null
  language_code?: string | null
}

type CardPrintSetRow = {
  id: string
  distribution_set_id: string
  print_code: string | null
  variant_type: string | null
}

const STORAGE_BASE_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/public/cards-images`
const MISSING_IMAGE_PATH = '__missing__'
const UNKNOWN_LANGUAGE = 'unknown'

function normalizeVariantType(value: string | null | undefined): string {
  const raw = (value || '').trim().toLowerCase()
  if (!raw) return 'normal'
  if (raw === 'aa') return 'parallel'
  return raw
}

function getPrintBaseCode(printCode: string | null | undefined): string {
  const code = (printCode || '').trim()
  if (!code) return ''
  return code.split('_')[0]
}

function normalizeCollectionLanguage(value: string | null | undefined) {
  const normalized = (value || '').trim().toLowerCase()
  return normalized || UNKNOWN_LANGUAGE
}

function pickEditableLanguage(languageMap: Map<string, number>) {
  const entries = [...languageMap.entries()].sort((a, b) => {
    if (a[1] !== b[1]) return b[1] - a[1]
    if (a[0] === UNKNOWN_LANGUAGE) return -1
    if (b[0] === UNKNOWN_LANGUAGE) return 1
    return a[0].localeCompare(b[0])
  })

  if (entries[0]) {
    return {
      languageCode: entries[0][0],
      quantity: entries[0][1]
    }
  }

  return {
    languageCode: UNKNOWN_LANGUAGE,
    quantity: 0
  }
}

function getPrintVariantLabel(print: {
  print_code?: string | null
  variant_type?: string | null
}): string | null {
  const variant = normalizeVariantType(print.variant_type)
  if (variant !== 'normal') {
    if (variant === 'parallel') return 'Parallel'
    if (variant === 'foil') return 'Foil'
    if (variant === 'sp') return 'SP'
    if (variant === 'manga') return 'Manga'
    if (variant === 'wanted poster') return 'Wanted Poster'
    return variant
  }

  const code = (print.print_code || '').trim()
  const suffix = code.split('_')[1] || ''
  if (/^p\d+$/i.test(suffix)) return 'Parallel'
  return null
}

function getDisplayPrintCode(print: {
  print_code?: string | null
  variant_type?: string | null
}): string {
  const base = getPrintBaseCode(print.print_code)
  const label = getPrintVariantLabel(print)
  if (!base) return ''
  if (!label) return base
  return `${base} (${label})`
}

function getVariantSuffix(value: string | null | undefined): string {
  const normalized = String(value || '').trim().toUpperCase()
  const match = normalized.match(/_(P\d+|V\d+|ALT\d+|SP|MANGA|TR|WP)$/)
  return match?.[1] || ''
}

function isAltVersion(print: { print_code?: string | null; variant_type?: string | null }) {
  return getVariantSuffix(print.print_code) !== '' || normalizeVariantType(print.variant_type) !== 'normal'
}

async function fetchAllCardPrints() {
  const pageSize = 1000
  let from = 0
  const rows: CardPrintSetRow[] = []

  while (true) {
    const to = from + pageSize - 1
    const { data, error } = await supabase
      .from('card_prints')
      .select('id, distribution_set_id, print_code, variant_type')
      .order('id', { ascending: true })
      .range(from, to)

    if (error) throw new Error(error.message)

    const page = (data as CardPrintSetRow[] | null) || []
    rows.push(...page)
    if (page.length < pageSize) break
    from += pageSize
  }

  return rows
}

async function fetchAllUserCollectionRows(userId: string) {
  const pageSize = 1000
  let from = 0
  const rows: CollectionQuantityRow[] = []

  while (true) {
    const to = from + pageSize - 1
    const { data, error } = await supabase
      .from('collections')
      .select('card_print_id, quantity, language_code')
      .eq('user_id', userId)
      .gt('quantity', 0)
      .order('card_print_id', { ascending: true })
      .range(from, to)

    if (error) throw new Error(error.message)

    const page = (data as CollectionQuantityRow[] | null) || []
    rows.push(...page)
    if (page.length < pageSize) break
    from += pageSize
  }

  return rows
}

function aggregateCollectionRows(rows: CollectionQuantityRow[]) {
  const totalByPrintId = new Map<string, number>()
  const byPrintIdLanguage = new Map<string, Map<string, number>>()

  for (const row of rows) {
    const printId = String(row.card_print_id || '').trim()
    const quantity = Number(row.quantity || 0)
    if (!printId || quantity <= 0) continue
    totalByPrintId.set(printId, (totalByPrintId.get(printId) || 0) + quantity)

    const languageCode = normalizeCollectionLanguage(row.language_code)
    if (!byPrintIdLanguage.has(printId)) {
      byPrintIdLanguage.set(printId, new Map<string, number>())
    }
    const languageMap = byPrintIdLanguage.get(printId)!
    languageMap.set(languageCode, (languageMap.get(languageCode) || 0) + quantity)
  }

  return { totalByPrintId, byPrintIdLanguage }
}

export async function fetchCollectionDashboard(userId: string): Promise<{
  overview: CollectionOverview
  sets: CollectionSetCard[]
}> {
  const { data: setsData, error: setsError } = await supabase
    .from('sets')
    .select('id, code, name')
    .order('code')

  if (setsError) throw new Error(setsError.message)

  const [printsData, collectionData] = await Promise.all([
    fetchAllCardPrints(),
    fetchAllUserCollectionRows(userId)
  ])

  const sets = ((setsData as SetRow[] | null) || []) as SetRow[]
  const { totalByPrintId } = aggregateCollectionRows(collectionData)
  const ownedIds = new Set(totalByPrintId.keys())
  const statsByCode: Record<string, SetStats> = {}

  let totalOwnedCards = 0
  for (const quantity of totalByPrintId.values()) {
    totalOwnedCards += quantity
  }

  for (const set of sets) {
    const prints = printsData.filter((row) => row.distribution_set_id === set.id)
    const normalPrints = prints.filter((row) => !isAltVersion(row))
    const altPrints = prints.filter((row) => isAltVersion(row))

    const totalNormal = normalPrints.length
    const totalAlt = altPrints.length
    const total = totalNormal + totalAlt
    const ownedNormal = normalPrints.filter((row) => ownedIds.has(row.id)).length
    const ownedAlt = altPrints.filter((row) => ownedIds.has(row.id)).length
    const owned = ownedNormal + ownedAlt

    statsByCode[set.code] = {
      total,
      owned,
      percent: total > 0 ? Math.round((owned / total) * 100) : 0,
      totalNormal,
      ownedNormal,
      percentNormal: totalNormal > 0 ? Math.round((ownedNormal / totalNormal) * 100) : 0,
      totalAlt,
      ownedAlt,
      percentAlt: totalAlt > 0 ? Math.round((ownedAlt / totalAlt) * 100) : 0
    }
  }

  const ownedSets = sets
    .filter((set) => (statsByCode[set.code]?.owned || 0) > 0)
    .map((set) => ({
      id: set.id,
      code: set.code,
      name: set.name,
      stats: statsByCode[set.code],
      imageUrl: `${STORAGE_BASE_URL}/sets/${set.code}.png`
    }))
    .sort((a, b) => b.stats.percent - a.stats.percent || a.code.localeCompare(b.code))

  const totalTrackedCards = ownedSets.reduce((sum, set) => sum + set.stats.total, 0)
  const totalOwnedUniqueCards = ownedSets.reduce((sum, set) => sum + set.stats.owned, 0)

  return {
    overview: {
      totalOwnedCards,
      totalTrackedCards,
      ownedSetsCount: ownedSets.length,
      overallPercent:
        totalTrackedCards > 0 ? Math.round((totalOwnedUniqueCards / totalTrackedCards) * 100) : 0
    },
    sets: ownedSets
  }
}

export async function fetchCollectionSetDetail(
  userId: string,
  setCode: string
): Promise<CollectionSetDetail> {
  const normalizedCode = String(setCode || '').trim().toUpperCase()

  const { data: setData, error: setError } = await supabase
    .from('sets')
    .select('id, code, name')
    .eq('code', normalizedCode)
    .single()

  if (setError || !setData) {
    throw new Error(setError?.message || 'Set introuvable.')
  }

  const setRow = setData as SetRow

  const { data: printsData, error: printsError } = await supabase
    .from('card_prints')
    .select('id, card_id, print_code, variant_type, image_path')
    .eq('distribution_set_id', setRow.id)

  if (printsError) throw new Error(printsError.message)

  const prints = ((printsData as Array<{
    id: string
    card_id: string
    print_code: string | null
    variant_type: string | null
    image_path: string | null
  }> | null) || []) as Array<{
    id: string
    card_id: string
    print_code: string | null
    variant_type: string | null
    image_path: string | null
  }>

  if (prints.length === 0) {
    return {
      set: {
        id: setRow.id,
        code: setRow.code,
        name: setRow.name,
        imageUrl: `${STORAGE_BASE_URL}/sets/${setRow.code}.png`,
        stats: {
          total: 0,
          owned: 0,
          percent: 0,
          totalNormal: 0,
          ownedNormal: 0,
          percentNormal: 0,
          totalAlt: 0,
          ownedAlt: 0,
          percentAlt: 0
        }
      },
      ownedCount: 0,
      totalCount: 0,
      items: []
    }
  }

  const collectionRows = await fetchAllUserCollectionRows(userId)
  const { totalByPrintId, byPrintIdLanguage } = aggregateCollectionRows(collectionRows)

  const cardIds = [...new Set(prints.map((row) => row.card_id).filter(Boolean))]
  const cardsById = new Map<
    string,
    {
      id: string
      number: string | null
      rarity: string | null
      type: string | null
      card_translations?: Array<{ locale: string; name: string }> | null
    }
  >()

  for (let index = 0; index < cardIds.length; index += 300) {
    const chunk = cardIds.slice(index, index + 300)
    const { data: cardsData, error: cardsError } = await supabase
      .from('cards')
      .select(
        `
        id,
        number,
        rarity,
        type,
        card_translations (
          name,
          locale
        )
      `
      )
      .in('id', chunk)

    if (cardsError) throw new Error(cardsError.message)

    const rows =
      ((cardsData as Array<{
        id: string
        number: string | null
        rarity: string | null
        type: string | null
        card_translations?: Array<{ locale: string; name: string }> | null
      }> | null) || []) as Array<{
        id: string
        number: string | null
        rarity: string | null
        type: string | null
        card_translations?: Array<{ locale: string; name: string }> | null
      }>

    for (const row of rows) cardsById.set(row.id, row)
  }

  const items: CollectionSetItem[] = prints
    .map((print) => {
      const card = cardsById.get(print.card_id)
      const imageUrl =
        print.image_path && print.image_path !== MISSING_IMAGE_PATH
          ? `${STORAGE_BASE_URL}/${setRow.code}/${print.image_path}`
          : null
      const name =
        card?.card_translations?.find((entry) => entry.locale === 'fr')?.name ||
        card?.card_translations?.[0]?.name ||
        getDisplayPrintCode(print) ||
        'Carte'
      const quantity = totalByPrintId.get(print.id) || 0
      const languageMap = byPrintIdLanguage.get(print.id) || new Map<string, number>()
      const editableLanguage = pickEditableLanguage(languageMap)

      return {
        id: print.id,
        printCode: (print.print_code || '').trim().toUpperCase(),
        displayCode: getDisplayPrintCode(print),
        variantLabel: getPrintVariantLabel(print),
        name,
        rarity: String(card?.rarity || '').trim(),
        type: String(card?.type || '').trim(),
        quantity,
        imageUrl,
        editableLanguageCode: editableLanguage.languageCode,
        editableLanguageQuantity: editableLanguage.quantity,
        languageBreakdown: [...languageMap.entries()].map(([languageCode, qty]) => ({
          languageCode,
          quantity: qty
        }))
      }
    })
    .sort((a, b) => {
      if (a.quantity !== b.quantity) return b.quantity - a.quantity
      return a.displayCode.localeCompare(b.displayCode)
    })

  const ownedCount = items.filter((item) => item.quantity > 0).length
  const totalCount = items.length
  const totalNormal = prints.filter((row) => !isAltVersion(row)).length
  const totalAlt = prints.filter((row) => isAltVersion(row)).length
  const ownedNormal = prints.filter((row) => !isAltVersion(row) && (totalByPrintId.get(row.id) || 0) > 0).length
  const ownedAlt = prints.filter((row) => isAltVersion(row) && (totalByPrintId.get(row.id) || 0) > 0).length

  return {
    set: {
      id: setRow.id,
      code: setRow.code,
      name: setRow.name,
      imageUrl: `${STORAGE_BASE_URL}/sets/${setRow.code}.png`,
      stats: {
        total: totalCount,
        owned: ownedCount,
        percent: totalCount > 0 ? Math.round((ownedCount / totalCount) * 100) : 0,
        totalNormal,
        ownedNormal,
        percentNormal: totalNormal > 0 ? Math.round((ownedNormal / totalNormal) * 100) : 0,
        totalAlt,
        ownedAlt,
        percentAlt: totalAlt > 0 ? Math.round((ownedAlt / totalAlt) * 100) : 0
      }
    },
    ownedCount,
    totalCount,
    items
  }
}

export async function updateCollectionItemQuantity(params: {
  userId: string
  printId: string
  languageCode: string
  nextLanguageQuantity: number
}) {
  const normalizedLanguageCode = normalizeCollectionLanguage(params.languageCode)

  if (params.nextLanguageQuantity <= 0) {
    const { error } = await supabase
      .from('collections')
      .delete()
      .eq('user_id', params.userId)
      .eq('card_print_id', params.printId)
      .eq('language_code', normalizedLanguageCode)

    if (error) throw new Error(error.message)
    return
  }

  const { error } = await supabase.from('collections').upsert(
    {
      user_id: params.userId,
      card_print_id: params.printId,
      language_code: normalizedLanguageCode,
      quantity: params.nextLanguageQuantity
    },
    { onConflict: 'user_id,card_print_id,language_code' }
  )

  if (error) throw new Error(error.message)
}
