import { NextResponse } from 'next/server'
import { isAdminEmail, parseAdminEmails } from '@/lib/admin'
import {
  applyApprovedSubmission,
  applySubmissionMediaFields,
  CommunitySubmissionRow,
  getSubmissionPoints,
  normalizeCode,
  sanitizeSubmissionPayload
} from '@/lib/community'
import { getRequestUser } from '@/lib/server/authUser'
import { supabaseServiceServer } from '@/lib/server/supabaseServer'

export const runtime = 'nodejs'

async function loadCurrentValuesForSubmission(row: CommunitySubmissionRow) {
  const payload = (row.payload || {}) as Record<string, unknown>
  const setCode = normalizeCode(String(payload.setCode || ''))
  if (!setCode) return null

  const { data: setData } = await supabaseServiceServer
    .from('sets')
    .select('id, code')
    .eq('code', setCode)
    .maybeSingle()

  if (!setData) return null

  const baseCode = normalizeCode(String(payload.baseCode || ''))
  const currentPrintCode = normalizeCode(String(payload.currentPrintCode || ''))

  let cardId: string | null = null
  let printData:
    | {
        id: string
        print_code: string | null
        variant_type: string | null
        available_languages: string[] | null
        card_id: string
      }
    | null = null

  if (currentPrintCode) {
    const { data } = await supabaseServiceServer
      .from('card_prints')
      .select('id, print_code, variant_type, available_languages, card_id')
      .eq('distribution_set_id', setData.id)
      .eq('print_code', currentPrintCode)
      .maybeSingle()
    printData = data
    cardId = data?.card_id || null
  }

  if (!cardId && baseCode) {
    const { data: cardData } = await supabaseServiceServer
      .from('cards')
      .select('id')
      .eq('base_code', baseCode)
      .maybeSingle()
    cardId = cardData?.id || null
  }

  if (!cardId) return null

  const { data: cardData } = await supabaseServiceServer
    .from('cards')
    .select(
      `
        id,
        base_code,
        rarity,
        type,
        card_translations (
          locale,
          name
        )
      `
    )
    .eq('id', cardId)
    .maybeSingle()

  if (!cardData) return null

  const name =
    (Array.isArray(cardData.card_translations)
      ? cardData.card_translations.find((entry: { locale: string; name: string }) => entry.locale === 'fr')
          ?.name || cardData.card_translations[0]?.name
      : '') || ''

  return {
    setCode,
    baseCode: cardData.base_code || '',
    currentPrintCode: printData?.print_code || '',
    name,
    rarity: cardData.rarity || '',
    type: cardData.type || '',
    variantType: printData?.variant_type || '',
    availableLanguages: printData?.available_languages || []
  }
}

