import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getRequestUser } from '@/lib/server/authUser'
import { isAdminEmail, parseAdminEmails } from '@/lib/admin'
import { DEFAULT_LOCALE } from '@/lib/locale'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function normalizeCode(value: string | null | undefined) {
  return (value || '').trim().toUpperCase()
}

type PrintRow = {
  id: string
  print_code: string
  variant_type: string | null
  image_path: string | null
  card_id: string
}

type CardRow = {
  id: string
  base_code: string
  number: string | null
  rarity: string | null
  type: string | null
  card_translations?: Array<{
    name: string
    locale: string
  }> | null
}

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> }
) {
  const userResult = await getRequestUser(request)
  if (!userResult.user) {
    return NextResponse.json(
      { error: userResult.error || 'Unauthorized' },
      { status: 401 }
    )
  }

  const adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS)
  if (!isAdminEmail(userResult.user.email, adminEmails)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const setCode = normalizeCode((await context.params).code)
  const { data: setData, error: setError } = await supabase
    .from('sets')
    .select('id')
    .eq('code', setCode)
    .single()

  if (setError || !setData) {
    return NextResponse.json({ error: 'Set introuvable' }, { status: 404 })
  }

  const { data: printsData, error: printsError } = await supabase
    .from('card_prints')
    .select('id, print_code, variant_type, image_path, card_id')
    .eq('distribution_set_id', setData.id)

  if (printsError) {
    return NextResponse.json(
      { error: `Erreur lecture prints: ${printsError.message}` },
      { status: 500 }
    )
  }

  const prints = (printsData as PrintRow[] | null) || []
  const cardIds = [...new Set(prints.map((row) => row.card_id))]

  const { data: cardsData, error: cardsError } = await supabase
    .from('cards')
    .select(
      `
      id,
      base_code,
      number,
      rarity,
      type,
      card_translations (
        name,
        locale
      )
    `
    )
    .in('id', cardIds)

  if (cardsError) {
    return NextResponse.json(
      { error: `Erreur lecture cards: ${cardsError.message}` },
      { status: 500 }
    )
  }

  const cardsById = new Map<string, CardRow>(
    (((cardsData as CardRow[] | null) || []) as CardRow[]).map((row) => [row.id, row])
  )

  const payload = prints
    .map((print) => {
      const card = cardsById.get(print.card_id)
      const name =
        card?.card_translations?.find((t) => t.locale === DEFAULT_LOCALE)?.name ||
        card?.card_translations?.[0]?.name ||
        card?.base_code ||
        print.print_code

      return {
        id: print.id,
        printCode: print.print_code,
        variantType: print.variant_type || 'normal',
        imagePath: print.image_path,
        cardId: print.card_id,
        baseCode: card?.base_code || '',
        number: card?.number || null,
        rarity: card?.rarity || '',
        type: card?.type || '',
        name
      }
    })
    .sort((a, b) => a.printCode.localeCompare(b.printCode, 'fr', { numeric: true }))

  return NextResponse.json({ prints: payload })
}

