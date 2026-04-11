export type HistoryWeekRow = {
  periodStart: string
  periodEnd: string
  total: {
    value: number
    pricedCount: number
    expectedCount: number
    usFallbackCount: number
    currency: string
  } | null
  sets: Array<{
    setCode: string
    setName: string
    value: number
    pricedCount: number
    expectedCount: number
    usFallbackCount: number
  }>
}

export type HistoryPayload = {
  weeks: HistoryWeekRow[]
}
