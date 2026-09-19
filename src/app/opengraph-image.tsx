import { ImageResponse } from 'next/og'

export const alt = 'One Piece Collector — Catalogue et collection de cartes One Piece TCG'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', width: '100%', height: '100%', padding: 80, background: 'linear-gradient(135deg, #0f172a, #1e3a8a)', color: '#fff' }}>
      <div style={{ fontSize: 26, color: '#fbbf24', marginBottom: 28 }}>CATALOGUE · COLLECTION · ÉCHANGES</div>
      <div style={{ fontSize: 82, fontWeight: 700 }}>One Piece Collector</div>
      <div style={{ fontSize: 34, color: '#dbeafe', marginTop: 30 }}>Toutes tes cartes One Piece TCG au même endroit.</div>
    </div>, size
  )
}
