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

  const flushUi = () =>
    new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve())
    })

  const logStep = async (message: string) => {
    log(message)
    await flushUi()
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

    // Security: infer variant from image filename as fallback.
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

    setReport('=== Debut import ===\n')
    await flushUi()

    const data = await file.arrayBuffer()
    const workbook = XLSX.read(data)
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows: any[] = XLSX.utils.sheet_to_json(sheet)

    await logStep(`Nombre de lignes detectees : ${rows.length}`)

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

      await logStep('---')
      await logStep(`Traitement : ${set_code} / ${base_set_code} / ${card_number}`)
      await logStep(`Variant detectee : ${variant_type}`)

      if (!set_code || !base_set_code || !card_number) {
        await logStep('Ligne invalide (donnees manquantes)')
        continue
      }

      const { data: distributionSet, error: distErr } = await supabase
        .from('sets')
        .select('id')
        .eq('code', set_code)
        .single()

      if (distErr || !distributionSet) {
        await logStep(`Erreur distributionSet: ${distErr?.message}`)
        continue
      }

      const { data: baseSet, error: baseErr } = await supabase
        .from('sets')
        .select('id')
        .eq('code', base_set_code)
        .single()

      if (baseErr || !baseSet) {
        await logStep(`Erreur baseSet: ${baseErr?.message}`)
        continue
      }

      const baseCode = `${base_set_code}-${card_number}`
      const printCode =
        variant_type !== 'normal' ? `${baseCode}_${variant_type}` : baseCode

      await logStep(`baseCode = ${baseCode}`)
      await logStep(`printCode = ${printCode}`)

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
        await logStep(`Erreur creation carte: ${cardErr?.message}`)
        continue
      }

      await logStep(`Carte OK id=${card.id}`)

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

        if (transErr) await logStep(`Erreur traduction: ${transErr.message}`)
        else await logStep('Traductions OK')
      }

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

      if (printErr) await logStep(`Erreur impression: ${printErr.message}`)
      else await logStep('Impression OK')
    }

    await logStep('=== Import termine ===')
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>Import (modele final corrige)</h1>

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
