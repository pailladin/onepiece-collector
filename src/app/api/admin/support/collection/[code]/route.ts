import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSupportTarget } from '@/app/api/admin/support/_shared'
import { fetchUserSetItemsService } from '@/lib/server/userCollectionService'
import { supabaseServiceServer } from '@/lib/server/supabaseServer'

export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  const access = await requireAdminSupportTarget(request)
  if (access.error) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const code = String((await context.params).code || '').trim()
  if (!code) {
    return NextResponse.json({ error: 'Set introuvable' }, { status: 400 })
  }

  try {
    const [{ data: profileData }, payload] = await Promise.all([
      supabaseServiceServer
        .from('profiles')
        .select('username')
        .eq('id', access.targetUserId!)
        .maybeSingle(),
      fetchUserSetItemsService(access.targetUserId!, code)
    ])

    return NextResponse.json({
      ...payload,
      username: profileData?.username || 'Utilisateur'
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur chargement set'
    const status = message === 'Set introuvable' ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
