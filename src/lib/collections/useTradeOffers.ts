'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { fetchAllUserCollectionRows, type CollectionQuantityRow } from './quantities'
import { COLLECTION_CHANGED_EVENT } from './trades'

export function useTradeOffers(userId: string | null) {
  const [rows, setRows] = useState<CollectionQuantityRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const generation = useRef(0)
  const saving = useRef(false)
  const currentUser = useRef(userId)
  currentUser.current = userId

  const reload = useCallback(async () => {
    const request = ++generation.current
    if (!userId) { setRows([]); setLoading(false); return }
    try {
      const data = await fetchAllUserCollectionRows({ supabase, userId, includeTradeQuantity: true })
      if (request !== generation.current) return
      setRows(data)
      setError(null)
    } catch {
      if (request === generation.current) setError('Les cartes à échanger sont indisponibles pour le moment. Réessaie dans quelques instants.')
    } finally {
      if (request === generation.current) setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    setRows([])
    setLoading(true)
    void reload()
    const refresh = () => { void reload() }
    window.addEventListener(COLLECTION_CHANGED_EVENT, refresh)
    window.addEventListener('focus', refresh)
    return () => {
      // Invalidate all requests, including refreshes started after this effect ran.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++
      window.removeEventListener(COLLECTION_CHANGED_EVENT, refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [reload])

  const save = async (printId: string, language: string, quantity: number) => {
    if (!userId || saving.current) return false
    saving.current = true
    setBusy(true)
    try {
      const { error: mutationError } = await supabase.rpc('set_collection_trade_quantity', {
        p_card_print_id: printId, p_language_code: language, p_quantity: quantity
      })
      if (currentUser.current !== userId) return false
      if (mutationError) {
        await reload()
        setError('Impossible de modifier cette offre. Vérifie les quantités possédées et réessaie.')
        return false
      }
      await reload()
      window.dispatchEvent(new Event(COLLECTION_CHANGED_EVENT))
      return true
    } catch {
      setError('Connexion interrompue. Réessaie pour modifier cette offre.')
      return false
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  return { rows, loading, error, busy, reload, save }
}

export type TradeOffers = ReturnType<typeof useTradeOffers>
