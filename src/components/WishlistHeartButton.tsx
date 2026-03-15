'use client'

type Props = {
  active: boolean
  busy?: boolean
  onToggle: () => void
  top?: number
  right?: number
}

export function WishlistHeartButton({
  active,
  busy = false,
  onToggle,
  top = 8,
  right = 8
}: Props) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        if (!busy) onToggle()
      }}
      aria-label={active ? 'Retirer de la wishlist' : 'Ajouter a la wishlist'}
      title={active ? 'Retirer de la wishlist' : 'Ajouter a la wishlist'}
      style={{
        position: 'absolute',
        top,
        right,
        width: 30,
        height: 30,
        borderRadius: 999,
        border: active ? '1px solid #ef4444' : '1px solid #cbd5e1',
        background: active ? '#fff1f2' : 'rgba(255,255,255,0.94)',
        color: active ? '#dc2626' : '#64748b',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: busy ? 'wait' : 'pointer',
        padding: 0,
        zIndex: 3,
        boxShadow: '0 8px 18px -14px #0f172a',
        fontSize: 18,
        lineHeight: 1,
        opacity: busy ? 0.7 : 1
      }}
    >
      {active ? '♥' : '♡'}
    </button>
  )
}

