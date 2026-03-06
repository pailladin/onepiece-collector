import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { isAdminEmail, parseAdminEmails } from '@/lib/admin'
import { getRequestUser } from '@/lib/server/authUser'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  const userResult = await getRequestUser(request)
  if (!userResult.user) {
    return NextResponse.json(
      { error: userResult.error || 'Unauthorized' },
      { status: 401 }
    )
  }

  const adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS)
  if (!isAdminEmail(userResult.user.email, adminEmails)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const printId = String(body?.printId || '').trim()
  const productId = String(body?.productId || '').trim()
  const source = String(body?.source || 'manual').trim() || 'manual'
  const confidenceRaw = Number(body?.confidence)
  const confidence = Number.isFinite(confidenceRaw)
    ? Math.max(0, Math.min(100, Math.round(confidenceRaw)))
    : 100
  const note = String(body?.note || '').trim() || null

  if (!printId || !productId) {
    return NextResponse.json({ error: 'printId et productId requis' }, { status: 400 })
  }

  const { data: printData, error: printError } = await supabase
    .from('card_prints')
    .select('id')
    .eq('id', printId)
    .single()

  if (printError || !printData) {
    return NextResponse.json({ error: 'Print introuvable' }, { status: 404 })
  }

  const { error } = await supabase.from('cardmarket_print_links').upsert(
    {
      card_print_id: printId,
      cardmarket_product_id: productId,
      source,
      confidence,
      note,
      created_by: userResult.user.id
    },
    {
      onConflict: 'card_print_id'
    }
  )

  if (error) {
    return NextResponse.json(
      { error: `Erreur sauvegarde mapping: ${error.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({
    ok: true,
    link: {
      printId,
      productId,
      source,
      confidence
    }
  })
}
