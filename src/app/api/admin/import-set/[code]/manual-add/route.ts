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

async function ensureSetScopedPrintCode(params: {
  printCode: string
  setId: string
  setCode: string
}) {
  const normalized = normalizeCode(params.printCode)
  if (!normalized) return normalized

  const { data: existing } = await supabase
    .from('card_prints')
    .select('distribution_set_id')
    .eq('print_code', normalized)
    .maybeSingle()

  if (!existing || existing.distribution_set_id === params.setId) return normalized
  return `${normalized}_${params.setCode}`
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

  const baseCode = normalizeCode(body?.baseCode)
  const printCodeRaw = normalizeCode(body?.printCode)
  const name = String(body?.name || '').trim()
  const rarity = String(body?.rarity || '').trim()
  const type = String(body?.type || '').trim()
  const variantType = String(body?.variantType || 'normal').trim() || 'normal'
  const imageUrl = String(body?.imageUrl || '').trim()

  if (!baseCode || !printCodeRaw || !name) {
    return NextResponse.json(
      { error: 'baseCode, printCode et name sont obligatoires' },
      { status: 400 }
    )
  }

  const { data: setData, error: setError } = await supabase
    .from('sets')
    .select('id')
    .eq('code', setCode)
    .single()

  if (setError || !setData) {
    return NextResponse.json({ error: 'Set introuvable' }, { status: 404 })
  }

  let { data: existingCard } = await supabase
    .from('cards')
    .select('*')
    .eq('base_code', baseCode)
    .single()

  if (!existingCard) {
    const { data: newCard, error: cardError } = await supabase
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

    if (cardError || !newCard) {
      return NextResponse.json(
        { error: `Erreur creation card: ${cardError?.message}` },
        { status: 500 }
      )
    }

    existingCard = newCard
  } else {
    await supabase
      .from('cards')
      .update({
        rarity: rarity || existingCard.rarity,
        type: type || existingCard.type
      })
      .eq('id', existingCard.id)
  }

  await supabase.from('card_translations').upsert(
    {
      card_id: existingCard.id,
      locale: 'fr',
      name
    },
    { onConflict: 'card_id,locale' }
  )

  const printCode = await ensureSetScopedPrintCode({
    printCode: printCodeRaw,
    setId: setData.id,
    setCode
  })

  const imagePath = `${printCode}.jpg`
  let finalImagePath: string | null = MISSING_IMAGE_PATH
  if (imageUrl) {
    try {
      const uploadedFileName = await uploadImageToSupabase(
        imageUrl,
        `${setCode}/${imagePath}`
      )
      finalImagePath = uploadedFileName.split('/').pop() || imagePath
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

  const { error: printError } = await supabase.from('card_prints').upsert(
    {
      print_code: printCode,
      card_id: existingCard.id,
      distribution_set_id: setData.id,
      variant_type: variantType,
      image_path: finalImagePath
    },
    { onConflict: 'print_code' }
  )

  if (printError) {
    return NextResponse.json(
      { error: `Erreur upsert print: ${printError.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({
    ok: true,
    card: {
      baseCode,
      printCode,
      name,
      variantType,
      imagePath: finalImagePath
    }
  })
}
