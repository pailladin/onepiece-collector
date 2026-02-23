'use client'

import { useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabaseClient'

export default function ImportPage() {
  const [report, setReport] = useState('')

  const log = (message: string) => {
    console.log(message)
    setReport((prev) => prev + message + '\n')
  }

  const normalizeVariant = (
    variantFromFile: string | undefined,
    imageFileName: string | undefined
  ) => {
    let variant = variantFromFile?.toString().trim()

    if (!variant || variant === '') {
      variant = 'normal'
    }

    variant = variant.toUpperCase()

    if (variant !== 'AA' && variant !== 'SP' && variant !== 'TR') {
      variant = 'normal'
    }

    // Sécurité supplémentaire si fichier image contient _AA / _SP / _TR
    if (imageFileName) {
      if (imageFileName.includes('_AA')) variant = 'AA'
      if (imageFileName.includes('_SP')) variant = 'SP'
      if (imageFileName.includes('_TR')) variant = 'TR'
    }

    return variant
  }

  const handleFileUpload = async (e: any) => {
    const file = e.target.files[0]
    if (!file) return

    setReport('=== Début import ===\n')

    const data = await file.arrayBuffer()
    const workbook = XLSX.read(data)
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows: any[] = XLSX.utils.sheet_to_json(sheet)

    log(`Nombre de lignes détectées : ${rows.length}`)

    for (const row of rows) {
      const set_code = row.set_code?.trim()
      const base_set_code = row.base_set_code?.trim()
      const card_number = row.card_number?.toString().trim()
      const name_fr = row.name_fr
      const name_en = row.name_en
      const rarity = row.rarity
      const type = row.type
      const image_filename = row.image_filename

      const variant_type = normalizeVariant(row.variant_type, image_filename)

      log('---')
      log(`Traitement : ${set_code} / ${base_set_code} / ${card_number}`)
      log(`Variant détectée : ${variant_type}`)

      if (!set_code || !base_set_code || !card_number) {
        log('Ligne invalide (données manquantes)')
        continue
      }

      // 1️⃣ Récupération sets
      const { data: distributionSet, error: distErr } = await supabase
        .from('sets')
        .select('id')
        .eq('code', set_code)
        .single()

      if (distErr || !distributionSet) {
        log(`Erreur distributionSet: ${distErr?.message}`)
        continue
      }

      const { data: baseSet, error: baseErr } = await supabase
        .from('sets')
        .select('id')
        .eq('code', base_set_code)
        .single()

      if (baseErr || !baseSet) {
        log(`Erreur baseSet: ${baseErr?.message}`)
        continue
      }

      const baseCode = `${base_set_code}-${card_number}`

      const printCode =
        variant_type !== 'normal' ? `${baseCode}_${variant_type}` : baseCode

      log(`baseCode = ${baseCode}`)
      log(`printCode = ${printCode}`)

      // 2️⃣ UPSERT carte conceptuelle
      const { data: card, error: cardErr } = await supabase
        .from('cards')
        .upsert(
          {
            base_set_id: baseSet.id,
            number: card_number,
            base_code: baseCode,
            rarity,
            type
          },
          { onConflict: 'base_code' }
        )
        .select()
        .single()

      if (cardErr || !card) {
        log(`Erreur création carte: ${cardErr?.message}`)
        continue
      }

      log(`Carte OK id=${card.id}`)

      // 3️⃣ UPSERT traductions
      const translations = []

      if (name_fr) {
        translations.push({
          card_id: card.id,
          locale: 'fr',
          name: name_fr
        })
      }

      if (name_en) {
        translations.push({
          card_id: card.id,
          locale: 'en',
          name: name_en
        })
      }

      if (translations.length > 0) {
        const { error: transErr } = await supabase
          .from('card_translations')
          .upsert(translations, {
            onConflict: 'card_id,locale'
          })

        if (transErr) log(`Erreur traduction: ${transErr.message}`)
        else log('Traductions OK')
      }

      // 4️⃣ UPSERT impression
      const { error: printErr } = await supabase.from('card_prints').upsert(
        {
          card_id: card.id,
          distribution_set_id: distributionSet.id,
          variant_type,
          print_code: printCode,
          image_path: image_filename
        },
        { onConflict: 'print_code' }
      )

      if (printErr) log(`Erreur impression: ${printErr.message}`)
      else log('Impression OK')
    }

    log('=== Import terminé ===')
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>Import (modèle final corrigé)</h1>

      <input type="file" accept=".xlsx,.xls" onChange={handleFileUpload} />

      <pre
        style={{
          marginTop: 20,
          whiteSpace: 'pre-wrap',
          background: '#f5f5f5',
          padding: 20,
          borderRadius: 8
        }}
      >
        {report}
      </pre>
    </div>
  )
}
