import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getRequestUser } from '@/lib/server/authUser'
import { isAdminEmail, parseAdminEmails } from '@/lib/admin'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const IN_CHUNK_SIZE = 200

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

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
  const body = await request.json().catch(() => ({}))
  const forceDelete = Boolean(body?.forceDelete)
  const deleteToken = String(body?.deleteToken || '').trim()
  const logs: string[] = []

  const expectedDeleteToken = String(process.env.CRON_SECRET || '').trim()
  if (!expectedDeleteToken) {
    return NextResponse.json(
      { logs: ['Configuration manquante: CRON_SECRET non defini'] },
      { status: 500 }
    )
  }

  if (!deleteToken || deleteToken !== expectedDeleteToken) {
    return NextResponse.json(
      { logs: ['Token de suppression invalide'] },
      { status: 403 }
    )
  }

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
      let collectionRows: Array<{ user_id: string; quantity: number | null }> = []
      for (const idsChunk of chunkArray(printIds, IN_CHUNK_SIZE)) {
        const { data: linkedCollections, error: collectionsError } = await supabase
          .from('collections')
          .select('user_id, quantity, card_print_id')
          .in('card_print_id', idsChunk)

        if (collectionsError) {
          logs.push(`Erreur verification collections: ${collectionsError.message}`)
          return NextResponse.json({ logs }, { status: 500 })
        }

        const rows = (linkedCollections || []).map((row) => ({
          user_id: String(row.user_id || ''),
          quantity:
            row.quantity == null || Number.isNaN(Number(row.quantity))
              ? null
              : Number(row.quantity)
        }))
        collectionRows = collectionRows.concat(rows)
      }

      const positiveRows = collectionRows.filter((row) => (row.quantity || 0) > 0)
      const positiveUsers = new Set(positiveRows.map((row) => row.user_id)).size

      if (positiveRows.length > 0 && !forceDelete) {
        logs.push(
          `Suppression annulee: ${positiveRows.length} entree(s) de collection avec quantite > 0 (${positiveUsers} utilisateur(s)).`
        )
        logs.push(
          'Confirmez une suppression forcee si vous voulez supprimer aussi ces entrees de collection.'
        )
        return NextResponse.json({ logs }, { status: 409 })
      }

      if (forceDelete && collectionRows.length > 0) {
        let deletedCollections = 0
        for (const idsChunk of chunkArray(printIds, IN_CHUNK_SIZE)) {
          const { data: deletedRows, error: deleteCollectionsError } = await supabase
            .from('collections')
            .delete()
            .in('card_print_id', idsChunk)
            .select('card_print_id')

          if (deleteCollectionsError) {
            logs.push(`Erreur suppression collections: ${deleteCollectionsError.message}`)
            return NextResponse.json({ logs }, { status: 500 })
          }

          deletedCollections += (deletedRows || []).length
        }
        logs.push(
          `Mode force: ${deletedCollections} entree(s) de collection supprimee(s).`
        )
      }
    }

    // Aucun lien de collection: suppression complete autorisee.
    const { error: deletePrintsError } = await supabase
      .from('card_prints')
      .delete()
      .eq('distribution_set_id', setId)
    if (deletePrintsError) {
      logs.push(`Erreur suppression prints: ${deletePrintsError.message}`)
      return NextResponse.json({ logs }, { status: 500 })
    }
    logs.push('Prints supprimes')

    if (cardIds.length > 0) {
      for (const idsChunk of chunkArray(cardIds, IN_CHUNK_SIZE)) {
        const { error: deleteTranslationsError } = await supabase
          .from('card_translations')
          .delete()
          .in('card_id', idsChunk)
        if (deleteTranslationsError) {
          logs.push(`Erreur suppression traductions: ${deleteTranslationsError.message}`)
          return NextResponse.json({ logs }, { status: 500 })
        }
      }
      logs.push('Traductions supprimees')

      for (const idsChunk of chunkArray(cardIds, IN_CHUNK_SIZE)) {
        const { error: deleteCardsError } = await supabase
          .from('cards')
          .delete()
          .in('id', idsChunk)
        if (deleteCardsError) {
          logs.push(`Erreur suppression cartes: ${deleteCardsError.message}`)
          return NextResponse.json({ logs }, { status: 500 })
        }
      }
      logs.push('Cartes supprimees')
    }

    const { error: deleteSetError } = await supabase.from('sets').delete().eq('id', setId)
    if (deleteSetError) {
      logs.push(`Erreur suppression set: ${deleteSetError.message}`)
      return NextResponse.json({ logs }, { status: 500 })
    }
    logs.push('Set supprime')
    logs.push('Suppression terminee')

    return NextResponse.json({ logs })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    logs.push(`Erreur: ${message}`)
    return NextResponse.json({ logs }, { status: 500 })
  }
}
