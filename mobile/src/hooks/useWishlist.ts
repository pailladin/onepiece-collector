import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type WishlistRow = {
  card_print_id: string
}

export function useWishlist(userId: string | null | undefined) {
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [busyPrintId, setBusyPrintId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!userId) {
      setWishlistIds(new Set())
      setLoading(false)
      return
    }

    setLoading(true)
    const { data, error } = await supabase
      .from('wishlists')
      .select('card_print_id')
      .eq('user_id', userId)

    if (error) {
      setWishlistIds(new Set())
      setLoading(false)
      return
    }

    setWishlistIds(
      new Set(
        ((((data as WishlistRow[] | null) || []) as WishlistRow[]).map((row) =>
          String(row.card_print_id || '').trim()
        ))
      )
    )
    setLoading(false)
  }, [userId])

  useEffect(() => {
    void reload()
  }, [reload])

  const toggleWishlist = useCallback(
    async (printId: string) => {
      if (!userId || !printId || busyPrintId) return

      const normalizedPrintId = String(printId).trim()
      const isWishlisted = wishlistIds.has(normalizedPrintId)
      setBusyPrintId(normalizedPrintId)

      try {
        if (isWishlisted) {
          const { error } = await supabase
            .from('wishlists')
            .delete()
            .eq('user_id', userId)
            .eq('card_print_id', normalizedPrintId)

          if (error) return

          setWishlistIds((prev) => {
            const next = new Set(prev)
            next.delete(normalizedPrintId)
            return next
          })
          return
        }

        const { error } = await supabase.from('wishlists').insert({
          user_id: userId,
          card_print_id: normalizedPrintId
        })

        if (error) return

        setWishlistIds((prev) => new Set(prev).add(normalizedPrintId))
      } finally {
        setBusyPrintId(null)
      }
    },
    [busyPrintId, userId, wishlistIds]
  )

  return useMemo(
    () => ({
      wishlistIds,
      loading,
      busyPrintId,
      toggleWishlist,
      reload,
      isWishlisted: (printId: string) => wishlistIds.has(String(printId || '').trim())
    }),
    [busyPrintId, loading, reload, toggleWishlist, wishlistIds]
  )
}
