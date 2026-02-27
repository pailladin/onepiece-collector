import { NextResponse } from 'next/server'
import { getRequestUserId } from '@/lib/server/authUser'
import { supabaseServiceServer } from '@/lib/server/supabaseServer'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const { userId, error } = await getRequestUserId(request)
  if (!userId) {
    return NextResponse.json({ error }, { status: 401 })
  }

  const { error: dbError } = await supabaseServiceServer
    .from('cardmarket_accounts')
    .delete()
    .eq('user_id', userId)

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
