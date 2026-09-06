import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getRequestUser } from '@/lib/server/authUser'
import { isAdminEmail, parseAdminEmails } from '@/lib/admin'
import { getPromoCatalog, resolvePromoPrintCode } from '@/lib/server/promoCards'

export const runtime = 'nodejs'
export const maxDuration = 60

const PROMO_IMPORT_CODE = 'PROMO'
const API_TIMEOUT_MS = 20_000

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function formatApiCode(code: string) {
  if (normalizeSetCode(code) === PROMO_IMPORT_CODE) return PROMO_IMPORT_CODE

  const raw = (code || '').trim().toUpperCase().replace(/-/g, '')

  if (/^ST\d{2}$/i.test(raw)) {
    return `${raw.slice(0, 2)}-${raw.slice(2)}`
  }

  const ebMatch = raw.match(/^(OP\d{2})(EB\d{2})$/)
  if (ebMatch) return `${ebMatch[1]}-${ebMatch[2]}`

  if (raw.length <= 2) return raw

  const prefix = raw.slice(0, -2)
  const suffix = raw.slice(-2)
  return `${prefix}-${suffix}`
}

function asTrimmedString(value: unknown) {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function normalizeSetCode(value: string | null | undefined) {
  return (value || '').replace('-', '').toUpperCase()
}

function normalizePrintCode(value: string | null | undefined) {
  return (value || '').trim().toUpperCase()
}

async function fetchJsonWithTimeout(url: string, label: string) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS)

  try {
    const response = await fetch(url, { signal: controller.signal })
    const data = await response.json()
    return { response, data }
  } catch (error: unknown) {
    if (controller.signal.aborted) {
      throw new Error(`${label}: delai depasse (${API_TIMEOUT_MS / 1000}s)`)
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
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
  const isDeckCode = /^ST\d{2}$/i.test(normalizedCode)
  const isPromoImport = apiCode === PROMO_IMPORT_CODE
  let apiCards: Array<Record<string, unknown>> = []

  try {
    if (isPromoImport) {
      apiCards = await getPromoCatalog()
    } else {
      const endpoint = isDeckCode
        ? `https://www.optcgapi.com/api/decks/${apiCode}/`
        : `https://www.optcgapi.com/api/sets/${apiCode}/`
      const { response, data: setCards } = await fetchJsonWithTimeout(
        endpoint,
        'API cartes'
      )
      if (!response.ok) {
        return NextResponse.json(
          { error: `Erreur API ${response.status}` },
          { status: 502 }
        )
      }

      if (!Array.isArray(setCards)) {
        return NextResponse.json({ error: 'Reponse API invalide' }, { status: 502 })
      }

      apiCards = setCards as Array<Record<string, unknown>>
    }
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'API cartes indisponible' },
      { status: 504 }
    )
  }

  const candidates = apiCards
    .map((card) => {
      const apiSetCode = normalizeSetCode(asTrimmedString(card.set_id))
      if (!isPromoImport && apiSetCode && apiSetCode !== normalizedCode) return null

      const cardSetId = asTrimmedString(card.card_set_id)
      if (!cardSetId) return null

      const imageUrl = asTrimmedString(card.card_image)
      const basePrintCode = normalizePrintCode(
        isPromoImport
          ? resolvePromoPrintCode({
              card_set_id: cardSetId,
              card_name: asTrimmedString(card.card_name)
            })
          : resolvePrintCode({
              providedPrintCode: asTrimmedString(card.card_image_id),
              imageUrl,
              baseCode: cardSetId,
              setCode: normalizedCode,
              variantTag: extractVariantTag(asTrimmedString(card.card_name))
            })
      )
      if (!basePrintCode) return null

      return { card, cardSetId, basePrintCode }
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))

  const printOwnerByCode = new Map<string, string>()
  const uniqueCandidateCodes = [...new Set(candidates.map((item) => item.basePrintCode))]
  const LOOKUP_BATCH_SIZE = 200
  for (let index = 0; index < uniqueCandidateCodes.length; index += LOOKUP_BATCH_SIZE) {
    const batch = uniqueCandidateCodes.slice(index, index + LOOKUP_BATCH_SIZE)
    const { data: ownerRows, error: ownerError } = await supabase
      .from('card_prints')
      .select('print_code, distribution_set_id')
      .in('print_code', batch)

    if (ownerError) {
      return NextResponse.json(
        { error: `Erreur verification des prints: ${ownerError.message}` },
        { status: 500 }
      )
    }

    for (const row of ownerRows || []) {
      printOwnerByCode.set(normalizePrintCode(row.print_code), row.distribution_set_id)
    }
  }

  const seen = new Set<string>()
  const missing: Array<{
    printCode: string
    baseCode: string
    name: string
    rarity: string
    type: string
  }> = []

  for (const { card, cardSetId, basePrintCode } of candidates) {
    const ownerSetId = printOwnerByCode.get(basePrintCode)
    const printCode =
      ownerSetId && ownerSetId !== setData.id
        ? `${basePrintCode}_${normalizedCode}`
        : basePrintCode

    const normalizedPrint = normalizePrintCode(printCode)
    if (!normalizedPrint || seen.has(normalizedPrint)) continue
    seen.add(normalizedPrint)

    if (existingPrintCodes.has(normalizedPrint)) continue

    missing.push({
      printCode,
      baseCode: cardSetId,
      name: asTrimmedString(card.card_name) || cardSetId,
      rarity: asTrimmedString(card.rarity),
      type: asTrimmedString(card.card_type)
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
