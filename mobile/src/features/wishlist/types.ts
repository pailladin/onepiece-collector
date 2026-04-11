export type WishlistItem = {
  id: string
  setCode: string
  setName: string
  printCode: string
  displayCode: string
  variantLabel: string | null
  imageUrl: string | null
  rarity: string | null
  type: string | null
  name: string
  price: number | null
  cardmarketProductId: string | null
  low: number | null
  avg: number | null
  trendDirection: 'up' | 'down' | 'flat' | 'unknown'
  trendScore: number | null
  trendPct1d: number | null
  trendPct7d: number | null
  trendPct30d: number | null
  interestIndex: number | null
}
