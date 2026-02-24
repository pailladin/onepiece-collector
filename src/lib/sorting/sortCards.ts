import { parseCardCode } from './parseCardCode'
import { compareRarity } from './rarityOrder'

export type SortKey = 'code' | 'name' | 'rarity' | 'type'

export type SortDirection = 'asc' | 'desc'

export interface Card {
  id: string
  code: string
  name: string
  rarity: string
  type: string
  image_url: string
}

export function sortCards(
  cards: Card[],
  key: SortKey,
  direction: SortDirection = 'asc'
): Card[] {
  const multiplier = direction === 'asc' ? 1 : -1

  return [...cards].sort((a, b) => {
    switch (key) {
      case 'code': {
        const pa = parseCardCode(a.code)
        const pb = parseCardCode(b.code)

        if (pa.set !== pb.set) return pa.set.localeCompare(pb.set) * multiplier

        if (pa.number !== pb.number) return (pa.number - pb.number) * multiplier

        return (pa.variant - pb.variant) * multiplier
      }

      case 'name':
        return a.name.localeCompare(b.name) * multiplier

      case 'rarity':
        return compareRarity(a.rarity, b.rarity) * multiplier

      case 'type':
        return a.type.localeCompare(b.type) * multiplier

      default:
        return 0
    }
  })
}
