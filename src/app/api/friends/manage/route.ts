import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getRequestUser } from '@/lib/server/authUser'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type ActionBody = {
  action?: 'send' | 'accept' | 'decline' | 'cancel' | 'remove'
  targetUserId?: string
  requestId?: string
}

export async function POST(request: Request) {
  const userResult = await getRequestUser(request)
  if (!userResult.user) {
    return NextResponse.json(
      { error: userResult.error || 'Unauthorized' },
      { status: 401 }
    )
  }

  const body = (await request.json().catch(() => ({}))) as ActionBody
  const action = String(body?.action || '').trim()

  if (action === 'send') {
    const targetUserId = String(body?.targetUserId || '').trim()
    if (!targetUserId || targetUserId === userResult.user.id) {
      return NextResponse.json({ error: 'Destinataire invalide' }, { status: 400 })
    }

    const { data: existingFriend } = await supabase
      .from('friends')
      .select('user_id')
      .eq('user_id', userResult.user.id)
      .eq('friend_id', targetUserId)
      .maybeSingle()

    if (existingFriend) {
      return NextResponse.json({ error: 'Vous etes deja amis' }, { status: 409 })
    }

    const { data: pendingRequests } = await supabase
      .from('friend_requests')
      .select('id, requester_id, recipient_id')
      .or(
        `and(requester_id.eq.${userResult.user.id},recipient_id.eq.${targetUserId},status.eq.pending),and(requester_id.eq.${targetUserId},recipient_id.eq.${userResult.user.id},status.eq.pending)`
      )

    if ((pendingRequests || []).length > 0) {
      return NextResponse.json({ error: 'Une demande est deja en cours' }, { status: 409 })
    }

    const { error } = await supabase.from('friend_requests').insert({
      requester_id: userResult.user.id,
      recipient_id: targetUserId,
      status: 'pending'
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  }

  if (action === 'accept') {
    const requestId = String(body?.requestId || '').trim()
    if (!requestId) {
      return NextResponse.json({ error: 'requestId requis' }, { status: 400 })
    }

    const { data: requestRow, error: requestError } = await supabase
      .from('friend_requests')
      .select('id, requester_id, recipient_id, status')
      .eq('id', requestId)
      .eq('recipient_id', userResult.user.id)
      .single()

    if (requestError || !requestRow || requestRow.status !== 'pending') {
      return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 })
    }

    const now = new Date().toISOString()
    const { error: updateError } = await supabase
      .from('friend_requests')
      .update({ status: 'accepted', responded_at: now })
      .eq('id', requestId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    const { error: friendsError } = await supabase.from('friends').upsert(
      [
        { user_id: userResult.user.id, friend_id: requestRow.requester_id },
        { user_id: requestRow.requester_id, friend_id: userResult.user.id }
      ],
      { onConflict: 'user_id,friend_id' }
    )

    if (friendsError) {
      return NextResponse.json({ error: friendsError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  }

  if (action === 'decline' || action === 'cancel') {
    const requestId = String(body?.requestId || '').trim()
    if (!requestId) {
      return NextResponse.json({ error: 'requestId requis' }, { status: 400 })
    }

    const filterColumn = action === 'decline' ? 'recipient_id' : 'requester_id'
    const nextStatus = action === 'decline' ? 'declined' : 'cancelled'
    const now = new Date().toISOString()

    const { error } = await supabase
      .from('friend_requests')
      .update({ status: nextStatus, responded_at: now })
      .eq('id', requestId)
      .eq(filterColumn, userResult.user.id)
      .eq('status', 'pending')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  }

  if (action === 'remove') {
    const targetUserId = String(body?.targetUserId || '').trim()
    if (!targetUserId || targetUserId === userResult.user.id) {
      return NextResponse.json({ error: 'Ami invalide' }, { status: 400 })
    }

    const [{ error: deleteMineError }, { error: deleteTheirsError }] = await Promise.all([
      supabase.from('friends').delete().eq('user_id', userResult.user.id).eq('friend_id', targetUserId),
      supabase.from('friends').delete().eq('user_id', targetUserId).eq('friend_id', userResult.user.id)
    ])

    if (deleteMineError || deleteTheirsError) {
      return NextResponse.json(
        { error: deleteMineError?.message || deleteTheirsError?.message || 'Erreur suppression' },
        { status: 500 }
      )
    }

    const now = new Date().toISOString()
    await Promise.all([
      supabase
        .from('friend_requests')
        .update({ status: 'cancelled', responded_at: now })
        .eq('requester_id', userResult.user.id)
        .eq('recipient_id', targetUserId)
        .eq('status', 'pending'),
      supabase
        .from('friend_requests')
        .update({ status: 'cancelled', responded_at: now })
        .eq('requester_id', targetUserId)
        .eq('recipient_id', userResult.user.id)
        .eq('status', 'pending')
    ])

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Action invalide' }, { status: 400 })
}
