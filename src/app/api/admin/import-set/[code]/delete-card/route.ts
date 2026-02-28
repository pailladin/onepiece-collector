import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getRequestUser } from '@/lib/server/authUser'
import { isAdminEmail, parseAdminEmails } from '@/lib/admin'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function normalizeCode(value: string) {
  return value.trim().toUpperCase()
}

type CardPrintRow = {
  id: string
  card_id: string
}

export async function POST(
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

  const body = await request.json().catch(() => ({}))
  const mode = String(body?.mode || 'base')
  const targetCode = normalizeCode(String(body?.targetCode || ''))
  const setCode = normalizeCode((await context.params).code)
  const logs: string[] = []

  if (!targetCode) {
    return NextResponse.json({ error: 'targetCode is required' }, { status: 400 })
  }
  if (mode !== 'base' && mode !== 'print') {
    return NextResponse.json({ error: 'mode must be base or print' }, { status: 400 })
  }

  logs.push(`Suppression ${mode === 'base' ? 'carte' : 'print'} ${targetCode} du set ${setCode}`)

  const { data: setData, error: setError } = await supabase
    .from('sets')
    .select('id')
    .eq('code', setCode)
    .single()

  if (setError || !setData) {
    return NextResponse.json({ logs: ['Set introuvable'] }, { status: 404 })
  }

  let prints: CardPrintRow[] = []

  if (mode === 'print') {
    const { data, error } = await supabase
      .from('card_prints')
      .select('id, card_id')
      .eq('distribution_set_id', setData.id)
      .eq('print_code', targetCode)

    if (error) {
      return NextResponse.json(
        { logs: [`Erreur lecture print: ${error.message}`] },
        { status: 500 }
      )
    }

    prints = (data as CardPrintRow[] | null) || []
  } else {
    const { data: cardsData, error: cardError } = await supabase
      .from('cards')
      .select('id')
      .eq('base_code', targetCode)

    if (cardError) {
      return NextResponse.json(
        { logs: [`Erreur lecture card: ${cardError.message}`] },
        { status: 500 }
      )
    }

    const cardIds = (cardsData || []).map((card) => card.id)
    if (cardIds.length === 0) {
      return NextResponse.json({ logs: ['Aucune carte trouvee'] }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('card_prints')
      .select('id, card_id')
      .eq('distribution_set_id', setData.id)
      .in('card_id', cardIds)

    if (error) {
      return NextResponse.json(
        { logs: [`Erreur lecture prints: ${error.message}`] },
        { status: 500 }
      )
    }

    prints = (data as CardPrintRow[] | null) || []
  }

  if (prints.length === 0) {
    return NextResponse.json(
      { logs: ['Aucune print correspondante dans ce set'] },
      { status: 404 }
    )
  }

  const printIds = prints.map((print) => print.id)
  const cardIds = [...new Set(prints.map((print) => print.card_id))]

  const { error: collectionDeleteError } = await supabase
    .from('collections')
    .delete()
    .in('card_print_id', printIds)

  if (collectionDeleteError) {
    logs.push(`Erreur suppression collections: ${collectionDeleteError.message}`)
    return NextResponse.json({ logs }, { status: 500 })
  }
  logs.push(`Collections nettoyees pour ${printIds.length} print(s)`)

  const { error: printsDeleteError } = await supabase
    .from('card_prints')
    .delete()
    .in('id', printIds)

  if (printsDeleteError) {
    logs.push(`Erreur suppression prints: ${printsDeleteError.message}`)
    return NextResponse.json({ logs }, { status: 500 })
  }
  logs.push(`${printIds.length} print(s) supprimee(s)`)

  const { data: remainingPrints, error: remainingError } = await supabase
    .from('card_prints')
    .select('card_id')
    .in('card_id', cardIds)

  if (remainingError) {
    logs.push(`Erreur verification prints restantes: ${remainingError.message}`)
    return NextResponse.json({ logs }, { status: 500 })
  }

  const cardsStillUsed = new Set((remainingPrints || []).map((row) => row.card_id))
  const orphanCardIds = cardIds.filter((cardId) => !cardsStillUsed.has(cardId))

  if (orphanCardIds.length > 0) {
    const { error: translationsError } = await supabase
      .from('card_translations')
      .delete()
      .in('card_id', orphanCardIds)

    if (translationsError) {
      logs.push(`Erreur suppression traductions: ${translationsError.message}`)
      return NextResponse.json({ logs }, { status: 500 })
    }

    const { error: cardsDeleteError } = await supabase
      .from('cards')
      .delete()
      .in('id', orphanCardIds)

    if (cardsDeleteError) {
      logs.push(`Erreur suppression cards: ${cardsDeleteError.message}`)
      return NextResponse.json({ logs }, { status: 500 })
    }

    logs.push(`${orphanCardIds.length} carte(s) orpheline(s) supprimee(s)`)
  }

  logs.push('Suppression terminee')
  return NextResponse.json({ logs })
}
