import { NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/server/authUser'
import { supabaseServiceServer } from '@/lib/server/supabaseServer'

export const runtime = 'nodejs'

const DELETE_ACCOUNT_CONFIRMATION_TEXT = 'SUPPRIMER MON COMPTE'

type CleanupTarget = {
  table: string
  column: string
}

const CLEANUP_TARGETS: CleanupTarget[] = [
  { table: 'collections', column: 'user_id' },
  { table: 'collection_value_history', column: 'user_id' },
  { table: 'wishlists', column: 'user_id' },
  { table: 'friends', column: 'user_id' },
  { table: 'friends', column: 'friend_id' },
  { table: 'friend_requests', column: 'requester_id' },
  { table: 'friend_requests', column: 'recipient_id' },
  { table: 'cardmarket_accounts', column: 'user_id' },
  { table: 'cardmarket_oauth_states', column: 'user_id' },
  { table: 'community_submissions', column: 'user_id' },
  { table: 'community_scores', column: 'user_id' }
]

export async function POST(request: Request) {
  const userResult = await getRequestUser(request)
  if (!userResult.user) {
    return NextResponse.json(
      { error: userResult.error || 'Unauthorized' },
      { status: 401 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const confirmationText =
    typeof body?.confirmationText === 'string' ? body.confirmationText.trim() : ''

  if (confirmationText !== DELETE_ACCOUNT_CONFIRMATION_TEXT) {
    return NextResponse.json(
      { error: 'Texte de confirmation invalide.' },
      { status: 400 }
    )
  }

  const userId = userResult.user.id
  const { error: deleteUserError } = await supabaseServiceServer.auth.admin.deleteUser(userId)

  if (deleteUserError) {
    return NextResponse.json(
      { error: `Suppression du compte impossible: ${deleteUserError.message}` },
      { status: 500 }
    )
  }

  const cleanupErrors: string[] = []

  for (const target of CLEANUP_TARGETS) {
    const { error } = await supabaseServiceServer
      .from(target.table)
      .delete()
      .eq(target.column, userId)

    if (error) {
      cleanupErrors.push(`${target.table}.${target.column}: ${error.message}`)
    }
  }

  return NextResponse.json({
    success: true,
    cleanupErrors
  })
}
