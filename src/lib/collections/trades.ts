import type { CollectionQuantityRow } from './quantities'

export const COLLECTION_CHANGED_EVENT = 'opc:collection-changed'

export function offeredCollectionRows(rows: CollectionQuantityRow[]) {
  return rows.map(row => ({
    ...row,
    quantity: Math.min(Math.max(0, row.trade_quantity || 0), Math.max(0, row.quantity || 0))
  })).filter(row => row.quantity > 0)
}
