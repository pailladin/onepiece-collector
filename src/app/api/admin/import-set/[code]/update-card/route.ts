import { NextResponse } from 'next/server'
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

function normalizeCode(value: string | null | undefined) {
  return (value || '').trim().toUpperCase()
}

function extractNumber(baseCode: string) {
  const parts = baseCode.split('-')
  return parts[1] || null
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
    throw new Error(
      `Erreur telechargement image (HTTP ${lastStatus ?? 'inconnu'})`
    )
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
  } else if (contentType.includes('jpeg') || contentType.includes('jpg')) {
    extension = 'jpg'
    uploadContentType = 'image/jpeg'
  } else {
    const urlMatch = imageUrl.match(/\.((?:jpe?g|png|webp))(?:[?#].*)?$/i)
    const fromUrl = (urlMatch?.[1] || '').toLowerCase()
    if (fromUrl === 'png') {
      extension = 'png'
      uploadContentType = 'image/png'
    } else if (fromUrl === 'webp') {
      extension = 'webp'
      uploadContentType = 'image/webp'
    } else if (fromUrl === 'jpg' || fromUrl === 'jpeg') {
      extension = 'jpg'
      uploadContentType = 'image/jpeg'
    }
  }

  const arrayBuffer = await imageResponse.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const finalFileName = fileName.replace(/\.jpg$/i, `.${extension}`)

  const { error } = await supabase.storage.from(BUCKET).upload(finalFileName, buffer, {
    contentType: uploadContentType,
    upsert: true
  })

  if (error) throw new Error(error.message)
  return finalFileName
}

export async function POST(
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

  const setCode = normalizeCode((await context.params).code)
  const body = await request.json().catch(() => ({}))

  const printId = String(body?.printId || '').trim()
  if (!printId) {
    return NextResponse.json({ error: 'printId requis' }, { status: 400 })
  }

  const { data: setData, error: setError } = await supabase
    .from('sets')
    .select('id')
    .eq('code', setCode)
    .single()

  if (setError || !setData) {
    return NextResponse.json({ error: 'Set introuvable' }, { status: 404 })
  }

  const { data: printData, error: printError } = await supabase
    .from('card_prints')
    .select('id, card_id, distribution_set_id, print_code, image_path')
    .eq('id', printId)
    .single()

  if (printError || !printData || printData.distribution_set_id !== setData.id) {
    return NextResponse.json({ error: 'Print introuvable dans ce set' }, { status: 404 })
  }

  const baseCodeInput = String(body?.baseCode || '').trim()
  const nameInput = String(body?.name || '').trim()
  const rarityInput = String(body?.rarity || '').trim()
  const typeInput = String(body?.type || '').trim()
  const variantTypeInput = String(body?.variantType || '').trim()
  const nextPrintCodeRaw = String(body?.printCode || printData.print_code || '').trim()
  const imageUrl = String(body?.imageUrl || '').trim()
  const setMissingImage = Boolean(body?.setMissingImage)

  const nextPrintCode = normalizeCode(nextPrintCodeRaw)
  if (!nextPrintCode) {
    return NextResponse.json({ error: 'printCode invalide' }, { status: 400 })
  }

  if (nextPrintCode !== normalizeCode(printData.print_code)) {
    const { data: conflict } = await supabase
      .from('card_prints')
      .select('id')
      .eq('print_code', nextPrintCode)
      .maybeSingle()

    if (conflict && conflict.id !== printId) {
      return NextResponse.json(
        { error: `print_code deja utilise: ${nextPrintCode}` },
        { status: 409 }
      )
    }
  }

  const cardUpdate: Record<string, unknown> = {}
  if (baseCodeInput) {
    cardUpdate.base_code = normalizeCode(baseCodeInput)
    cardUpdate.number = extractNumber(normalizeCode(baseCodeInput))
  }
  if ('rarity' in body) cardUpdate.rarity = rarityInput || null
  if ('type' in body) cardUpdate.type = typeInput || null

  if (Object.keys(cardUpdate).length > 0) {
    const { error: updateCardError } = await supabase
      .from('cards')
      .update(cardUpdate)
      .eq('id', printData.card_id)

    if (updateCardError) {
      return NextResponse.json(
        { error: `Erreur update card: ${updateCardError.message}` },
        { status: 500 }
      )
    }
  }

  if (nameInput) {
    const { error: translationError } = await supabase.from('card_translations').upsert(
      {
        card_id: printData.card_id,
        locale: 'fr',
        name: nameInput
      },
      { onConflict: 'card_id,locale' }
    )

    if (translationError) {
      return NextResponse.json(
        { error: `Erreur update nom: ${translationError.message}` },
        { status: 500 }
      )
    }
  }

  const printUpdate: Record<string, unknown> = {}
  if ('variantType' in body) printUpdate.variant_type = variantTypeInput || 'normal'
  if (nextPrintCode !== normalizeCode(printData.print_code)) {
    printUpdate.print_code = nextPrintCode
  }

  if (setMissingImage) {
    printUpdate.image_path = MISSING_IMAGE_PATH
  } else if (imageUrl) {
    const nextImagePath = `${nextPrintCode}.jpg`
    try {
      const uploadedFileName = await uploadImageToSupabase(
        imageUrl,
        `${setCode}/${nextImagePath}`
      )
      printUpdate.image_path = uploadedFileName.split('/').pop() || nextImagePath
    } catch (error: unknown) {
      return NextResponse.json(
        {
          error:
            error instanceof Error ? error.message : 'Erreur upload image'
        },
        { status: 502 }
      )
    }
  }

  if (Object.keys(printUpdate).length > 0) {
    const { error: updatePrintError } = await supabase
      .from('card_prints')
      .update(printUpdate)
      .eq('id', printId)
      .eq('distribution_set_id', setData.id)

    if (updatePrintError) {
      return NextResponse.json(
        { error: `Erreur update print: ${updatePrintError.message}` },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({
    ok: true,
    updated: {
      printId,
      printCode: nextPrintCode
    }
  })
}
