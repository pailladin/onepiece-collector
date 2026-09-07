'use client'

import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getCollectionLanguageLabel, normalizeCollectionLanguage } from '@/lib/collections/languages'
import type { TradeOffers } from '@/lib/collections/useTradeOffers'
import styles from './TradeOfferButton.module.css'

export function TradeOfferButton({ printId, name, offers }: { printId: string; name: string; offers: TradeOffers }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const rows = offers.rows.filter(row => row.card_print_id === printId && (row.quantity || 0) > 0)
  const total = rows.reduce((sum, row) => sum + (row.trade_quantity || 0), 0)

  return <>
    <button type="button" className={styles.toggle} data-active={total > 0} aria-haspopup="dialog"
      title={total > 0 ? 'Modifier les exemplaires à échanger' : 'Proposer cette carte à l’échange'}
      aria-label={`${total > 0 ? 'Modifier' : 'Proposer'} ${name} à l’échange`}
      onClick={() => { setOpen(true); void offers.reload() }}>
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4" /></svg>
      {total > 0 ? `À l’échange · ${total}` : 'À l’échange'}
    </button>
    {open && typeof document !== 'undefined' && createPortal(
      <dialog ref={node => { dialog.current = node; if (node && !node.open) node.showModal() }} className={styles.dialog} aria-label={`Échange : ${name}`}
        onClose={() => setOpen(false)} onClick={event => { if (event.target === dialog.current) dialog.current?.close() }}>
        {open && <div className={styles.content}>
          <div className={styles.heading}><h2>Proposer à l’échange</h2><button type="button" autoFocus onClick={() => dialog.current?.close()} aria-label="Fermer">✕</button></div>
          <p className={styles.name}>{name}</p>
          <p>Choisis les exemplaires à proposer. Ils restent dans ta collection.</p>
          {offers.loading && <p role="status">Chargement…</p>}
          {offers.error && <div role="alert"><p>{offers.error}</p><button type="button" onClick={() => void offers.reload()}>Réessayer</button></div>}
          {!offers.loading && !offers.error && rows.length === 0 && <p>Tu ne possèdes plus cette carte.</p>}
          {!offers.error && rows.map(row => {
            const language = normalizeCollectionLanguage(row.language_code)
            const quantity = row.trade_quantity || 0
            return <div key={language} className={styles.row}>
              <div><strong>{getCollectionLanguageLabel(language)}</strong><small>{row.quantity} possédé(s)</small></div>
              <div className={styles.stepper}>
                <button type="button" disabled={offers.busy || quantity === 0} aria-label={`Retirer un exemplaire à échanger en ${getCollectionLanguageLabel(language)}`} onClick={() => void offers.save(printId, language, quantity - 1)}>−</button>
                <output aria-live="polite">{quantity}</output>
                <button type="button" disabled={offers.busy || quantity >= (row.quantity || 0)} aria-label={`Ajouter un exemplaire à échanger en ${getCollectionLanguageLabel(language)}`} onClick={() => void offers.save(printId, language, quantity + 1)}>+</button>
              </div>
            </div>
          })}
          <p className={styles.hint}>{offers.busy ? 'Enregistrement…' : 'Modifications enregistrées automatiquement. Mets la quantité à 0 pour retirer une offre.'}</p>
          <button type="button" className={styles.done} onClick={() => dialog.current?.close()}>Terminé</button>
        </div>}
      </dialog>, document.body)}
  </>
}
