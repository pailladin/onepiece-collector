import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSupportTarget, supabaseAdmin } from '@/app/api/admin/support/_shared'
import { supabaseServiceServer } from '@/lib/server/supabaseServer'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const access = await requireAdminSupportTarget(request)
  if (access.error) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const [{ data: authData, error: authError }, { data: profileData, error: profileError }] = await Promise.all([
    supabaseAdmin.auth.admin.getUserById(access.targetUserId!),
    supabaseServiceServer
      .from('profiles')
      .select('username, postal_code, discord_username')
      .eq('id', access.targetUserId!)
      .maybeSingle()
  ])

  if (authError || !authData.user) {
    return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 })
  }

  if (profileError) {
    return NextResponse.json({ error: `Erreur profil: ${profileError.message}` }, { status: 500 })
  }

  const identities = (authData.user.identities || []).map((identity) => ({
    id: identity.id,
    provider: String(identity.provider || ''),
    email: String((identity as { identity_data?: { email?: string } }).identity_data?.email || '')
  }))

  return NextResponse.json({
    user: {
      id: authData.user.id,
      email: authData.user.email || '',
      createdAt: authData.user.created_at || null,
      lastSignInAt: authData.user.last_sign_in_at || null,
      emailConfirmedAt: authData.user.email_confirmed_at || null,
      username: profileData?.username || '',
      postalCode: profileData?.postal_code || '',
      discordUsername: profileData?.discord_username || '',
      identities
    }
  })
}
