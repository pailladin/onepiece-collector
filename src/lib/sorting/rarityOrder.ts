const RARITY_PRIORITY: Record<string, number> = {
  C: 1,
  UC: 2,
  R: 3,
  SR: 4,
  SEC: 5,
  L: 6
}

export function compareRarity(a: string, b: string): number {
  const aValue = RARITY_PRIORITY[a] ?? 99
  const bValue = RARITY_PRIORITY[b] ?? 99

  return aValue - bValue
}
