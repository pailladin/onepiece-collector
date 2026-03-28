import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getRequestUser } from '@/lib/server/authUser'
import { isAdminEmail, parseAdminEmails } from '@/lib/admin'
import {
  normalizeDonApiCard,
  normalizeImportSetCode,
  resolveDonTargetSetCode
} from '@/lib/server/donCards'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const BUCKET = 'cards-images'
const MISSING_IMAGE_PATH = '__missing__'

type ExternalSetOption = {
  code: string
  label: string
}

async function uploadImageToSupabase(imageUrl: string, fileName: string) {
  const imageResponse = await fetch(imageUrl)
  if (!imageResponse.ok) {
    throw new Error('Erreur telechargement image')
  }

  const arrayBuffer = await imageResponse.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const { error } = await supabase.storage.from(BUCKET).upload(fileName, buffer, {
    contentType: 'image/jpeg',
    upsert: true
  })

  if (error) {
    throw new Error(error.message)
  }
}

async function importValidatedDonCard(params: {
  externalId: string
  targetSetCode: string
}) {
  const donRes = await fetch('https://www.optcgapi.com/api/allDonCards/')
  if (!donRes.ok) {
    throw new Error(`Erreur API DON ${donRes.status}`)
  }

  const [donRaw, availableSets] = await Promise.all([
    donRes.json().catch(() => []),
    fetchAvailableSets()
  ])

  if (!Array.isArray(donRaw)) {
    throw new Error('Format API DON invalide')
  }

  const donCard = donRaw
    .map((row, index) => normalizeDonApiCard(row, index))
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .find((row) => row.externalId === params.externalId)

  if (!donCard) {
    throw new Error('Carte DON introuvable dans la source externe')
  }

  const setOption = availableSets.find((row) => row.code === params.targetSetCode)
  const setName = setOption?.label || params.targetSetCode

  let { data: setData, error: setLookupError } = await supabase
    .from('sets')
    .select('id, code, name')
    .eq('code', params.targetSetCode)
    .maybeSingle()

  if (setLookupError) {
    throw new Error(`Erreur lecture set: ${setLookupError.message}`)
  }

  if (!setData) {
    const { data: newSet, error: setInsertError } = await supabase
      .from('sets')
      .insert({ code: params.targetSetCode, name: setName })
      .select('id, code, name')
      .single()

    if (setInsertError || !newSet) {
      throw new Error(`Erreur creation set: ${setInsertError?.message}`)
    }
    setData = newSet
  }

  const baseCode = donCard.baseCode
  const printCode = `${baseCode}_${params.targetSetCode}`

  let { data: existingCard, error: cardLookupError } = await supabase
    .from('cards')
    .select('id, base_set_id')
    .eq('base_code', baseCode)
    .maybeSingle()

  if (cardLookupError) {
    throw new Error(`Erreur lecture card ${baseCode}: ${cardLookupError.message}`)
  }

  if (!existingCard) {
    const { data: newCard, error: cardInsertError } = await supabase
      .from('cards')
      .insert({
        base_code: baseCode,
        base_set_id: setData.id,
        number: donCard.number,
        rarity: donCard.rarity,
        type: donCard.cardType
      })
      .select('id, base_set_id')
      .single()

    if (cardInsertError || !newCard) {
      throw new Error(`Erreur insertion card ${baseCode}: ${cardInsertError?.message}`)
    }

    existingCard = newCard
  } else if (existingCard.base_set_id !== setData.id) {
    const { error: cardUpdateError } = await supabase
      .from('cards')
      .update({
        base_set_id: setData.id,
        number: donCard.number,
        rarity: donCard.rarity,
        type: donCard.cardType
      })
      .eq('id', existingCard.id)

    if (cardUpdateError) {
      throw new Error(`Erreur mise a jour card ${baseCode}: ${cardUpdateError.message}`)
    }
  }

  const { error: translationError } = await supabase.from('card_translations').upsert(
    {
      card_id: existingCard.id,
      locale: 'fr',
      name: donCard.cardName
    },
    { onConflict: 'card_id,locale' }
  )

  if (translationError) {
    throw new Error(`Erreur traduction ${baseCode}: ${translationError.message}`)
  }

  let imagePath = MISSING_IMAGE_PATH
  if (donCard.imageUrl) {
    imagePath = `${printCode}.jpg`
    try {
      await uploadImageToSupabase(donCard.imageUrl, `${params.targetSetCode}/${imagePath}`)
    } catch {
      imagePath = MISSING_IMAGE_PATH
    }
  }

  const { error: printError } = await supabase.from('card_prints').upsert(
    {
      print_code: printCode,
      card_id: existingCard.id,
      distribution_set_id: setData.id,
      variant_type: 'normal',
      image_path: imagePath
    },
    { onConflict: 'print_code' }
  )

  if (printError) {
    throw new Error(`Erreur print ${printCode}: ${printError.message}`)
  }

  return {
    setCode: params.targetSetCode,
    printCode
  }
}

