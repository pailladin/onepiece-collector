'use client'

import { useEffect, useRef, useState } from 'react'

export type HistoryPoint = {
  date: string
  value: number | null
  cardCount: number
  currency: string
}

export const historyMoney = (value: number, currency = 'EUR') =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(value)
export const historyDate = (date: string) =>
  new Intl.DateTimeFormat('fr-FR').format(new Date(`${date}T00:00:00`))

export function CollectionHistoryChart({ series }: { series: HistoryPoint[] }) {
  const container = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  const [active, setActive] = useState<number | null>(null)
  useEffect(() => {
    if (!container.current) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)))
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [])
  const values = series.flatMap((point) => point.value === null ? [] : [point.value])
  if (!values.length) return <p>Aucune mesure disponible pour cette période.</p>
  const low = Math.min(...values)
  const high = Math.max(...values)
  const padding = Math.max((high - low) * 0.12, high * 0.02, 1)
  const min = Math.max(0, low - padding)
  const max = high + padding
  const left = width < 500 ? 66 : 90
  const right = width - 28
  const top = 24
  const bottom = 230
  const firstTime = Date.parse(series[0].date)
  const lastTime = Date.parse(series[series.length - 1].date)
  const points = series.map((row) => ({
    ...row,
    x: firstTime === lastTime ? (left + right) / 2 : left + (Date.parse(row.date) - firstTime) / (lastTime - firstTime) * (right - left),
    y: row.value === null ? bottom : bottom - (row.value - min) / (max - min) * (bottom - top)
  }))
  const tickCount = Math.min(series.length, Math.max(2, Math.floor((right - left) / 100)))
  const tickIndices = new Set(Array.from({ length: tickCount }, (_, i) =>
    tickCount === 1 ? 0 : Math.round(i * (points.length - 1) / (tickCount - 1))))
  // Missing snapshots and missing set valuations must not imply a continuous measured trend.
  const segments: string[] = []
  let segment = ''
  points.forEach((point, i) => {
    if (point.value === null || (i > 0 && Date.parse(point.date) - Date.parse(points[i - 1].date) > 10 * 86400000)) {
      if (segment) segments.push(segment)
      segment = ''
    }
    if (point.value !== null) segment += ` ${point.x},${point.y}`
  })
  if (segment) segments.push(segment)
  const selected = active === null ? null : points[active]
  return <div ref={container} style={{ minWidth: 0 }}>
    <svg viewBox={`0 0 ${width} 270`} style={{ display: 'block', width: '100%', height: 270 }} aria-label="Évolution de la valeur. Chaque mesure est accessible au clavier.">
      {[0, 1, 2, 3].map((step) => {
        const value = min + (max - min) * step / 3
        const y = bottom - (bottom - top) * step / 3
        return <g key={step}>
          <line x1={left} x2={right} y1={y} y2={y} stroke="#e2e8f0" />
          <text x={left - 10} y={y + 4} textAnchor="end" fontSize={12} fill="#64748b">
            {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: series[0].currency, notation: 'compact', maximumFractionDigits: 1 }).format(value)}
          </text>
        </g>
      })}
      {segments.map((line, i) => <polyline key={i} points={line.trim()} fill="none" stroke="#2563eb" strokeWidth={2.5} strokeLinejoin="round" />)}
      {points.map((point, index) => <g key={point.date}>
        {point.value !== null && <circle cx={point.x} cy={point.y} r={active === index ? 6 : 3.5} fill="#0284c7"
          tabIndex={0} role="button" aria-label={`${historyDate(point.date)} : ${historyMoney(point.value, point.currency)}, ${point.cardCount} cartes`}
          style={{ cursor: 'pointer', outlineOffset: 4 }}
          onPointerEnter={() => setActive(index)} onFocus={() => setActive(index)} onClick={() => setActive(index)}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setActive(index) } }}>
          <title>{historyDate(point.date)} : {historyMoney(point.value, point.currency)}</title>
        </circle>}
        {tickIndices.has(index) && <text x={point.x} y={255} textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'} fontSize={12} fill="#64748b">
          {new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(new Date(`${point.date}T00:00:00`))}
        </text>}
      </g>)}
    </svg>
    <div aria-live="polite" style={{ minHeight: 44, padding: '8px 12px', borderRadius: 8, background: '#f1f5f9', fontSize: 14 }}>
      {selected && selected.value !== null
        ? `${historyDate(selected.date)} · ${historyMoney(selected.value, selected.currency)} · ${selected.cardCount} cartes`
        : values.length === 1 ? 'Première mesure enregistrée. La courbe apparaîtra avec les prochaines mesures.'
          : 'Survolez ou touchez un point pour consulter sa valeur exacte.'}
    </div>
  </div>
}
