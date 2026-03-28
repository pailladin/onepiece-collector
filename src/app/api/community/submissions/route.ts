import { NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/server/authUser'
import {
  COMMUNITY_SUBMISSION_TYPES,
  CommunitySubmissionType,
  sanitizeSubmissionPayload
} from '@/lib/community'
import { supabaseAnonServer, supabaseServiceServer } from '@/lib/server/supabaseServer'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const userResult = await getRequestUser(request)
  if (!userResult.user) {
    return NextResponse.json({ error: userResult.error || 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabaseServiceServer
    .from('community_submissions')
    .select('id, user_id, submission_type, target_type, target_id, title, message, payload, status, admin_comment, reviewed_by, reviewed_at, created_at, updated_at')
    .eq('user_id', userResult.user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ submissions: data || [] })
}

export async function POST(request: Request) {
  const userResult = await getRequestUser(request)
  if (!userResult.user) {
    return NextResponse.json({ error: userResult.error || 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const submissionType = String(body?.submissionType || '').trim() as CommunitySubmissionType
  const title = String(body?.title || '').trim()
  const message = String(body?.message || '').trim()

  if (!COMMUNITY_SUBMISSION_TYPES.includes(submissionType)) {
    return NextResponse.json({ error: 'Type de proposition invalide' }, { status: 400 })
  }

  if (!title) {
    return NextResponse.json({ error: 'Titre requis' }, { status: 400 })
  }

  const payload = sanitizeSubmissionPayload(
    submissionType,
    typeof body?.payload === 'object' && body?.payload ? (body.payload as Record<string, unknown>) : {}
  )

  if (submissionType === 'place_add') {
    if (!String(payload.name || '') || !String(payload.city || '')) {
      return NextResponse.json(
        { error: 'Nom du lieu et ville obligatoires' },
        { status: 400 }
      )
    }
  } else {
    const normalizedSetCode = String(payload.setCode || '').trim()
    if (!normalizedSetCode) {
      return NextResponse.json({ error: 'Set requis' }, { status: 400 })
    }

    const { data: setData, error: setError } = await supabaseServiceServer
      .from('sets')
      .select('id')
      .eq('code', normalizedSetCode)
      .maybeSingle()

    if (setError) {
      return NextResponse.json({ error: setError.message }, { status: 500 })
    }

    if (!setData) {
      return NextResponse.json(
        { error: 'Le set doit deja exister dans la base avant toute proposition.' },
        { status: 400 }
      )
    }
  }

  if (submissionType === 'card_add') {
    if (!String(payload.setCode || '') || !String(payload.baseCode || '') || !String(payload.name || '')) {
      return NextResponse.json(
        { error: 'Set, base code et nom sont obligatoires pour un ajout' },
        { status: 400 }
      )
    }
  } else if (submissionType === 'card_edit') {
    if (!String(payload.setCode || '') || !String(payload.baseCode || '') || !String(payload.currentPrintCode || '')) {
      return NextResponse.json(
        { error: 'Set, base code et carte selectionnee sont obligatoires pour une modification' },
        { status: 400 }
      )
    }
  }

  const insertRow = {
    user_id: userResult.user.id,
    submission_type: submissionType,
    target_type:
      submissionType === 'place_add'
        ? 'place'
        : submissionType === 'card_add'
          ? 'new_card'
          : 'card_print',
    target_id:
      submissionType === 'place_add'
        ? String(payload.slug || payload.name || '')
        : submissionType === 'card_add'
        ? String(payload.baseCode || '')
        : `${String(payload.setCode || '')}:${String(payload.baseCode || '')}`,
    title,
    message: message || null,
    payload,
    status: 'pending'
  }

  const { data, error } = await supabaseServiceServer
    .from('community_submissions')
    .insert(insertRow)
    .select('id, created_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, submission: data })
}
