import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getRequestUser } from '@/lib/server/authUser'
import { isAdminEmail, parseAdminEmails } from '@/lib/admin'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function formatApiCode(code: string) {
  const raw = (code || '').trim().toUpperCase().replace(/-/g, '')

  const ebMatch = raw.match(/^(OP\d{2})(EB\d{2})$/)
  if (ebMatch) return `${ebMatch[1]}-${ebMatch[2]}`

  if (raw.length <= 2) return raw

  const prefix = raw.slice(0, -2)
  const suffix = raw.slice(-2)
  return `${prefix}-${suffix}`
}

function normalizeSetCode(value: string | null | undefined) {
  return (value || '').replace('-', '').toUpperCase()
}

function normalizePrintCode(value: string | null | undefined) {
  return (value || '').trim().toUpperCase()
}

function extractPrintCodeFromImageUrl(imageUrl: string | null | undefined): string | null {
  const value = (imageUrl || '').trim()
  if (!value) return null

  const match = value.match(/\/([^/?#]+)\.(?:jpg|jpeg|png|webp)(?:[?#].*)?$/i)
  if (!match?.[1]) return null
  return match[1].trim()
}

function extractVariantTag(cardName: string | null | undefined) {
  const name = (cardName || '').trim()
  if (!name) return null

  const groups = Array.from(name.matchAll(/\(([^()]*)\)/g)).map((m) =>
    (m[1] || '').trim()
  )
  const tag =
    [...groups].reverse().find((value) => value && !/^\d+$/.test(value)) || null
  if (!tag) return null
  return tag.toLowerCase() === 'reprint' ? null : tag
}

function slugifyVariantTag(value: string | null | undefined) {
  const normalized = (value || '').trim().toUpperCase()
  if (!normalized) return null

  const slug = normalized.replace(/[^A-Z0-9]+/g, '')
  return slug || null
}

function resolvePrintCode(params: {
  providedPrintCode: string | null | undefined
  imageUrl: string | null | undefined
  baseCode: string
  setCode: string
  variantTag?: string | null
}) {
  const fromImageUrl = extractPrintCodeFromImageUrl(params.imageUrl)
  if (fromImageUrl) return fromImageUrl

  const provided = (params.providedPrintCode || '').trim()
  if (provided) return provided

  const variantSlug = slugifyVariantTag(params.variantTag)
  return variantSlug
    ? `${params.baseCode}_${params.setCode}_${variantSlug}`
    : `${params.baseCode}_${params.setCode}`
}

async function ensureSetScopedPrintCode(params: {
  printCode: string
  setId: string
  setCode: string
}) {
  const normalized = normalizePrintCode(params.printCode)
  if (!normalized) return normalized

  const { data: existing } = await supabase
    .from('card_prints')
    .select('distribution_set_id')
    .eq('print_code', normalized)
    .maybeSingle()

  if (!existing || existing.distribution_set_id === params.setId) {
    return normalized
  }

  return `${normalized}_${params.setCode}`
}

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> }
) {
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

  const { code } = await context.params
  const normalizedCode = normalizeSetCode(code)

  const { data: setData, error: setError } = await supabase
    .from('sets')
    .select('id, code, name')
    .eq('code', normalizedCode)
    .single()

  if (setError || !setData) {
    return NextResponse.json({ error: 'Set introuvable en base' }, { status: 404 })
  }

  const { data: printsData, error: printsError } = await supabase
    .from('card_prints')
    .select('print_code')
    .eq('distribution_set_id', setData.id)

  if (printsError) {
    return NextResponse.json(
      { error: `Erreur lecture card_prints: ${printsError.message}` },
      { status: 500 }
    )
  }

  const existingPrintCodes = new Set(
    (printsData || []).map((row) => normalizePrintCode(row.print_code))
  )

  const apiCode = formatApiCode(normalizedCode)
  const res = await fetch(`https://www.optcgapi.com/api/sets/${apiCode}/`)
  if (!res.ok) {
    return NextResponse.json({ error: `Erreur API ${res.status}` }, { status: 502 })
  }

  const apiCards = await res.json()
  if (!Array.isArray(apiCards)) {
    return NextResponse.json({ error: 'Reponse API invalide' }, { status: 502 })
  }

  const seen = new Set<string>()
  const missing: Array<{
    printCode: string
    baseCode: string
    name: string
    rarity: string
    type: string
  }> = []

  for (const card of apiCards) {
    const apiSetCode = normalizeSetCode(card?.set_id)
    if (apiSetCode && apiSetCode !== normalizedCode) continue
    if (!card?.card_set_id) continue

    const imageUrl = card?.card_image?.toString().trim()
    const basePrintCode = resolvePrintCode({
      providedPrintCode: card?.card_image_id?.toString().trim(),
      imageUrl,
      baseCode: card.card_set_id,
      setCode: normalizedCode,
      variantTag: extractVariantTag(card?.card_name)
    })
    const printCode = await ensureSetScopedPrintCode({
      printCode: basePrintCode,
      setId: setData.id,
      setCode: normalizedCode
    })

    const normalizedPrint = normalizePrintCode(printCode)
    if (!normalizedPrint || seen.has(normalizedPrint)) continue
    seen.add(normalizedPrint)

    if (existingPrintCodes.has(normalizedPrint)) continue

    missing.push({
      printCode,
      baseCode: card.card_set_id,
      name: card.card_name || card.card_set_id,
      rarity: card.rarity || '',
      type: card.card_type || ''
    })
  }

  missing.sort((a, b) => a.printCode.localeCompare(b.printCode, 'fr'))

  return NextResponse.json({
    set: {
      code: setData.code,
      name: setData.name
    },
    totals: {
      apiCards: apiCards.length,
      existingPrints: existingPrintCodes.size,
      missingPrints: missing.length
    },
    missing
  })
}
