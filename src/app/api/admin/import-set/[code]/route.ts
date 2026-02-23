import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BUCKET = 'cards-images'

function formatApiCode(code: string) {
  const prefix = code.slice(0, -2)
  const suffix = code.slice(-2)
  return `${prefix}-${suffix}`
}

function extractNumber(cardSetId: string) {
  return cardSetId.split('-')[1]
}

async function uploadImageToSupabase(imageUrl: string, fileName: string) {
  const imageResponse = await fetch(imageUrl)

  if (!imageResponse.ok) {
    throw new Error(`Erreur téléchargement image`)
  }

  const arrayBuffer = await imageResponse.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(fileName, buffer, {
      contentType: 'image/jpeg',
      upsert: true
    })

  if (error) {
    throw new Error(error.message)
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> }
) {
  const logs: string[] = []

  try {
    const { code } = await context.params
    logs.push(`Import du set ${code}`)

    const apiCode = formatApiCode(code)
    const res = await fetch(`https://www.optcgapi.com/api/sets/${apiCode}/`)

    if (!res.ok) {
      logs.push(`Erreur API ${res.status}`)
      return NextResponse.json({ logs }, { status: 500 })
    }

    const apiCards = await res.json()

    if (!Array.isArray(apiCards) || apiCards.length === 0) {
      logs.push('Aucune carte reçue')
      return NextResponse.json({ logs }, { status: 400 })
    }

    logs.push(`${apiCards.length} cartes reçues`)

    const setName = apiCards[0]?.set_name || code

    // 🔹 Vérifier si set existe
    let { data: setData } = await supabase
      .from('sets')
      .select('*')
      .eq('code', code)
      .single()

    if (!setData) {
      const { data: newSet, error } = await supabase
        .from('sets')
        .insert({
          code,
          name: setName
        })
        .select()
        .single()

      if (error || !newSet) {
        logs.push(`Erreur création set: ${error?.message}`)
        return NextResponse.json({ logs }, { status: 500 })
      }

      setData = newSet
      logs.push('Set créé')
    } else {
      logs.push('Set déjà existant')
    }

    const setId = setData.id

    for (const card of apiCards) {
      // 🔒 Filtrage strict du set
      if (!card.card_set_id.startsWith(code)) {
        continue
      }

      const baseCode = card.card_set_id
      const number = extractNumber(baseCode)

      // 🔹 Vérifier si carte existe
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
          logs.push(`Erreur insertion card ${baseCode}: ${error?.message}`)
          continue
        }

        existingCard = newCard

        await supabase.from('card_translations').insert({
          card_id: newCard.id,
          locale: 'fr',
          name: card.card_name
        })
      }

      // 🔹 Upload image
      const fileName = `${code}/${baseCode}.jpg`

      logs.push(`Upload image ${fileName}`)

      try {
        await uploadImageToSupabase(card.card_image, fileName)
      } catch (imgError: any) {
        logs.push(`Erreur image ${baseCode}: ${imgError.message}`)
      }

      // 🔹 Upsert impression
      const { error: printError } = await supabase.from('card_prints').upsert(
        {
          print_code: baseCode,
          card_id: existingCard.id,
          distribution_set_id: setId,
          variant_type: 'normal',
          image_path: `${baseCode}.jpg`
        },
        { onConflict: 'print_code' }
      )

      if (printError) {
        logs.push(`Erreur print ${baseCode}: ${printError.message}`)
      }
    }

    logs.push('Import terminé avec succès')

    return NextResponse.json({ logs })
  } catch (error: any) {
    logs.push(`Erreur serveur: ${error.message}`)
    return NextResponse.json({ logs }, { status: 500 })
  }
}
