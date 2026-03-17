'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { parseCardCode } from '@/lib/sorting/parseCardCode'
import { useAuth } from '@/lib/auth'

type TradeItem = {
  id: string
  itemKey: string
  setCode: string
  displayCode: string
  name: string
  rarity: string
  type: string
  languageCode: string
  languageLabel: string
  languageFlag: string
  giverQty: number
  needQty: number
}

function sortTradeItems(items: TradeItem[]) {
  return [...items].sort((a, b) => {
    if (a.setCode !== b.setCode) return a.setCode.localeCompare(b.setCode)

    const pa = parseCardCode(a.displayCode)
    const pb = parseCardCode(b.displayCode)
    if (pa.number !== pb.number) return pa.number - pb.number
    if (pa.variant !== pb.variant) return pa.variant - pb.variant
    return a.displayCode.localeCompare(b.displayCode)
  })
}

function groupTradeItemsBySet(items: TradeItem[]) {
  const grouped = new Map<string, TradeItem[]>()
  for (const item of sortTradeItems(items)) {
    if (!grouped.has(item.setCode)) grouped.set(item.setCode, [])
    grouped.get(item.setCode)?.push(item)
  }
  return [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

export default function FriendTradePage() {
  const { user, loading: authLoading } = useAuth()
  const userId = user?.id ?? null
  const params = useParams()
  const friendId = Array.isArray(params.friendId) ? params.friendId[0] : params.friendId

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [friendUsername, setFriendUsername] = useState('Ami')
  const [friendCanGive, setFriendCanGive] = useState<TradeItem[]>([])
  const [iCanGive, setICanGive] = useState<TradeItem[]>([])
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const loadTrade = async () => {
      if (!userId || !friendId) return
      setLoading(true)
      setError(null)

      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      const res = await fetch(`/api/friends/${encodeURIComponent(friendId)}/trade`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data?.error || 'Erreur chargement echanges')
        setFriendUsername('Ami')
        setFriendCanGive([])
        setICanGive([])
        setLoading(false)
        return
      }

      setFriendUsername(data?.username || 'Ami')
      setFriendCanGive(Array.isArray(data?.friendCanGive) ? data.friendCanGive : [])
      setICanGive(Array.isArray(data?.iCanGive) ? data.iCanGive : [])
      setLoading(false)
    }

    void loadTrade()
  }, [friendId, userId])

  const totalPotential = useMemo(
    () => friendCanGive.length + iCanGive.length,
    [friendCanGive.length, iCanGive.length]
  )

  if (authLoading || loading) {
    return <div style={{ padding: 40 }}>Chargement...</div>
  }

  if (!user) {
    return <div style={{ padding: 40 }}>Connecte-toi pour voir les echanges.</div>
  }

  if (!friendId) {
    return <div style={{ padding: 40 }}>Ami introuvable.</div>
  }

  const renderList = (items: TradeItem[], emptyText: string, sideKey: string) => {
    if (items.length === 0) {
      return (
        <div
          style={{
            fontSize: 14,
            color: '#64748b',
            background: '#fff',
            border: '1px dashed #cbd5e1',
            borderRadius: 10,
            padding: 12
          }}
        >
          {emptyText}
        </div>
      )
    }
    const grouped = groupTradeItemsBySet(items)
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        {grouped.map(([setCode, setItems]) => (
          <div key={`${sideKey}-${setCode}`}>
            {(() => {
              const groupKey = `${sideKey}:${setCode}`
              const isExpanded = expandedGroups[groupKey] ?? false
              return (
                <>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      setExpandedGroups((prev) => ({
                        ...prev,
                        [groupKey]: !(prev[groupKey] ?? false)
                      }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setExpandedGroups((prev) => ({
                          ...prev,
                          [groupKey]: !(prev[groupKey] ?? false)
                        }))
                      }
                    }}
                    style={{
                      width: '100%',
                      maxWidth: '100%',
                      boxSizing: 'border-box',
                      textAlign: 'left',
                      fontWeight: 700,
                      color: '#0f172a',
                      marginBottom: 6,
                      border: '1px solid #cbd5e1',
                      background: '#fff',
                      borderRadius: 8,
                      padding: '8px 10px',
                      cursor: 'pointer'
                    }}
                  >
                    {isExpanded ? 'v' : '>'} {setCode} ({setItems.length})
                  </div>
                  {isExpanded && (
                    <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
                      {setItems.map((item) => (
                        <div
                          key={item.itemKey}
                          style={{
                            border: '1px solid #dbeafe',
                            borderRadius: 10,
                            background: '#fff',
                            padding: '10px 12px',
                            boxSizing: 'border-box',
                            width: '100%',
                            maxWidth: '100%',
                            display: 'grid',
                            gridTemplateColumns: '120px 1fr auto',
                            gap: 12,
                            alignItems: 'center'
                          }}
                        >
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>{item.displayCode}</div>
                          <div>
                            <div style={{ fontWeight: 600 }}>{item.name}</div>
                            <div style={{ fontSize: 12, color: '#475569' }}>
                              {item.setCode} - {item.rarity} - {item.type} - {item.languageFlag}{' '}
                              {item.languageLabel}
                            </div>
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: '#0f172a',
                              fontWeight: 700,
                              whiteSpace: 'nowrap'
                            }}
                          >
                            x{item.giverQty} en double
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '18px 28px 28px',
        background:
          'radial-gradient(circle at 12% 8%, #fff4e6 0%, #e0f2fe 40%, #eef2ff 100%)',
        display: 'grid',
        gap: 12,
        alignContent: 'start'
      }}
    >
      <section
        style={{
          border: '1px solid #cfe4ff',
          borderRadius: 14,
          background: 'linear-gradient(145deg, #ffffff 0%, #eff6ff 100%)',
          padding: 14
        }}
      >
        <div style={{ display: 'grid', gap: 8 }}>
          <Link href={`/friends/${friendId}`}>Retour aux collections de cet ami</Link>
          <h1 style={{ margin: 0, fontSize: 30, color: '#0f172a' }}>
            Echanges avec {friendUsername}
          </h1>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div
              style={{
                fontSize: 12,
                background: '#fff',
                border: '1px solid #cbd5e1',
                borderRadius: 999,
                padding: '4px 10px'
              }}
            >
              Potentiel total: <strong>{totalPotential}</strong>
            </div>
            <div
              style={{
                fontSize: 12,
                background: '#fff',
                border: '1px solid #cbd5e1',
                borderRadius: 999,
                padding: '4px 10px'
              }}
            >
              {friendUsername} -&gt; moi: <strong>{friendCanGive.length}</strong>
            </div>
            <div
              style={{
                fontSize: 12,
                background: '#fff',
                border: '1px solid #cbd5e1',
                borderRadius: 999,
                padding: '4px 10px'
              }}
            >
              Moi -&gt; {friendUsername}: <strong>{iCanGive.length}</strong>
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div style={{ color: '#b91c1c', fontWeight: 600, padding: '0 4px' }}>
          {error}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 12
        }}
      >
        <section style={{ border: '1px solid #d1d5db', borderRadius: 12, padding: 12, background: '#ffffffd1' }}>
          <h2 style={{ marginTop: 0, marginBottom: 10, color: '#0f172a' }}>
            {friendUsername} peut me donner
          </h2>
          <div style={{ marginBottom: 10, fontSize: 13, color: '#475569' }}>
            Ses doubles que je n&apos;ai pas encore.
          </div>
          {renderList(friendCanGive, 'Aucune carte trouvee dans ce sens.', 'friendToMe')}
        </section>

        <section style={{ border: '1px solid #d1d5db', borderRadius: 12, padding: 12, background: '#ffffffd1' }}>
          <h2 style={{ marginTop: 0, marginBottom: 10, color: '#0f172a' }}>
            Je peux donner a {friendUsername}
          </h2>
          <div style={{ marginBottom: 10, fontSize: 13, color: '#475569' }}>
            Mes doubles qu&apos;il n&apos;a pas encore.
          </div>
          {renderList(iCanGive, 'Aucune carte trouvee dans ce sens.', 'meToFriend')}
        </section>
      </div>
    </div>
  )
}
