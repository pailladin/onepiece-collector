import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeCollectionLanguage } from '@/lib/collections/languages'

type ChangeQuantityParams = {
  supabase: SupabaseClient
  userId: string
  printId: string
  languageCode: string
  delta: number
  currentQuantity: number
}

const queues = new Map<string, Promise<number>>()

function isMissingRpc(error: { code?: string | null; message?: string | null }) {
  return (
    error.code === 'PGRST202' ||
    error.code === '42883' ||
    String(error.message || '').includes('change_collection_quantity')
  )
}

async function changeQuantityNow(
  params: ChangeQuantityParams,
  currentQuantity: number
): Promise<number> {
  const languageCode = normalizeCollectionLanguage(params.languageCode)
  const { data, error } = await params.supabase.rpc('change_collection_quantity', {
    p_card_print_id: params.printId,
    p_language_code: languageCode,
    p_delta: params.delta
  })

  if (!error) return Math.max(0, Number(data) || 0)
  if (!isMissingRpc(error)) throw new Error(error.message)

  // Compatibilite tant que la migration SQL n'a pas encore ete executee.
  const nextQuantity = Math.max(0, currentQuantity + params.delta)
  if (nextQuantity === 0) {
    const fallback = await params.supabase
      .from('collections')
      .delete()
      .eq('user_id', params.userId)
      .eq('card_print_id', params.printId)
      .eq('language_code', languageCode)
    if (fallback.error) throw new Error(fallback.error.message)
  } else {
    const fallback = await params.supabase.from('collections').upsert(
      {
        user_id: params.userId,
        card_print_id: params.printId,
        language_code: languageCode,
        quantity: nextQuantity
      },
      { onConflict: 'user_id,card_print_id,language_code' }
    )
    if (fallback.error) throw new Error(fallback.error.message)
  }

  return nextQuantity
}

export function changeCollectionQuantity(params: ChangeQuantityParams): Promise<number> {
  const key = `${params.userId}:${params.printId}:${normalizeCollectionLanguage(params.languageCode)}`
  const previous = queues.get(key) || Promise.resolve(params.currentQuantity)
  const pending = previous
    .catch(() => params.currentQuantity)
    .then((currentQuantity) => changeQuantityNow(params, currentQuantity))

  queues.set(key, pending)
  void pending.finally(() => {
    if (queues.get(key) === pending) queues.delete(key)
  }).catch(() => undefined)
  return pending
}