export async function GET(request: Request) {
  const userResult = await getRequestUser(request)
  if (!userResult.user) {
    return NextResponse.json({ error: userResult.error || 'Unauthorized' }, { status: 401 })
  }

  const adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS)
  if (!isAdminEmail(userResult.user.email, adminEmails)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await supabaseServiceServer
    .from('community_submissions')
    .select('id, user_id, submission_type, target_type, target_id, title, message, payload, status, admin_comment, reviewed_by, reviewed_at, created_at, updated_at')
    .order('status', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const submissions = (data as CommunitySubmissionRow[] | null) || []
  const userIds = [...new Set(submissions.map((row) => row.user_id))]
  const profilesById = new Map<string, string>()

  if (userIds.length > 0) {
    const { data: profilesData } = await supabaseServiceServer
      .from('profiles')
      .select('id, username')
      .in('id', userIds)

    for (const row of (profilesData as Array<{ id: string; username: string | null }> | null) || []) {
      profilesById.set(row.id, row.username || 'Utilisateur')
    }
  }

  const currentValuesBySubmissionId = new Map<string, Record<string, unknown> | null>()
  for (const row of submissions) {
    currentValuesBySubmissionId.set(row.id, await loadCurrentValuesForSubmission(row))
  }

  return NextResponse.json({
    submissions: submissions.map((row) => ({
      ...row,
      username: profilesById.get(row.user_id) || 'Utilisateur',
      currentValues: currentValuesBySubmissionId.get(row.id) || null
    }))
  })
}

export async function POST(request: Request) {
  const userResult = await getRequestUser(request)
  if (!userResult.user) {
    return NextResponse.json({ error: userResult.error || 'Unauthorized' }, { status: 401 })
  }

  const adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS)
  if (!isAdminEmail(userResult.user.email, adminEmails)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const submissionId = String(body?.submissionId || '').trim()
  const action = String(body?.action || '').trim()
  const adminComment = String(body?.adminComment || '').trim()
  const payloadPatch =
    typeof body?.payloadPatch === 'object' && body?.payloadPatch ? (body.payloadPatch as Record<string, unknown>) : {}

  if (!submissionId || !['approve', 'reject', 'neutral', 'apply_media'].includes(action)) {
    return NextResponse.json({ error: 'Requete invalide' }, { status: 400 })
  }

  const { data: submissionData, error: submissionError } = await supabaseServiceServer
    .from('community_submissions')
    .select('id, user_id, submission_type, target_type, target_id, title, message, payload, status, admin_comment, reviewed_by, reviewed_at, created_at, updated_at')
    .eq('id', submissionId)
    .single()

  if (submissionError || !submissionData) {
    return NextResponse.json({ error: 'Proposition introuvable' }, { status: 404 })
  }

  const submission = submissionData as CommunitySubmissionRow
  if (action !== 'apply_media' && submission.status !== 'pending') {
    return NextResponse.json({ error: 'Cette proposition a deja ete traitee' }, { status: 409 })
  }

  const mergedPayload = sanitizeSubmissionPayload(submission.submission_type, {
    ...(submission.payload || {}),
    ...payloadPatch
  })

  if (action === 'apply_media') {
    if (submission.status !== 'approved') {
      return NextResponse.json(
        { error: 'La reapplication image/langues est reservee aux propositions validees' },
        { status: 409 }
      )
    }

    try {
      const result = await applySubmissionMediaFields({
        ...submission,
        payload: mergedPayload
      })

      return NextResponse.json({ ok: true, status: submission.status, result })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur reapplication image/langues'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  if (action === 'approve') {
    try {
      await applyApprovedSubmission(
        {
          ...submission,
          payload: mergedPayload
        },
        userResult.user.id
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur application proposition'
      const status =
        /doublon|deja utilise|introuvable|invalide/i.test(message) ? 409 : 500

      return NextResponse.json(
        { error: message },
        { status }
      )
    }
  }

  const nextStatus = action === 'reject' ? 'rejected' : 'approved'
  const reviewedAt = new Date().toISOString()
  const { error: updateError } = await supabaseServiceServer
    .from('community_submissions')
    .update({
      status: nextStatus,
      admin_comment: adminComment || (action === 'neutral' ? 'Validation neutre: point attribue sans modification du site.' : null),
      payload: mergedPayload,
      reviewed_by: userResult.user.id,
      reviewed_at: reviewedAt
    })
    .eq('id', submissionId)
    .eq('status', 'pending')

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  const scorePoints =
    action === 'approve' ? getSubmissionPoints(submission.submission_type) : action === 'neutral' ? 1 : 0
  const { data: existingScore } = await supabaseServiceServer
    .from('contributor_scores')
    .select('user_id, points, approved_count, rejected_count')
    .eq('user_id', submission.user_id)
    .maybeSingle()

  const nextScore = {
    user_id: submission.user_id,
    points: Number(existingScore?.points || 0) + scorePoints,
    approved_count: Number(existingScore?.approved_count || 0) + (action === 'approve' || action === 'neutral' ? 1 : 0),
    rejected_count: Number(existingScore?.rejected_count || 0) + (action === 'reject' ? 1 : 0)
  }

  const { error: scoreError } = await supabaseServiceServer
    .from('contributor_scores')
    .upsert(nextScore, { onConflict: 'user_id' })

  if (scoreError) {
    return NextResponse.json({ error: scoreError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, status: nextStatus })
}
