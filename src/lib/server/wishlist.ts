import { supabaseServiceServer } from '@/lib/server/supabaseServer'
import { DEFAULT_LOCALE } from '@/lib/locale'

export type WishlistBaseItem = {
  id: string
  setCode: string
  setName: string
  print_code: string | null
  variant_type: string | null
  image_path: string | null
  rarity: string | null
  type: string | null
  name: string
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

export async function fetchWishlistBaseItemsForUser(userId: string): Promise<WishlistBaseItem[]> {
  const { data: wishlistData, error: wishlistError } = await supabaseServiceServer
    .from('wishlists')
    .select('card_print_id')
    .eq('user_id', userId)

  if (wishlistError) {
    throw new Error(`Erreur wishlist: ${wishlistError.message}`)
  }

  const printIds = [
    ...new Set(
      (((wishlistData as Array<{ card_print_id: string }> | null) || []) as Array<{
        card_print_id: string
      }>).map((row) => String(row.card_print_id || '').trim()).filter(Boolean)
    )
  ]

  if (printIds.length === 0) {
    return []
  }

  const printRows: Array<{
    id: string
    print_code: string | null
    variant_type: string | null
    image_path: string | null
    distribution_set_id: string
    card_id: string
  }> = []

  for (const idsChunk of chunkArray(printIds, 300)) {
    const { data, error } = await supabaseServiceServer
      .from('card_prints')
      .select('id, print_code, variant_type, image_path, distribution_set_id, card_id')
      .in('id', idsChunk)

    if (error) {
      throw new Error(`Erreur prints: ${error.message}`)
    }

    printRows.push(
      ...((((data as Array<{
        id: string
        print_code: string | null
        variant_type: string | null
        image_path: string | null
        distribution_set_id: string
        card_id: string
      }> | null) || []) as Array<{
        id: string
        print_code: string | null
        variant_type: string | null
        image_path: string | null
        distribution_set_id: string
        card_id: string
      }>))
    )
  }

  if (printRows.length === 0) {
    return []
  }

  const setIds = [...new Set(printRows.map((row) => row.distribution_set_id))]
  const cardIds = [...new Set(printRows.map((row) => row.card_id))]

  const [{ data: setsData, error: setsError }, { data: cardsData, error: cardsError }] =
    await Promise.all([
      supabaseServiceServer.from('sets').select('id, code, name').in('id', setIds),
      supabaseServiceServer
        .from('cards')
        .select(
          `
            id,
            rarity,
            type,
            card_translations (
              locale,
              name
            )
          `
        )
        .in('id', cardIds)
    ])

  if (setsError) {
    throw new Error(`Erreur sets: ${setsError.message}`)
  }
  if (cardsError) {
    throw new Error(`Erreur cards: ${cardsError.message}`)
  }

  const setsById = new Map(
    ((((setsData as Array<{ id: string; code: string; name: string | null }> | null) || []) as Array<{
      id: string
      code: string
      name: string | null
    }>)).map((row) => [row.id, row])
  )
  const cardsById = new Map(
    ((((cardsData as Array<{
      id: string
      rarity: string | null
      type: string | null
      card_translations?: Array<{ locale: string; name: string }> | null
    }> | null) || []) as Array<{
      id: string
      rarity: string | null
      type: string | null
      card_translations?: Array<{ locale: string; name: string }> | null
    }>)).map((row) => [row.id, row])
  )

  return printRows
    .map((print) => {
      const set = setsById.get(print.distribution_set_id)
      const card = cardsById.get(print.card_id)
      const name =
        card?.card_translations?.find((entry) => entry.locale === DEFAULT_LOCALE)?.name ||
        card?.card_translations?.[0]?.name ||
        print.print_code ||
        'Carte'

      return {
        id: print.id,
        setCode: set?.code || '?',
        setName: set?.name || set?.code || '?',
        print_code: print.print_code,
        variant_type: print.variant_type,
        image_path: print.image_path,
        rarity: card?.rarity || null,
        type: card?.type || null,
        name
      }
    })
    .sort((a, b) => a.setCode.localeCompare(b.setCode) || a.name.localeCompare(b.name))
}

export async function fetchWishlistOwnerName(userId: string): Promise<string> {
  const { data, error } = await supabaseServiceServer
    .from('profiles')
    .select('username')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    throw new Error(`Erreur profil: ${error.message}`)
  }

  return String(data?.username || '').trim() || 'Collectionneur'
}
