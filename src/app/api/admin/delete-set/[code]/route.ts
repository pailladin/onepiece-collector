import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getRequestUser } from '@/lib/server/authUser'
import { isAdminEmail, parseAdminEmails } from '@/lib/admin'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> }
) {
  const userResult = await getRequestUser(request)
  if (!userResult.user) {
    return NextResponse.json(
      { logs: [userResult.error || 'Unauthorized'] },
      { status: 401 }
    )
  }

  const adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS)
  if (!isAdminEmail(userResult.user.email, adminEmails)) {
    return NextResponse.json({ logs: ['Forbidden'] }, { status: 403 })
  }

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
      logs.push('Set non trouve')
      return NextResponse.json({ logs })
    }

    const setId = setData.id

    const { data: cards } = await supabase
      .from('cards')
      .select('id')
      .eq('base_set_id', setId)
    const cardIds = cards?.map((c) => c.id) || []
    logs.push(`${cardIds.length} cartes trouvees`)

    const { data: printsData, error: printsError } = await supabase
      .from('card_prints')
      .select('id')
      .eq('distribution_set_id', setId)

    if (printsError) {
      logs.push(`Erreur lecture prints: ${printsError.message}`)
      return NextResponse.json({ logs }, { status: 500 })
    }

    const printIds = (printsData || []).map((p) => p.id)
    logs.push(`${printIds.length} prints trouves`)

    if (printIds.length > 0) {
      const { count: linkedCollectionsCount, error: collectionsError } = await supabase
        .from('collections')
        .select('id', { head: true, count: 'exact' })
        .in('card_print_id', printIds)

      if (collectionsError) {
        logs.push(`Erreur verification collections: ${collectionsError.message}`)
        return NextResponse.json({ logs }, { status: 500 })
      }

      if ((linkedCollectionsCount || 0) > 0) {
        logs.push(
          `Suppression annulee: ${linkedCollectionsCount} entree(s) de collection liee(s) au set.`
        )
        logs.push(
          'Pour eviter toute perte de collection, utilisez "Importer" ou "Importer manquantes".'
        )
        return NextResponse.json({ logs }, { status: 409 })
      }
    }

    // Aucun lien de collection: suppression complete autorisee.
    await supabase.from('card_prints').delete().eq('distribution_set_id', setId)
    logs.push('Prints supprimes')

    if (cardIds.length > 0) {
      await supabase.from('card_translations').delete().in('card_id', cardIds)
      logs.push('Traductions supprimees')

      await supabase.from('cards').delete().in('id', cardIds)
      logs.push('Cartes supprimees')
    }

    await supabase.from('sets').delete().eq('id', setId)
    logs.push('Set supprime')
    logs.push('Suppression terminee')

    return NextResponse.json({ logs })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    logs.push(`Erreur: ${message}`)
    return NextResponse.json({ logs }, { status: 500 })
  }
}
