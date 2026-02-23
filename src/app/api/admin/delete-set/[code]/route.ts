import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> }
) {
  const { code } = await context.params
  const logs: string[] = []

  try {
    logs.push(`Suppression du set ${code}`)

    const { data: setData } = await supabase
      .from('sets')
      .select('id')
      .eq('code', code)
      .single()

    if (!setData) {
      logs.push('Set non trouvé')
      return NextResponse.json({ logs })
    }

    const setId = setData.id

    // Récupération des cards du set
    const { data: cards } = await supabase
      .from('cards')
      .select('id')
      .eq('base_set_id', setId)

    const cardIds = cards?.map((c) => c.id) || []

    logs.push(`${cardIds.length} cartes trouvées`)

    // 1️⃣ Supprimer les prints
    await supabase.from('card_prints').delete().eq('distribution_set_id', setId)

    logs.push('Prints supprimés')

    // 2️⃣ Supprimer traductions
    if (cardIds.length > 0) {
      await supabase.from('card_translations').delete().in('card_id', cardIds)

      logs.push('Traductions supprimées')

      await supabase.from('cards').delete().in('id', cardIds)

      logs.push('Cartes supprimées')
    }

    // 3️⃣ Supprimer le set
    await supabase.from('sets').delete().eq('id', setId)

    logs.push('Set supprimé')

    logs.push('Suppression terminée')

    return NextResponse.json({ logs })
  } catch (error: any) {
    logs.push(`Erreur: ${error.message}`)
    return NextResponse.json({ logs }, { status: 500 })
  }
}
