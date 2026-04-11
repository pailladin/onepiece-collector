import { fetchJsonWithAuth } from '../../lib/api'
import type { HistoryPayload } from './types'

export async function fetchCollectionHistory() {
  return fetchJsonWithAuth<HistoryPayload>('/api/collection/value-history')
}
