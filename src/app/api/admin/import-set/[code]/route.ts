import { createClient } from '@supabase/supabase-js'
import { getRequestUser } from '@/lib/server/authUser'
import { isAdminEmail, parseAdminEmails } from '@/lib/admin'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BUCKET = 'cards-images'
const MISSING_IMAGE_PATH = '__missing__'

function formatApiCode(code: string) {
  const raw = (code || '').trim().toUpperCase().replace(/-/g, '')

  // Special products like OP14-EB04 are stored as OP14EB04 in DB/UI.
  const ebMatch = raw.match(/^(OP\d{2})(EB\d{2})$/)
  if (ebMatch) return `${ebMatch[1]}-${ebMatch[2]}`

  if (raw.length <= 2) return raw

  const prefix = raw.slice(0, -2)
  const suffix = raw.slice(-2)
  return `${prefix}-${suffix}`
}

function extractNumber(cardSetId: string) {
  return cardSetId.split('-')[1]
}

function normalizeSetCode(value: string | null | undefined) {
  return (value || '').replace('-', '').toUpperCase()
}

function normalizePrintCode(value: string | null | undefined) {
  return (value || '').trim().toUpperCase()
}

function parseCardName(cardName: string) {
  let variant = 'normal'
  let cleanName = cardName

  const groups = Array.from(cardName.matchAll(/\(([^()]*)\)/g)).map((m) =>
    (m[1] || '').trim()
  )
  const tagRaw =
    [...groups].reverse().find((value) => value && !/^\d+$/.test(value)) || null
  let variantTag: string | null = null

  if (tagRaw) {
    const tag = tagRaw.toLowerCase()
    const isReprintTag = tag === 'reprint'
    variantTag = isReprintTag ? null : tagRaw

    if (tag.includes('pirate foil') || tag === 'foil' || tag.endsWith(' foil')) {
      variant = 'Foil'
    } else if (tag.includes('parallel') || tag.includes('alternate') || tag === 'aa') {
      variant = 'Parallel'
    } else if (tag.includes('wanted poster')) {
      variant = 'Wanted Poster'
    } else if (tag.includes('manga')) {
      variant = 'Manga'
    } else if (tag === 'sp' || tag.includes(' sp')) {
      variant = 'SP'
    }

    if (isReprintTag) {
      cleanName = cardName.replace(/\s*\(reprint\)\s*$/i, '').trim()
    } else {
      cleanName = cardName.replace(/\([^()]*\)\s*$/g, '').trim()
    }
  }

  return { variant, cleanName, variantTag }
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

function extractPrintCodeFromImageUrl(imageUrl: string | null | undefined): string | null {
  const value = (imageUrl || '').trim()
  if (!value) return null

  const match = value.match(/\/([^/?#]+)\.(?:jpg|jpeg|png|webp)(?:[?#].*)?$/i)
  if (!match?.[1]) return null
  return match[1].trim()
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
  if (fromImageUrl) {
    return {
      printCode: fromImageUrl,
      source: 'image_url' as const
    }
  }

  const provided = (params.providedPrintCode || '').trim()
  if (provided) {
    return {
      printCode: provided,
      source: 'api_print_code' as const
    }
  }

  const variantSlug = slugifyVariantTag(params.variantTag)
  return {
    printCode: variantSlug
      ? `${params.baseCode}_${params.setCode}_${variantSlug}`
      : `${params.baseCode}_${params.setCode}`,
    source: 'fallback_set_scoped' as const
  }
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return String(error)
}

async function ensureSetScopedPrintCode(params: {
  printCode: string
  setId: string
  setCode: string
  push: (message: string) => void
}) {
  const normalized = normalizePrintCode(params.printCode)
  if (!normalized) return normalized

  const { data: existing, error } = await supabase
    .from('card_prints')
    .select('distribution_set_id')
    .eq('print_code', normalized)
    .maybeSingle()

  if (error) {
    params.push(
      `Warning verification conflit print_code ${normalized}: ${error.message}`
    )
    return normalized
  }

  if (!existing || existing.distribution_set_id === params.setId) {
    return normalized
  }

  const scopedCode = `${normalized}_${params.setCode}`
  params.push(
    `Conflit print_code ${normalized} (autre set): utilisation de ${scopedCode}`
  )
  return scopedCode
}

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> }
) {
  const userResult = await getRequestUser(request)
  if (!userResult.user) {
    return new Response(
      JSON.stringify({ error: userResult.error || 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS)
  if (!isAdminEmail(userResult.user.email, adminEmails)) {
    return new Response(
      JSON.stringify({ error: 'Forbidden' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const push = (message: string) => {
        controller.enqueue(encoder.encode(`${JSON.stringify({ log: message })}\n`))
      }

      try {
        const body = await request.json().catch(() => ({}))
        const skipImages = Boolean(body?.skipImages)
        const missingImagesOnly = Boolean(body?.missingImagesOnly)
        const onlyPrintCodes = Array.isArray(body?.onlyPrintCodes)
          ? new Set(
              body.onlyPrintCodes
                .map((value: unknown) =>
                  normalizePrintCode(
                    typeof value === 'string' ? value : String(value || '')
                  )
                )
                .filter(Boolean)
            )
          : null

        const { code } = await context.params
        const normalizedImportCode = normalizeSetCode(code)
        push(`Import du set ${code}`)
        if (skipImages) {
          push('Mode rechargement: sans upload d images')
        }
        if (missingImagesOnly) {
          push('Mode reimport images manquantes active')
        }
        if (onlyPrintCodes && onlyPrintCodes.size > 0) {
          push(`Mode import cible: ${onlyPrintCodes.size} print(s) selectionne(s)`)
        }

        const apiCode = formatApiCode(code)
        const res = await fetch(`https://www.optcgapi.com/api/sets/${apiCode}/`)

        if (!res.ok) {
          push(`Erreur API ${res.status}`)
          return
        }

        const apiCards = await res.json()
        if (!Array.isArray(apiCards) || apiCards.length === 0) {
          push('Aucune carte recue')
          return
        }

        const totalCards = apiCards.length
        push(`${totalCards} cartes recues`)

        const setName = apiCards[0]?.set_name || code

        let { data: setData } = await supabase
          .from('sets')
          .select('*')
          .eq('code', code)
          .single()

        if (!setData && missingImagesOnly) {
          push(`Set ${code} introuvable: impossible de reimporter les images`)
          return
        }

        if (!setData) {
          const { data: newSet, error } = await supabase
            .from('sets')
            .insert({ code, name: setName })
            .select()
            .single()

          if (error || !newSet) {
            push(`Erreur creation set: ${error?.message}`)
            return
          }

          setData = newSet
          push('Set cree')
        } else {
          push('Set deja existant')
        }

        const setId = setData.id
        let effectiveOnlyPrintCodes = onlyPrintCodes

        if (missingImagesOnly) {
          const { data: missingImageRows, error: missingImageError } = await supabase
            .from('card_prints')
            .select('print_code')
            .eq('distribution_set_id', setId)
            .eq('image_path', MISSING_IMAGE_PATH)

          if (missingImageError) {
            push(
              `Erreur lecture images manquantes: ${missingImageError.message}`
            )
            return
          }

          const missingImageCodes = new Set(
            (missingImageRows || [])
              .map((row) => normalizePrintCode(row.print_code))
              .filter(Boolean)
          )

          if (effectiveOnlyPrintCodes && effectiveOnlyPrintCodes.size > 0) {
            effectiveOnlyPrintCodes = new Set(
              [...effectiveOnlyPrintCodes].filter((code) =>
                missingImageCodes.has(code)
              )
            )
          } else {
            effectiveOnlyPrintCodes = missingImageCodes
          }

          push(
            `Images manquantes a reimporter: ${effectiveOnlyPrintCodes.size} print(s)`
          )

          if (effectiveOnlyPrintCodes.size === 0) {
            push('Aucune image manquante a reimporter')
            return
          }

          const imageByPrintCode = new Map<string, string>()
          let skippedWrongSetForImages = 0
          let skippedInvalidPrintForImages = 0

          for (const card of apiCards) {
            const apiSetCode = normalizeSetCode(card?.set_id)
            if (apiSetCode && apiSetCode !== normalizedImportCode) {
              skippedWrongSetForImages += 1
              continue
            }
            if (!card?.card_set_id) {
              skippedInvalidPrintForImages += 1
              continue
            }

            const baseCode = card.card_set_id
            const imageUrl = card.card_image?.toString().trim()
            if (!imageUrl) continue

            const { variantTag } = parseCardName(card.card_name || '')
            const variantSlug = slugifyVariantTag(variantTag)
            const directImageCode = extractPrintCodeFromImageUrl(imageUrl)
            const providedPrintCode = card.card_image_id?.toString().trim()
            const fallbackVariantCode = variantSlug
              ? `${baseCode}_${normalizedImportCode}_${variantSlug}`
              : null
            const fallbackSetScopedCode = `${baseCode}_${normalizedImportCode}`

            const candidateCodesRaw = [
              directImageCode,
              providedPrintCode,
              fallbackVariantCode,
              fallbackSetScopedCode
            ].filter(Boolean) as string[]

            let matchedPrintCode: string | null = null
            for (const candidateRaw of candidateCodesRaw) {
              const candidate = normalizePrintCode(candidateRaw)
              if (effectiveOnlyPrintCodes.has(candidate)) {
                matchedPrintCode = candidate
                break
              }
            }

            if (!matchedPrintCode) {
              continue
            }

            if (!imageByPrintCode.has(matchedPrintCode)) {
              imageByPrintCode.set(matchedPrintCode, imageUrl)
            }
          }

          let uploaded = 0
          let missingInApi = 0
          let failed = 0

          for (const printCode of [...effectiveOnlyPrintCodes].sort((a, b) =>
            a.localeCompare(b, 'fr')
          )) {
            const imageUrl = imageByPrintCode.get(printCode)
            if (!imageUrl) {
              missingInApi += 1
              push(`SKIP ${printCode}: image absente dans l API`)
              continue
            }

            const imagePath = `${printCode}.jpg`
            const fileName = `${code}/${imagePath}`

            try {
              push(`Upload image ${fileName}`)
              await uploadImageToSupabase(imageUrl, fileName)

              const { error: updateError } = await supabase
                .from('card_prints')
                .update({ image_path: imagePath })
                .eq('distribution_set_id', setId)
                .eq('print_code', printCode)

              if (updateError) {
                failed += 1
                push(`Erreur update image_path ${printCode}: ${updateError.message}`)
                continue
              }

              uploaded += 1
              push(`OK image ${printCode}`)
            } catch (imgError: unknown) {
              failed += 1
              push(`Erreur image ${printCode}: ${toErrorMessage(imgError)}`)
            }
          }

          if (skippedWrongSetForImages > 0) {
            push(
              `Resume: ${skippedWrongSetForImages} print(s) API ignore(s) (hors set ${code})`
            )
          }
          if (skippedInvalidPrintForImages > 0) {
            push(
              `Resume: ${skippedInvalidPrintForImages} print(s) API ignore(s) (donnees invalides)`
            )
          }
          push(`Resume images: ${uploaded} reimportee(s), ${missingInApi} introuvable(s), ${failed} erreur(s)`)
          push('Reimport images manquantes termine')
          return
        }

        let skippedInvalidPrints = 0
        let skippedWrongSet = 0
        let skippedImageUploads = 0
        let skippedNotSelected = 0

        for (const [index, card] of apiCards.entries()) {
          const progress = `${index + 1}/${totalCards}`
          const apiSetCode = normalizeSetCode(card?.set_id)
          if (apiSetCode && apiSetCode !== normalizedImportCode) {
            skippedWrongSet += 1
            push(
              `[${progress}] SKIP hors set ${code}: ${card?.card_image_id || card?.card_set_id || 'inconnu'} (set_id=${card?.set_id})`
            )
            continue
          }

          if (!card?.card_set_id) {
            skippedInvalidPrints += 1
            push(`[${progress}] SKIP print invalide: card_set_id manquant`)
            continue
          }

          const baseCode = card.card_set_id
          const imageUrl = card.card_image?.toString().trim()
          const { variant: variantFromName, cleanName, variantTag } = parseCardName(
            card.card_name || ''
          )
          const resolved = resolvePrintCode({
            providedPrintCode: card.card_image_id?.toString().trim(),
            imageUrl,
            baseCode,
            setCode: normalizedImportCode,
            variantTag
          })
          const printCode = await ensureSetScopedPrintCode({
            printCode: resolved.printCode,
            setId,
            setCode: normalizedImportCode,
            push
          })

          if (resolved.source === 'image_url') {
            push(
              `[${progress}] card_image_id manquant pour ${baseCode}: print_code deduit de l URL (${printCode})`
            )
          }
          if (resolved.source === 'fallback_set_scoped') {
            push(
              `[${progress}] card_image_id/image manquant pour ${baseCode}: fallback print_code=${printCode}`
            )
          }

          const normalizedPrintCode = normalizePrintCode(printCode)
          if (
            effectiveOnlyPrintCodes &&
            effectiveOnlyPrintCodes.size > 0 &&
            !effectiveOnlyPrintCodes.has(normalizedPrintCode)
          ) {
            skippedNotSelected += 1
            push(`[${progress}] SKIP non selectionne: ${normalizedPrintCode}`)
            continue
          }

          const number = extractNumber(baseCode)

          let { data: existingCard } = await supabase
            .from('cards')
            .select('*')
            .eq('base_code', baseCode)
            .single()

          if (!existingCard) {
            const { data: newCard, error } = await supabase
              .from('cards')
              .insert({
                base_code: baseCode,
                base_set_id: setId,
                number,
                rarity: card.rarity,
                type: card.card_type
              })
              .select()
              .single()

            if (error || !newCard) {
              push(`Erreur insertion card ${baseCode}: ${error?.message}`)
              continue
            }

            existingCard = newCard

            await supabase.from('card_translations').upsert(
              {
                card_id: newCard.id,
                locale: 'fr',
                name: cleanName
              },
              { onConflict: 'card_id,locale' }
            )
          }

          const suffix = (printCode || '').split('_')[1] || ''
          const variant =
            variantFromName !== 'normal'
              ? variantFromName
              : /^p\d+$/i.test(suffix)
                ? 'Parallel'
                : 'normal'

          if (!skipImages && !imageUrl) {
            push(`[${progress}] Image manquante pour ${printCode}: placeholder utilise`)
          }

          const imagePath = `${printCode}.jpg`

          let finalImagePath: string | null = imagePath

          if (!skipImages && imageUrl) {
            const fileName = `${code}/${imagePath}`
            push(`[${progress}] Upload image ${fileName}`)

            try {
              await uploadImageToSupabase(imageUrl, fileName)
            } catch (imgError: unknown) {
              push(`[${progress}] Erreur image ${printCode}: ${toErrorMessage(imgError)}`)
              finalImagePath = MISSING_IMAGE_PATH
            }
          } else if (!skipImages && !imageUrl) {
            finalImagePath = MISSING_IMAGE_PATH
          } else {
            skippedImageUploads += 1
          }

          const printPayload: Record<string, unknown> = {
            print_code: printCode,
            card_id: existingCard.id,
            distribution_set_id: setId,
            variant_type: variant
          }

          if (!skipImages) {
            printPayload.image_path = finalImagePath
          }

          const { error: printError } = await supabase
            .from('card_prints')
            .upsert(printPayload, { onConflict: 'print_code' })

          if (printError) {
            push(`[${progress}] Erreur print ${printCode}: ${printError.message}`)
          } else {
            push(`[${progress}] OK print ${printCode}`)
          }
        }

        if (skippedInvalidPrints > 0) {
          push(`Resume: ${skippedInvalidPrints} print(s) ignore(s) (donnees invalides)`)
        }
        if (skippedWrongSet > 0) {
          push(`Resume: ${skippedWrongSet} print(s) ignore(s) (hors set ${code})`)
        }
        if (skipImages) {
          push(`Resume: ${skippedImageUploads} image(s) non upload (mode sans images)`)
        }
        if (effectiveOnlyPrintCodes && effectiveOnlyPrintCodes.size > 0) {
          push(`Resume: ${skippedNotSelected} print(s) ignore(s) (non selectionnes)`)
        }
        push('Import termine avec succes')
      } catch (error: unknown) {
        push(`Erreur serveur: ${toErrorMessage(error)}`)
      } finally {
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    }
  })
}
