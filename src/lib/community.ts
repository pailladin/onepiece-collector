import { normalizeSetLanguages } from '@/lib/collections/languages'
import { getDisplayPrintCode } from '@/lib/cards/printDisplay'
import {
  buildPlaceSearchText,
  deriveDepartmentCode,
  normalizePlaceActivities,
  normalizePlaceSlug
} from '@/lib/places'
import { supabaseServiceServer } from '@/lib/server/supabaseServer'

const BUCKET = 'cards-images'
const MISSING_IMAGE_PATH = '__missing__'

export const COMMUNITY_SUBMISSION_TYPES = ['card_edit', 'card_add', 'place_add'] as const
export type CommunitySubmissionType = (typeof COMMUNITY_SUBMISSION_TYPES)[number]

export const COMMUNITY_SUBMISSION_STATUSES = ['pending', 'approved', 'rejected'] as const
export type CommunitySubmissionStatus = (typeof COMMUNITY_SUBMISSION_STATUSES)[number]

export type CommunitySubmissionRow = {
  id: string
  user_id: string
  submission_type: CommunitySubmissionType
  target_type: string
  target_id: string | null
  title: string
  message: string | null
  payload: Record<string, unknown>
  status: CommunitySubmissionStatus
  admin_comment: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export type ContributorScoreRow = {
  user_id: string
  points: number
  approved_count: number
  rejected_count: number
}

export function normalizeCode(value: string | null | undefined) {
  return (value || '').trim().toUpperCase()
}

function extractNumber(baseCode: string) {
  const parts = baseCode.split('-')
  return parts[1] || null
}

export function getSubmissionPoints(type: CommunitySubmissionType) {
  if (type === 'place_add') return 6
  return type === 'card_add' ? 10 : 3
}

export function sanitizeSubmissionPayload(
  submissionType: CommunitySubmissionType,
  rawPayload: Record<string, unknown>
) {
  if (submissionType === 'place_add') {
    const name = String(rawPayload.name || '').trim()
    const city = String(rawPayload.city || '').trim()
    const postalCode = String(rawPayload.postalCode || '').trim()
    const departmentCode = deriveDepartmentCode(postalCode)

    return {
      name,
      slug:
        normalizePlaceSlug(String(rawPayload.slug || '').trim()) ||
        normalizePlaceSlug(`${name}-${city}-${postalCode}`),
      description: String(rawPayload.description || '').trim(),
      imageUrl: String(rawPayload.imageUrl || '').trim(),
      addressLine: String(rawPayload.addressLine || '').trim(),
      city,
      postalCode,
      departmentCode: departmentCode || String(rawPayload.departmentCode || '').trim(),
      country: String(rawPayload.country || '').trim() || 'France',
      discordUrl: String(rawPayload.discordUrl || '').trim(),
      websiteUrl: String(rawPayload.websiteUrl || '').trim(),
      googleMapsUrl: String(rawPayload.googleMapsUrl || '').trim(),
      activities: normalizePlaceActivities(rawPayload.activities)
    }
  }

  if (submissionType === 'card_add') {
    return {
      setCode: normalizeCode(String(rawPayload.setCode || '')),
      baseCode: normalizeCode(String(rawPayload.baseCode || '')),
      printCode: normalizeCode(String(rawPayload.printCode || '')),
      name: String(rawPayload.name || '').trim(),
      rarity: String(rawPayload.rarity || '').trim(),
      type: String(rawPayload.type || '').trim(),
      variantType: String(rawPayload.variantType || 'normal').trim() || 'normal',
      imageUrl: String(rawPayload.imageUrl || '').trim(),
      cardmarketProductId: String(rawPayload.cardmarketProductId || '').trim(),
      availableLanguages: normalizeSetLanguages(
        Array.isArray(rawPayload.availableLanguages) ? (rawPayload.availableLanguages as string[]) : []
      )
    }
  }

  return {
    setCode: normalizeCode(String(rawPayload.setCode || '')),
    currentPrintCode: normalizeCode(String(rawPayload.currentPrintCode || '')),
    nextSetCode: normalizeCode(String(rawPayload.nextSetCode || rawPayload.setCode || '')),
    baseCode: normalizeCode(String(rawPayload.baseCode || '')),
    printCode: normalizeCode(String(rawPayload.printCode || '')),
    name: String(rawPayload.name || '').trim(),
    rarity: String(rawPayload.rarity || '').trim(),
    type: String(rawPayload.type || '').trim(),
    variantType: String(rawPayload.variantType || '').trim(),
    imageUrl: String(rawPayload.imageUrl || '').trim(),
    cardmarketProductId: String(rawPayload.cardmarketProductId || '').trim(),
    setMissingImage: Boolean(rawPayload.setMissingImage),
    availableLanguages: normalizeSetLanguages(
      Array.isArray(rawPayload.availableLanguages) ? (rawPayload.availableLanguages as string[]) : []
    )
  }
}

async function uploadImageToSupabase(imageUrl: string, fileName: string) {
  const normalizedUrl = imageUrl.trim()
  const attempts: Array<Record<string, string>> = [
    {},
    {
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Referer: 'https://www.cardmarket.com/'
    }
  ]

  let imageResponse: Response | null = null
  let lastStatus: number | null = null

  for (const headers of attempts) {
    const res = await fetch(normalizedUrl, {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store',
      headers
    })
    lastStatus = res.status
    if (res.ok) {
      imageResponse = res
      break
    }
  }

  if (!imageResponse) {
    throw new Error(`Erreur telechargement image (HTTP ${lastStatus ?? 'inconnu'})`)
  }

  const contentType = (imageResponse.headers.get('content-type') || '').toLowerCase()
  let extension = 'jpg'
  let uploadContentType = 'image/jpeg'

  if (contentType.includes('png')) {
    extension = 'png'
    uploadContentType = 'image/png'
  } else if (contentType.includes('webp')) {
    extension = 'webp'
    uploadContentType = 'image/webp'
  }

  const arrayBuffer = await imageResponse.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const finalFileName = fileName.replace(/\.jpg$/i, `.${extension}`)

  const { error } = await supabaseServiceServer.storage.from(BUCKET).upload(finalFileName, buffer, {
    contentType: uploadContentType,
    upsert: true
  })

  if (error) throw new Error(error.message)
  return finalFileName
}

async function ensureSetScopedPrintCode(params: {
  printCode: string
  setId: string
  setCode: string
}) {
  const normalized = normalizeCode(params.printCode)
  if (!normalized) return normalized

  const { data: existing } = await supabaseServiceServer
    .from('card_prints')
    .select('distribution_set_id')
    .eq('print_code', normalized)
    .maybeSingle()

  if (!existing || existing.distribution_set_id === params.setId) return normalized
  return `${normalized}_${params.setCode}`
}

async function ensurePrintCodeAvailable(params: {
  currentPrintId?: string
  printCode: string
}) {
  const normalized = normalizeCode(params.printCode)
  if (!normalized) {
    throw new Error('print code invalide')
  }

  const { data: existing, error } = await supabaseServiceServer
    .from('card_prints')
    .select('id')
    .eq('print_code', normalized)
    .maybeSingle()

  if (error) {
    throw new Error(`Erreur verification print code: ${error.message}`)
  }

  if (existing && existing.id !== params.currentPrintId) {
    throw new Error(`Le print code ${normalized} est deja utilise par une autre carte.`)
  }
}

async function ensureNoSemanticDuplicate(params: {
  currentPrintId?: string
  cardId: string
  setId: string
  printCode: string
  variantType: string
}) {
  const targetDisplayCode = getDisplayPrintCode({
    print_code: params.printCode,
    variant_type: params.variantType
  })

  const { data: siblingPrints, error } = await supabaseServiceServer
    .from('card_prints')
    .select('id, print_code, variant_type')
    .eq('distribution_set_id', params.setId)
    .eq('card_id', params.cardId)

  if (error) {
    throw new Error(`Erreur verification doublon: ${error.message}`)
  }

  const conflict = ((siblingPrints as Array<{ id: string; print_code: string | null; variant_type: string | null }> | null) || [])
    .filter((row) => row.id !== params.currentPrintId)
    .find((row) => {
      const siblingDisplayCode = getDisplayPrintCode({
        print_code: row.print_code,
        variant_type: row.variant_type
      })
      return siblingDisplayCode === targetDisplayCode
    })

  if (conflict) {
    throw new Error(
      `Cette validation creerait un doublon visible (${targetDisplayCode}). Corrige le print code ou la variante avant validation.`
    )
  }
}

async function ensureUniquePlaceSlug(slug: string) {
  const baseSlug = normalizePlaceSlug(slug)
  if (!baseSlug) throw new Error('slug de lieu invalide')

  const { data: existing } = await supabaseServiceServer
    .from('places')
    .select('slug')
    .eq('slug', baseSlug)
    .maybeSingle()

  if (!existing) return baseSlug

  let suffix = 2
  while (suffix < 1000) {
    const candidate = `${baseSlug}-${suffix}`
    const { data: candidateExisting } = await supabaseServiceServer
      .from('places')
      .select('slug')
      .eq('slug', candidate)
      .maybeSingle()
    if (!candidateExisting) return candidate
    suffix += 1
  }

  throw new Error('Impossible de generer un slug unique pour ce lieu')
}

export async function applyApprovedSubmission(submission: CommunitySubmissionRow, reviewerUserId: string) {
  const payload = sanitizeSubmissionPayload(submission.submission_type, submission.payload)

  if (submission.submission_type === 'place_add') {
    const name = String(payload.name || '').trim()
    const city = String(payload.city || '').trim()
    const postalCode = String(payload.postalCode || '').trim()
    const slug = await ensureUniquePlaceSlug(String(payload.slug || `${name}-${city}-${postalCode}`))

    if (!name || !city) {
      throw new Error('Proposition de lieu invalide: nom et ville sont obligatoires')
    }

    const departmentCode =
      deriveDepartmentCode(postalCode) || String(payload.departmentCode || '').trim() || null
    const searchText = buildPlaceSearchText({
      name,
      description: String(payload.description || '').trim(),
      city,
      postalCode,
      departmentCode,
      addressLine: String(payload.addressLine || '').trim(),
      country: String(payload.country || '').trim() || 'France'
    })

    const { error: placeError } = await supabaseServiceServer.from('places').insert({
      slug,
      name,
      description: String(payload.description || '').trim() || null,
      image_url: String(payload.imageUrl || '').trim() || null,
      address_line: String(payload.addressLine || '').trim() || null,
      city,
      postal_code: postalCode || null,
      department_code: departmentCode,
      country: String(payload.country || '').trim() || 'France',
      discord_url: String(payload.discordUrl || '').trim() || null,
      website_url: String(payload.websiteUrl || '').trim() || null,
      google_maps_url: String(payload.googleMapsUrl || '').trim() || null,
      activities: normalizePlaceActivities(payload.activities),
      search_text: searchText,
      is_active: true
    })

    if (placeError) {
      throw new Error(`Erreur creation lieu: ${placeError.message}`)
    }

    return {
      slug
    }
  }

  if (submission.submission_type === 'card_add') {
    const setCode = String(payload.setCode || '')
    const baseCode = String(payload.baseCode || '')
    const printCodeRaw = String(payload.printCode || '')
    const name = String(payload.name || '')
    const rarity = String(payload.rarity || '')
    const type = String(payload.type || '')
    const variantType = String(payload.variantType || 'normal')
    const imageUrl = String(payload.imageUrl || '')
    const cardmarketProductId = String(payload.cardmarketProductId || '')
    const availableLanguages = Array.isArray(payload.availableLanguages)
      ? (payload.availableLanguages as string[])
      : []

    if (!setCode || !baseCode || !printCodeRaw || !name) {
      throw new Error('Proposition invalide: baseCode, printCode, setCode et name sont obligatoires')
    }

    const { data: setData, error: setError } = await supabaseServiceServer
      .from('sets')
      .select('id')
      .eq('code', setCode)
      .single()

    if (setError || !setData) throw new Error('Set introuvable')

    let { data: existingCard } = await supabaseServiceServer
      .from('cards')
      .select('*')
      .eq('base_code', baseCode)
      .maybeSingle()

    if (!existingCard) {
      const { data: newCard, error: newCardError } = await supabaseServiceServer
        .from('cards')
        .insert({
          base_code: baseCode,
          base_set_id: setData.id,
          number: extractNumber(baseCode),
          rarity: rarity || null,
          type: type || null
        })
        .select()
        .single()

      if (newCardError || !newCard) {
        throw new Error(`Erreur creation card: ${newCardError?.message || 'inconnue'}`)
      }

      existingCard = newCard
    } else {
      const { error: updateCardError } = await supabaseServiceServer
        .from('cards')
        .update({
          rarity: rarity || existingCard.rarity,
          type: type || existingCard.type
        })
        .eq('id', existingCard.id)

      if (updateCardError) throw new Error(`Erreur update card: ${updateCardError.message}`)
    }

    const { error: translationError } = await supabaseServiceServer.from('card_translations').upsert(
      {
        card_id: existingCard.id,
        locale: 'fr',
        name
      },
      { onConflict: 'card_id,locale' }
    )

    if (translationError) throw new Error(`Erreur update nom: ${translationError.message}`)

    const printCode = await ensureSetScopedPrintCode({
      printCode: printCodeRaw,
      setId: setData.id,
      setCode
    })

    await ensurePrintCodeAvailable({
      printCode
    })

    await ensureNoSemanticDuplicate({
      cardId: existingCard.id,
      setId: setData.id,
      printCode,
      variantType
    })

    const imagePath = `${printCode}.jpg`
    let finalImagePath: string | null = MISSING_IMAGE_PATH
    if (imageUrl) {
      const uploaded = await uploadImageToSupabase(imageUrl, `${setCode}/${imagePath}`)
      finalImagePath = uploaded.split('/').pop() || imagePath
    }

    const { error: printError } = await supabaseServiceServer.from('card_prints').upsert(
      {
        print_code: printCode,
        card_id: existingCard.id,
        distribution_set_id: setData.id,
        variant_type: variantType,
        image_path: finalImagePath,
        available_languages: availableLanguages
      },
      { onConflict: 'print_code' }
    )

    if (printError) throw new Error(`Erreur creation print: ${printError.message}`)

    if (cardmarketProductId) {
      const { data: printData, error: printLookupError } = await supabaseServiceServer
        .from('card_prints')
        .select('id')
        .eq('print_code', printCode)
        .single()

      if (printLookupError || !printData) {
        throw new Error('Print creee mais introuvable pour liaison Cardmarket')
      }

      const { error: linkError } = await supabaseServiceServer.from('cardmarket_print_links').upsert(
        {
          card_print_id: printData.id,
          cardmarket_product_id: cardmarketProductId,
          source: 'community',
          confidence: 90,
          created_by: reviewerUserId
        },
        { onConflict: 'card_print_id' }
      )

      if (linkError) throw new Error(`Erreur liaison Cardmarket: ${linkError.message}`)
    }

    return {
      setCode,
      printCode
    }
  }

  const currentSetCode = String(payload.setCode || '')
  const currentPrintCode = String(payload.currentPrintCode || '')
  const targetSetCode = String(payload.nextSetCode || payload.setCode || '')
  const baseCode = String(payload.baseCode || '')
  const nextPrintCode = String(payload.printCode || '')
  const name = String(payload.name || '')
  const rarity = String(payload.rarity || '')
  const type = String(payload.type || '')
  const variantType = String(payload.variantType || '')
  const imageUrl = String(payload.imageUrl || '')
  const cardmarketProductId = String(payload.cardmarketProductId || '')
  const setMissingImage = Boolean(payload.setMissingImage)
  const availableLanguages = Array.isArray(payload.availableLanguages)
    ? (payload.availableLanguages as string[])
    : []

  if (!currentSetCode || !currentPrintCode) {
    throw new Error('Proposition invalide: setCode et currentPrintCode sont obligatoires')
  }

  const { data: setData, error: setError } = await supabaseServiceServer
    .from('sets')
    .select('id')
    .eq('code', currentSetCode)
    .single()

  if (setError || !setData) throw new Error('Set source introuvable')

  const { data: printData, error: printError } = await supabaseServiceServer
    .from('card_prints')
    .select('id, card_id, distribution_set_id, print_code, image_path')
    .eq('distribution_set_id', setData.id)
    .eq('print_code', currentPrintCode)
    .single()

  if (printError || !printData) throw new Error('Print introuvable pour cette proposition')

  const { data: targetSetData, error: targetSetError } = await supabaseServiceServer
    .from('sets')
    .select('id')
    .eq('code', targetSetCode)
    .single()

  if (targetSetError || !targetSetData) throw new Error('Set de destination introuvable')

  const cardUpdate: Record<string, unknown> = {}
  if (baseCode) {
    cardUpdate.base_code = baseCode
    cardUpdate.number = extractNumber(baseCode)
  }
  if (rarity) cardUpdate.rarity = rarity
  if (type) cardUpdate.type = type
  if (targetSetData.id !== setData.id) cardUpdate.base_set_id = targetSetData.id

  if (Object.keys(cardUpdate).length > 0) {
    const { error: updateCardError } = await supabaseServiceServer
      .from('cards')
      .update(cardUpdate)
      .eq('id', printData.card_id)

    if (updateCardError) throw new Error(`Erreur update card: ${updateCardError.message}`)
  }

  if (name) {
    const { error: translationError } = await supabaseServiceServer.from('card_translations').upsert(
      {
        card_id: printData.card_id,
        locale: 'fr',
        name
      },
      { onConflict: 'card_id,locale' }
    )

    if (translationError) throw new Error(`Erreur update nom: ${translationError.message}`)
  }

  const effectivePrintCode = normalizeCode(String(nextPrintCode || printData.print_code || ''))
  const effectiveVariantType = String(variantType || '')

  await ensurePrintCodeAvailable({
    currentPrintId: printData.id,
    printCode: effectivePrintCode
  })

  await ensureNoSemanticDuplicate({
    currentPrintId: printData.id,
    cardId: printData.card_id,
    setId: targetSetData.id,
    printCode: effectivePrintCode,
    variantType: effectiveVariantType
  })

  const printUpdate: Record<string, unknown> = {}
  if (variantType) printUpdate.variant_type = variantType
  if (availableLanguages.length > 0) printUpdate.available_languages = availableLanguages
  if (nextPrintCode && nextPrintCode !== normalizeCode(printData.print_code)) {
    printUpdate.print_code = nextPrintCode
  }
  if (targetSetData.id !== setData.id) printUpdate.distribution_set_id = targetSetData.id

  if (setMissingImage) {
    printUpdate.image_path = MISSING_IMAGE_PATH
  } else if (imageUrl) {
    const finalPrintCode = String(printUpdate.print_code || printData.print_code)
    const nextImagePath = `${finalPrintCode}.jpg`
    const uploaded = await uploadImageToSupabase(imageUrl, `${targetSetCode}/${nextImagePath}`)
    printUpdate.image_path = uploaded.split('/').pop() || nextImagePath
  }

  if (Object.keys(printUpdate).length > 0) {
    const { error: updatePrintError } = await supabaseServiceServer
      .from('card_prints')
      .update(printUpdate)
      .eq('id', printData.id)
      .eq('distribution_set_id', setData.id)

    if (updatePrintError) throw new Error(`Erreur update print: ${updatePrintError.message}`)
  }

  if (cardmarketProductId) {
    const { error: linkError } = await supabaseServiceServer.from('cardmarket_print_links').upsert(
      {
        card_print_id: printData.id,
        cardmarket_product_id: cardmarketProductId,
        source: 'community',
        confidence: 90,
        created_by: reviewerUserId
      },
      { onConflict: 'card_print_id' }
    )

    if (linkError) throw new Error(`Erreur liaison Cardmarket: ${linkError.message}`)
  }

  return {
    setCode: targetSetCode,
    printCode: String(printUpdate.print_code || printData.print_code)
  }
}
