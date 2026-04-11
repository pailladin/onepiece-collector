export type SetStats = {
  total: number
  owned: number
  percent: number
  totalNormal: number
  ownedNormal: number
  percentNormal: number
  totalAlt: number
  ownedAlt: number
  percentAlt: number
}

export type SetRow = {
  id: string
  code: string
  name: string
}

export type CollectionSetCard = {
  id: string
  code: string
  name: string
  stats: SetStats
  imageUrl: string
}

export type CollectionOverview = {
  totalOwnedCards: number
  totalTrackedCards: number
  ownedSetsCount: number
  overallPercent: number
}

export type CollectionSetItem = {
  id: string
  printCode: string
  displayCode: string
  variantLabel: string | null
  name: string
  rarity: string
  type: string
  quantity: number
  imageUrl: string | null
  editableLanguageCode: string
  editableLanguageQuantity: number
  languageBreakdown: Array<{
    languageCode: string
    quantity: number
  }>
}

export type CollectionSetDetail = {
  set: CollectionSetCard
  ownedCount: number
  totalCount: number
  items: CollectionSetItem[]
}