async function requireAdmin(request: Request) {
  const userResult = await getRequestUser(request)
  if (!userResult.user) {
    return {
      error: NextResponse.json(
        { error: userResult.error || 'Unauthorized' },
        { status: 401 }
      )
    }
  }

  const adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS)
  if (!isAdminEmail(userResult.user.email, adminEmails)) {
    return {
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  return { user: userResult.user }
}

async function fetchAvailableSets() {
  const [setsRes, decksRes, dbSetsRes] = await Promise.all([
    fetch('https://www.optcgapi.com/api/allSets/'),
    fetch('https://www.optcgapi.com/api/allDecks/'),
    supabase.from('sets').select('code, name')
  ])

  const optionsByCode = new Map<string, string>()

  const appendOption = (codeRaw: unknown, labelRaw: unknown) => {
    const code = normalizeImportSetCode(
      typeof codeRaw === 'string' || typeof codeRaw === 'number'
        ? String(codeRaw)
        : ''
    )
    if (!code) return

    const label =
      typeof labelRaw === 'string' && labelRaw.trim()
        ? labelRaw.trim()
        : code

    if (!optionsByCode.has(code)) {
      optionsByCode.set(code, label)
    }
  }

  if (setsRes.ok) {
    const setsData = await setsRes.json().catch(() => [])
    if (Array.isArray(setsData)) {
      for (const row of setsData) {
        const entry = row as Record<string, unknown>
        appendOption(entry.set_id, entry.set_name)
      }
    }
  }

  if (decksRes.ok) {
    const decksData = await decksRes.json().catch(() => [])
    if (Array.isArray(decksData)) {
      for (const row of decksData) {
        const entry = row as Record<string, unknown>
        appendOption(entry.structure_deck_id, entry.structure_deck_name)
      }
    }
  }

  for (const row of dbSetsRes.data || []) {
    appendOption(row.code, row.name)
  }

  appendOption('PROMO', 'Promos Speciales')

  return [...optionsByCode.entries()]
    .map(
      ([code, label]): ExternalSetOption => ({
        code,
        label
      })
    )
    .sort((a, b) => a.code.localeCompare(b.code, 'fr'))
}

export async function GET(request: Request) {
  const access = await requireAdmin(request)
  if (access.error) return access.error

  const donRes = await fetch('https://www.optcgapi.com/api/allDonCards/')
  if (!donRes.ok) {
    return NextResponse.json(
      { error: `Erreur API DON ${donRes.status}` },
      { status: 502 }
    )
  }

  const [donRaw, availableSets, overridesRes] = await Promise.all([
    donRes.json().catch(() => []),
    fetchAvailableSets(),
    supabase
      .from('don_import_overrides')
      .select(
        'external_id, suggested_set_code, target_set_code, is_validated, notes'
      )
  ])

  if (!Array.isArray(donRaw)) {
    return NextResponse.json({ error: 'Format API DON invalide' }, { status: 502 })
  }

  if (overridesRes.error) {
    return NextResponse.json(
      { error: overridesRes.error.message },
      { status: 500 }
    )
  }

  const overridesByExternalId = new Map(
    (overridesRes.data || []).map((row) => [row.external_id, row])
  )
  const availableSetLabelByCode = new Map(
    availableSets.map((entry) => [entry.code, entry.label])
  )

  const rows = donRaw
    .map((row, index) => normalizeDonApiCard(row, index))
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .map((card) => {
      const override = overridesByExternalId.get(card.externalId)
      const resolution = resolveDonTargetSetCode(card, override)
      const targetSetCode = resolution.targetSetCode

      return {
        externalId: card.externalId,
        cardName: card.cardName,
        cardText: card.cardText,
        rarity: card.rarity,
        cardType: card.cardType,
        imageUrl: card.imageUrl,
        imageId: card.imageId,
        baseCode: card.baseCode,
        optcgDonName: card.optcgDonName,
        suggestedSetCode: card.suggestedSetCode,
        suggestedSetLabel:
          card.suggestedSetCode && availableSetLabelByCode.has(card.suggestedSetCode)
            ? availableSetLabelByCode.get(card.suggestedSetCode)
            : card.suggestedSetLabel,
        targetSetCode,
        targetSetLabel: targetSetCode
          ? availableSetLabelByCode.get(targetSetCode) || targetSetCode
          : null,
        isValidated: resolution.isValidated,
        notes: override?.notes || '',
        status: resolution.isValidated
          ? 'validated'
          : targetSetCode
            ? 'pending'
            : 'unresolved'
      }
    })

  return NextResponse.json({
    rows,
    availableSets
  })
}

export async function POST(request: Request) {
  const access = await requireAdmin(request)
  if (access.error) return access.error

  const body = await request.json().catch(() => ({}))

  const externalId =
    typeof body?.externalId === 'string' ? body.externalId.trim().toUpperCase() : ''
  if (!externalId) {
    return NextResponse.json({ error: 'externalId requis' }, { status: 400 })
  }

  const targetSetCode = normalizeImportSetCode(
    typeof body?.targetSetCode === 'string' ? body.targetSetCode : ''
  )
  const suggestedSetCode = normalizeImportSetCode(
    typeof body?.suggestedSetCode === 'string' ? body.suggestedSetCode : ''
  )
  const notes = typeof body?.notes === 'string' ? body.notes.trim() : ''
  const isValidated = Boolean(body?.isValidated && targetSetCode)

  const payload = {
    external_id: externalId,
    card_name: typeof body?.cardName === 'string' ? body.cardName.trim() : '',
    optcg_don_name:
      typeof body?.optcgDonName === 'string' ? body.optcgDonName.trim() : '',
    suggested_set_code: suggestedSetCode || null,
    target_set_code: targetSetCode || null,
    is_validated: isValidated,
    notes: notes || null,
    updated_at: new Date().toISOString()
  }

  const { error } = await supabase
    .from('don_import_overrides')
    .upsert(payload, { onConflict: 'external_id' })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let importResult: { setCode: string; printCode: string } | null = null
  if (isValidated && payload.target_set_code) {
    try {
      importResult = await importValidatedDonCard({
        externalId,
        targetSetCode: payload.target_set_code
      })
    } catch (importError) {
      return NextResponse.json(
        {
          error:
            importError instanceof Error
              ? importError.message
              : 'Erreur import DON'
        },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({
    ok: true,
    targetSetCode: payload.target_set_code,
    isValidated,
    imported: Boolean(importResult),
    printCode: importResult?.printCode || null
  })
}
