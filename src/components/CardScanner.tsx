'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabaseClient'
import { normalizeCardCode } from '@/lib/scanner/cardCode'
import { DEFAULT_NUMBER_REGION, regionBetween, type ImageRegion } from '@/lib/scanner/imageRegion'
import { changeCollectionQuantity } from '@/lib/collections/changeQuantity'
import { COLLECTION_LANGUAGE_OPTIONS, resolveAvailableLanguages } from '@/lib/collections/languages'
import { getDisplayPrintCode } from '@/lib/cards/printDisplay'
import type { CatalogueIndexItem } from '@/lib/server/catalogueIndex'
import styles from './CardScanner.module.css'

const imageBase = (process.env.NEXT_PUBLIC_IMAGES_BASE_URL || `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/cards-images`).replace(/\/$/, '')

function cardName(item: CatalogueIndexItem) {
  const translations = item.card?.card_translations
  return translations?.find((row) => row.locale === 'fr')?.name || translations?.find((row) => row.locale === 'en')?.name || translations?.[0]?.name || item.print_code || 'Carte One Piece'
}

export function CardScanner() {
  const { user, loading: authLoading } = useAuth()
  const [phase, setPhase] = useState<'idle' | 'reading' | 'searching' | 'saving'>('idle')
  const [progress, setProgress] = useState('')
  const [preview, setPreview] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [region, setRegion] = useState<ImageRegion>(DEFAULT_NUMBER_REGION)
  const dragStart = useRef<{ x: number; y: number } | null>(null)
  const [code, setCode] = useState('')
  const [detected, setDetected] = useState<string[]>([])
  const [items, setItems] = useState<CatalogueIndexItem[]>([])
  const [searchedCode, setSearchedCode] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [language, setLanguage] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const controller = useRef<AbortController | null>(null)
  const photoUrl = useRef('')
  const saving = useRef(false)
  const selected = items.find((item) => item.id === selectedId)
  const isWorking = phase === 'reading' || phase === 'searching'
  const languages = selected ? resolveAvailableLanguages({ setLanguages: selected.set.availableLanguages, itemLanguages: selected.available_languages }) : []

  useEffect(() => () => {
    controller.current?.abort()
    if (photoUrl.current) URL.revokeObjectURL(photoUrl.current)
  }, [])

  function clearSelection() {
    setItems([])
    setSearchedCode('')
    setSelectedId('')
    setLanguage('')
    setQuantity('1')
    setSuccess('')
    setError('')
  }

  function begin() {
    controller.current?.abort()
    const next = new AbortController()
    controller.current = next
    clearSelection()
    return next.signal
  }

  async function findCards(value: string, signal: AbortSignal) {
    const normalized = normalizeCardCode(value)
    if (!normalized) throw new Error('Saisis un numéro comme OP01-001, ST01-001 ou P-001.')
    setCode(normalized)
    setPhase('searching')
    const response = await fetch(`/api/catalogue/scan?code=${encodeURIComponent(normalized)}`, { signal })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Impossible de rechercher cette carte.')
    if (signal.aborted) return
    setItems(data.items || [])
    setSearchedCode(normalized)
  }

  async function search(value: string) {
    if (saving.current) return
    const signal = begin()
    try { await findCards(value, signal) } catch (cause) {
      if (!signal.aborted) setError(cause instanceof Error ? cause.message : 'Recherche impossible.')
    } finally { if (!signal.aborted) setPhase('idle') }
  }

  async function scan(file?: File, selectedRegion?: ImageRegion) {
    if (!file || saving.current) return
    const signal = begin()
    setDetected([])
    setCode('')
    if (photoUrl.current) URL.revokeObjectURL(photoUrl.current)
    photoUrl.current = ''
    setPreview('')
    if (!file.type.startsWith('image/') || file.size > 20 * 1024 * 1024) {
      setError('Choisis une photo de moins de 20 Mo (JPEG, PNG ou WebP conseillé).')
      setPhase('idle')
      return
    }
    photoUrl.current = URL.createObjectURL(file)
    setPhoto(file)
    if (!selectedRegion) setRegion(DEFAULT_NUMBER_REGION)
    setPreview(photoUrl.current)
    setPhase('reading')
    setProgress('Préparation de la photo…')
    try {
      const { recognizeCard } = await import('@/lib/scanner/recognizeCard')
      if (signal.aborted) return
      const codes = await recognizeCard(file, signal, (message) => { if (!signal.aborted) setProgress(message) }, selectedRegion)
      if (signal.aborted) return
      setDetected(codes)
      if (codes.length === 1) await findCards(codes[0], signal)
      else if (!codes.length) setError('Numéro non reconnu. Sur la photo, encadre uniquement le numéro avec ton doigt, puis appuie sur « Lire la zone sélectionnée ». Tu peux aussi saisir le numéro ci-dessous.')
    } catch (cause) {
      if (!signal.aborted) setError(cause instanceof Error ? cause.message : 'Lecture impossible. Tu peux saisir le numéro ci-dessous.')
    } finally { if (!signal.aborted) setPhase('idle') }
  }

  function reset() {
    if (saving.current) return
    controller.current?.abort()
    clearSelection()
    setDetected([])
    setCode('')
    setPhase('idle')
    if (photoUrl.current) URL.revokeObjectURL(photoUrl.current)
    photoUrl.current = ''
    setPreview('')
    setPhoto(null)
  }

  async function addToCollection() {
    if (saving.current || success || !user || !selected || isWorking) return
    const amount = Number(quantity)
    if (!language || (language !== 'unknown' && !languages.includes(language))) {
      setError('Choisis la langue de cet exemplaire.')
      return
    }
    if (!Number.isInteger(amount) || amount < 1 || amount > 99) {
      setError('La quantité doit être un entier entre 1 et 99.')
      return
    }
    saving.current = true
    setPhase('saving')
    setError('')
    try {
      // Read the existing language quantity for compatibility with the pre-RPC fallback.
      const { data, error: readError } = await supabase.from('collections').select('quantity')
        .eq('user_id', user.id).eq('card_print_id', selected.id).eq('language_code', language).maybeSingle()
      if (readError) throw new Error(readError.message)
      const total = await changeCollectionQuantity({ supabase, userId: user.id, printId: selected.id, languageCode: language, delta: amount, currentQuantity: Number(data?.quantity || 0) })
      setSuccess(`${amount} exemplaire(s) ajouté(s) : ${cardName(selected)} — ${getDisplayPrintCode(selected)}. Total pour cette version et cette langue : ${total}.`)
    } catch {
      setError('Ajout non confirmé. Vérifie ta collection avant de réessayer pour éviter un doublon.')
    } finally {
      saving.current = false
      setPhase('idle')
    }
  }

  return <div className={styles.page}>
    <div className={styles.shell}>
      <Link href="/collection">← Ma collection</Link>
      <header>
        <span className={styles.badge}>Scan par photo · Version d’essai</span>
        <h1>Scanner une carte</h1>
        <p>Photographie son numéro, puis confirme l’illustration et la langue avant de l’ajouter à ta collection.</p>
      </header>

      <section className={styles.panel} aria-labelledby="photo-title">
        <h2 id="photo-title">1. Prends une photo</h2>
        <p>Pose une seule carte à plat, à l’endroit, sans reflet. Le numéro en bas de la carte doit être net. Tu peux aussi photographier uniquement cette zone.</p>
        <div className={styles.actions}>
          <label className={styles.fileButton}>
            Prendre une photo
            <input aria-label="Prendre une photo" type="file" accept="image/*" capture="environment" disabled={phase === 'saving'} onChange={(event) => { void scan(event.target.files?.[0]); event.target.value = '' }} />
          </label>
          <label className={styles.fileButton}>
            Choisir une image
            <input aria-label="Choisir une image" type="file" accept="image/*" disabled={phase === 'saving'} onChange={(event) => { void scan(event.target.files?.[0]); event.target.value = '' }} />
          </label>
        </div>
        <p className={styles.hint}>Ta photo reste sur cet appareil. Le lecteur se télécharge au premier scan ; seule la recherche du numéro utilise le catalogue en ligne.</p>
        {preview && <div className={styles.preview}>
          <p>Encadre uniquement le numéro avec ton doigt ou ta souris, puis relance la lecture.</p>
          <div className={styles.cropImage} onPointerDown={(event) => {
            if (phase === 'saving' || isWorking) return
            event.currentTarget.setPointerCapture(event.pointerId)
            const bounds = event.currentTarget.getBoundingClientRect()
            dragStart.current = { x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height }
          }} onPointerMove={(event) => {
            if (!dragStart.current) return
            const bounds = event.currentTarget.getBoundingClientRect()
            setRegion(regionBetween(dragStart.current, { x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height }))
          }} onPointerUp={() => { dragStart.current = null }} onPointerCancel={() => { dragStart.current = null }}>
          {/* A local object URL never passes through the image optimization server. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Photo de la carte à identifier" draggable={false} />
          <span aria-hidden="true" className={styles.cropRegion} style={{ left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` }} />
          </div>
          <div className={styles.actions}>
            <button type="button" disabled={isWorking || phase === 'saving' || !photo} onClick={() => { if (photo) void scan(photo, region) }}>Lire la zone sélectionnée</button>
            <button type="button" disabled={isWorking || phase === 'saving'} onClick={() => setRegion(DEFAULT_NUMBER_REGION)}>Zone en bas à droite</button>
          </div>
          <details className={styles.cropAdjustments}>
            <summary>Ajuster la zone sans faire glisser</summary>
            <label>Position horizontale<input type="range" min="0" max="95" value={Math.round(region.x * 100)} disabled={isWorking || phase === 'saving'} onChange={(event) => { const x = Number(event.target.value) / 100; setRegion((value) => ({ ...value, x, width: Math.min(value.width, 1 - x) })) }} /></label>
            <label>Position verticale<input type="range" min="0" max="95" value={Math.round(region.y * 100)} disabled={isWorking || phase === 'saving'} onChange={(event) => { const y = Number(event.target.value) / 100; setRegion((value) => ({ ...value, y, height: Math.min(value.height, 1 - y) })) }} /></label>
            <label>Largeur de la zone<input type="range" min="1" max={Math.round((1 - region.x) * 100)} value={Math.round(region.width * 100)} disabled={isWorking || phase === 'saving'} onChange={(event) => setRegion((value) => ({ ...value, width: Number(event.target.value) / 100 }))} /></label>
            <label>Hauteur de la zone<input type="range" min="1" max={Math.round((1 - region.y) * 100)} value={Math.round(region.height * 100)} disabled={isWorking || phase === 'saving'} onChange={(event) => setRegion((value) => ({ ...value, height: Number(event.target.value) / 100 }))} /></label>
          </details>
        </div>}
        {isWorking && <div role="status" className={styles.status}>
          {phase === 'reading' ? progress : 'Recherche des variantes…'}
          <button type="button" onClick={() => { controller.current?.abort(); setPhase('idle') }}>Annuler</button>
        </div>}
        {detected.length > 1 && <div>
          <p>Plusieurs numéros ont été lus. Choisis celui imprimé sur ta carte :</p>
          <div className={styles.actions}>{detected.map((value) => <button key={value} disabled={phase === 'saving'} onClick={() => void search(value)}>{value}</button>)}</div>
        </div>}
      </section>

      <section className={styles.panel} aria-labelledby="code-title">
        <h2 id="code-title">2. Vérifie le numéro</h2>
        <form className={styles.actions} onSubmit={(event) => { event.preventDefault(); void search(code) }}>
          <label className={styles.codeLabel}>Numéro de carte
            <input value={code} placeholder="OP01-001" maxLength={24} autoCapitalize="characters" autoComplete="off" spellCheck={false} disabled={phase === 'saving'} onChange={(event) => {
              controller.current?.abort(); setPhase('idle'); clearSelection(); setCode(event.target.value)
            }} />
          </label>
          <button type="submit" disabled={!code.trim() || phase === 'saving'}>Rechercher</button>
        </form>
        <p className={styles.hint}>Numéros OP, ST, EB, PRB et P pris en charge. Les cartes DON!! sans numéro ne sont pas reconnues dans cette version.</p>
      </section>

      {error && <p role="alert" className={styles.error}>{error}</p>}
      {searchedCode && !items.length && <p role="status" className={styles.panel}>Aucune carte trouvée pour {searchedCode}. Vérifie le numéro ou consulte le <Link href="/catalogue">catalogue</Link>.</p>}
      {items.length > 0 && <section className={styles.panel} aria-labelledby="variant-title">
        <h2 id="variant-title">3. Choisis l’illustration exacte</h2>
        <p>{items.length} version(s) pour {searchedCode}. Compare avec ta photo : un même numéro peut exister dans plusieurs extensions.</p>
        <div className={styles.cards}>
          {items.map((item) => <button type="button" key={item.id} className={styles.card} aria-pressed={selectedId === item.id} disabled={phase === 'saving' || !!success} onClick={() => { setSelectedId(item.id); setLanguage(''); setError('') }}>
            {item.image_path && item.image_path !== '__missing__' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`${imageBase}/${item.set.code}/${item.image_path}`} alt={`${cardName(item)} — ${getDisplayPrintCode(item)}`} loading="lazy" onError={(event) => { event.currentTarget.hidden = true }} />
            ) : <span className={styles.noImage}>Illustration indisponible</span>}
            <strong>{cardName(item)}</strong>
            <span>{getDisplayPrintCode(item)}</span>
            <span>{item.set.code} — {item.set.name}</span>
            <span>{item.variant_type || 'Normal'}{item.card?.rarity ? ` · ${item.card.rarity}` : ''}</span>
            {selectedId === item.id && <strong>✓ Version sélectionnée</strong>}
          </button>)}
        </div>
      </section>}

      {selected && <section className={styles.panel} aria-labelledby="confirm-title">
        <h2 id="confirm-title">4. Confirme l’ajout</h2>
        <p><strong>{cardName(selected)}</strong> · {getDisplayPrintCode(selected)} · {selected.set.code}</p>
        {!authLoading && !user ? <p><Link href="/auth">Connecte-toi</Link> pour enregistrer cette carte dans ta collection.</p> : <form onSubmit={(event) => { event.preventDefault(); void addToCollection() }}>
          <fieldset disabled={phase === 'saving' || !!success || authLoading} className={styles.fields}>
            <label>Langue<select aria-label="Langue" value={language} onChange={(event) => setLanguage(event.target.value)} required>
              <option value="">Choisir la langue</option>
              {COLLECTION_LANGUAGE_OPTIONS.filter((option) => option.code === 'unknown' || languages.includes(option.code)).map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
            </select></label>
            <label>Quantité à ajouter<input type="number" min="1" max="99" step="1" inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></label>
            <button type="submit" disabled={!language}>{phase === 'saving' ? 'Ajout en cours…' : 'Confirmer et ajouter'}</button>
          </fieldset>
        </form>}
      </section>}
      {success && <div className={styles.success} role="status"><p>{success}</p><div className={styles.actions}><button onClick={reset}>Scanner une autre carte</button><Link href="/collection">Voir ma collection</Link></div></div>}
    </div>
  </div>
}
