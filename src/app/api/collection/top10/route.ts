import { NextResponse } from 'next/server'
import { getDisplayPrintCode } from '@/lib/cards/printDisplay'
import {
  aggregateCollectionRows,
  fetchAllUserCollectionRows
} from '@/lib/collections/quantities'
import { DEFAULT_LOCALE } from '@/lib/locale'
import { getRequestUserId } from '@/lib/server/authUser'
import { getCatalogueIndex } from '@/lib/server/catalogueIndex'
import { getSetPricing, type PriceSource } from '@/lib/server/setPricing'
import { supabaseServiceServer } from '@/lib/server/supabaseServer'

export const runtime = 'nodejs'

const MISSING_IMAGE_PATH = '__missing__'
const STORAGE_BASE_URL = (
  process.env.NEXT_PUBLIC_IMAGES_BASE_URL ||
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/cards-images`
).replace(/\/$/, '')

function normalizePrintCode(value: string | null | undefined) {
  return (value || '').trim().toUpperCase()
}

export async function GET(request: Request) {
  const startedAt = Date.now()
  const userResult = await getRequestUserId(request)
  if (!userResult.userId) {
    return NextResponse.json(
      { error: userResult.error || 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const [ownedRows, catalogueIndex] = await Promise.all([
      fetchAllUserCollectionRows({
        supabase: supabaseServiceServer,
        userId: userResult.userId
      }),
      getCatalogueIndex()
    ])
    const { totalByPrintId } = aggregateCollectionRows(ownedRows)
    const ownedItems = [...totalByPrintId.entries()]
      .map(([printId, quantity]) => ({
        item: catalogueIndex.itemByPrintId.get(printId),
        quantity
      }))
      .filter((entry) => Boolean(entry.item && entry.quantity > 0))

    const setCodes = [
      ...new Set(ownedItems.map((entry) => entry.item?.set.code).filter(Boolean))
    ] as string[]
    const pricingBySetCode = new Map(
      await Promise.all(
        setCodes.map(async (setCode) => {
          try {
            return [
              setCode,
              await getSetPricing(setCode, { includeTrends: false })
            ] as const
          } catch {
            return [setCode, null] as const
          }
        })
      )
    )

    const rows = ownedItems
      .map(({ item, quantity }) => {
        if (!item) return null
        const printCode = normalizePrintCode(item.print_code)
        const setCode = item.set.code
        const pricing = pricingBySetCode.get(setCode)
        const unitPriceRaw = pricing?.pricesByPrintId[item.id]
        if (!printCode || !Number.isFinite(unitPriceRaw)) return null

        const unitPrice = Number(unitPriceRaw)
        const name =
          item.card?.card_translations?.find(
            (translation) => translation.locale === DEFAULT_LOCALE
          )?.name ||
          item.card?.card_translations?.[0]?.name ||
          item.card?.base_code ||
          printCode

        return {
          printId: item.id,
          printCode,
          displayCode: getDisplayPrintCode(item),
          name,
          setCode,
          quantity,
          unitPrice,
          totalPrice: unitPrice * quantity,
          source: (pricing?.sourcesByPrintId[item.id] || 'us') as PriceSource,
          cardmarketProductId: pricing?.cardmarketProductIdsByPrintId[item.id] || null,
          imageUrl:
            item.image_path && item.image_path !== MISSING_IMAGE_PATH
              ? `${STORAGE_BASE_URL}/${setCode}/${item.image_path}`
              : null
        }
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => b.totalPrice - a.totalPrice || b.unitPrice - a.unitPrice)
      .slice(0, 10)

    return NextResponse.json(
      { rows },
      {
        headers: {
          'Cache-Control': 'private, no-store',
          'Server-Timing': `top10;dur=${Date.now() - startedAt}`
        }
      }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur chargement TOP10'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
