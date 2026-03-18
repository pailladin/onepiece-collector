import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSupportTarget, supabaseAdmin } from '@/app/api/admin/support/_shared'
import { supabaseServiceServer } from '@/lib/server/supabaseServer'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const access = await requireAdminSupportTarget(request)
  if (access.error) {
    return NextResponse.json({ active: false, error: access.error }, { status: access.status })
  }

  const [{ data: authData, error: authError }, { data: profileData }] = await Promise.all([
    supabaseAdmin.auth.admin.getUserById(access.targetUserId!),
    supabaseServiceServer
      .from('profiles')
      .select('username')
      .eq('id', access.targetUserId!)
      .maybeSingle()
  ])

  if (authError || !authData.user) {
    return NextResponse.json({ active: false, error: 'Utilisateur introuvable' }, { status: 404 })
  }

  return NextResponse.json({
    active: true,
    user: {
      id: authData.user.id,
      email: authData.user.email || '',
      username: profileData?.username || ''
    }
  })
}
