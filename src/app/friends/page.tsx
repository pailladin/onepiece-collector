'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabaseClient'

type Profile = {
  id: string
  username: string
  postal_code?: string | null
  discord_username?: string | null
}

type FriendRow = {
  friend_id: string
}

type FriendRequestRow = {
  id: string
  requester_id: string
  recipient_id: string
  status: 'pending' | 'accepted' | 'declined' | 'cancelled'
  requester?: Profile | null
  recipient?: Profile | null
}

function cardStyle() {
  return {
    border: '1px solid #d1d5db',
    borderRadius: 12,
    padding: 12,
    background: '#ffffffd1'
  } as const
}

export default function FriendsPage() {
  const { user, loading } = useAuth()
  const [username, setUsername] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [discordUsername, setDiscordUsername] = useState('')
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Profile[]>([])
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set())
  const [friends, setFriends] = useState<Profile[]>([])
  const [incomingRequests, setIncomingRequests] = useState<FriendRequestRow[]>([])
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequestRow[]>([])
  const [message, setMessage] = useState('')
  const [busyAction, setBusyAction] = useState<string | null>(null)

  const canSaveProfile = useMemo(() => username.trim().length >= 3, [username])

  const getAuthHeader = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    const accessToken = data.session?.access_token
    return accessToken
      ? ({ Authorization: `Bearer ${accessToken}` } as Record<string, string>)
      : ({} as Record<string, string>)
  }, [])

  const getPendingRequestState = useCallback(
    (profileId: string) => {
      const incoming = incomingRequests.find((request) => request.requester_id === profileId)
      if (incoming) return { type: 'incoming' as const, request: incoming }

      const outgoing = outgoingRequests.find((request) => request.recipient_id === profileId)
      if (outgoing) return { type: 'outgoing' as const, request: outgoing }

      return null
    },
    [incomingRequests, outgoingRequests]
  )

  const loadFriendships = useCallback(async (userId: string) => {
    const [{ data: rows }, { data: incomingData }, { data: outgoingData }] = await Promise.all([
      supabase.from('friends').select('friend_id').eq('user_id', userId),
      supabase
        .from('friend_requests')
        .select('id, requester_id, recipient_id, status')
        .eq('recipient_id', userId)
        .eq('status', 'pending'),
      supabase
        .from('friend_requests')
        .select('id, requester_id, recipient_id, status')
        .eq('requester_id', userId)
        .eq('status', 'pending')
    ])

    const ids = (rows as FriendRow[] | null)?.map((row) => row.friend_id) || []
    setFriendIds(new Set(ids))

    if (ids.length === 0) {
      setFriends([])
    } else {
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, username, discord_username')
        .in('id', ids)
        .order('username')

      setFriends((profilesData as Profile[] | null) || [])
    }

    const incomingRows = (incomingData as FriendRequestRow[] | null) || []
    const outgoingRows = (outgoingData as FriendRequestRow[] | null) || []
    const requestProfileIds = [
      ...new Set([
        ...incomingRows.map((row) => row.requester_id),
        ...outgoingRows.map((row) => row.recipient_id)
      ])
    ]

    let requestProfilesById = new Map<string, Profile>()
    if (requestProfileIds.length > 0) {
      const { data: requestProfilesData } = await supabase
        .from('profiles')
        .select('id, username, discord_username')
        .in('id', requestProfileIds)

      requestProfilesById = new Map(
        (((requestProfilesData as Profile[] | null) || []) as Profile[]).map((profile) => [
          profile.id,
          profile
        ])
      )
    }

    setIncomingRequests(
      incomingRows.map((row) => ({
        ...row,
        requester: requestProfilesById.get(row.requester_id) || null
      }))
    )
    setOutgoingRequests(
      outgoingRows.map((row) => ({
        ...row,
        recipient: requestProfilesById.get(row.recipient_id) || null
      }))
    )
  }, [])

  useEffect(() => {
    const loadData = async () => {
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, username, postal_code, discord_username')
        .eq('id', user.id)
        .maybeSingle()

      setUsername(profile?.username || '')
      setPostalCode(profile?.postal_code || '')
      setDiscordUsername(profile?.discord_username || '')
      await loadFriendships(user.id)
    }

    void loadData()
  }, [loadFriendships, user])

  useEffect(() => {
    const runSearch = async () => {
      if (!user || search.trim().length < 2) {
        setSearchResults([])
        return
      }

      const { data } = await supabase
        .from('profiles')
        .select('id, username, discord_username')
        .ilike('username', `%${search.trim()}%`)
        .neq('id', user.id)
        .limit(10)

      setSearchResults((data as Profile[] | null) || [])
    }

    void runSearch()
  }, [search, user])

  const saveProfile = async () => {
    if (!user || !canSaveProfile) return

    setMessage('')
    const normalizedPostalCode = postalCode.trim()
    const normalizedDiscordUsername = discordUsername.trim()

    if (normalizedPostalCode && !/^\d{5}$/.test(normalizedPostalCode)) {
      setMessage('Code postal invalide. Renseigne 5 chiffres.')
      return
    }

    const { error } = await supabase.from('profiles').upsert(
      {
        id: user.id,
        username: username.trim(),
        postal_code: normalizedPostalCode || null,
        discord_username: normalizedDiscordUsername || null
      },
      { onConflict: 'id' }
    )

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Infos partagees mises a jour.')
  }

  const runFriendAction = useCallback(
    async (payload: {
      action: 'send' | 'accept' | 'decline' | 'cancel' | 'remove'
      targetUserId?: string
      requestId?: string
    }) => {
      const authHeaders = await getAuthHeader()
      const res = await fetch('/api/friends/manage', {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || 'Erreur action ami')
      }
    },
    [getAuthHeader]
  )

  const sendFriendRequest = async (recipientId: string) => {
    if (!user) return
    setBusyAction(`send:${recipientId}`)
    setMessage('')

    try {
      const existingRequest = getPendingRequestState(recipientId)
      if (existingRequest?.type === 'incoming') {
        await runFriendAction({ action: 'accept', requestId: existingRequest.request.id })
        setMessage('Demande d ami acceptee.')
      } else {
        await runFriendAction({ action: 'send', targetUserId: recipientId })
        setMessage('Demande d ami envoyee.')
      }
      await loadFriendships(user.id)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erreur envoi demande')
    } finally {
      setBusyAction(null)
    }
  }

  const acceptFriendRequest = async (requestId: string) => {
    if (!user) return
    setBusyAction(`accept:${requestId}`)
    setMessage('')

    try {
      await runFriendAction({ action: 'accept', requestId })
      await loadFriendships(user.id)
      setMessage('Demande d ami acceptee.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erreur acceptation demande')
    } finally {
      setBusyAction(null)
    }
  }

  const declineFriendRequest = async (requestId: string) => {
    if (!user) return
    setBusyAction(`decline:${requestId}`)
    setMessage('')

    try {
      await runFriendAction({ action: 'decline', requestId })
      await loadFriendships(user.id)
      setMessage('Demande refusee.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erreur refus demande')
    } finally {
      setBusyAction(null)
    }
  }

  const cancelOutgoingRequest = async (requestId: string) => {
    if (!user) return
    setBusyAction(`cancel:${requestId}`)
    setMessage('')

    try {
      await runFriendAction({ action: 'cancel', requestId })
      await loadFriendships(user.id)
      setMessage('Demande annulee.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erreur annulation demande')
    } finally {
      setBusyAction(null)
    }
  }

  const removeFriend = async (friendId: string) => {
    if (!user) return
    setBusyAction(`remove:${friendId}`)
    setMessage('')

    try {
      await runFriendAction({ action: 'remove', targetUserId: friendId })
      await loadFriendships(user.id)
      setMessage('Ami supprime des deux cotes.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erreur suppression ami')
    } finally {
      setBusyAction(null)
    }
  }

  if (loading) {
    return <div style={{ padding: 40 }}>Chargement...</div>
  }

  if (!user) {
    return <div style={{ padding: 40 }}>Connecte-toi pour gerer tes amis.</div>
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
        <h1 style={{ margin: 0, fontSize: 30, color: '#0f172a' }}>Amis</h1>
        <p style={{ marginTop: 8, color: '#475569' }}>
          Definis ton pseudo, envoie des demandes d&apos;amis et compare vos collections
          une fois l&apos;invitation acceptee.
        </p>
      </section>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(280px, 1fr) minmax(320px, 1.2fr)',
          gap: 12
        }}
      >
        <section style={cardStyle()}>
          <h2 style={{ marginTop: 0, marginBottom: 10, color: '#0f172a' }}>
            Mes infos partagees
          </h2>
          <div style={{ display: 'grid', gap: 8 }}>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Pseudo (min 3 caracteres)"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '9px 10px',
                borderRadius: 8,
                border: '1px solid #cbd5e1'
              }}
            />
            <input
              value={discordUsername}
              onChange={(e) => setDiscordUsername(e.target.value)}
              placeholder="Pseudo Discord"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '9px 10px',
                borderRadius: 8,
                border: '1px solid #cbd5e1'
              }}
            />
            <input
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
              placeholder="Code postal"
              inputMode="numeric"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '9px 10px',
                borderRadius: 8,
                border: '1px solid #cbd5e1'
              }}
            />
            <div style={{ fontSize: 12, color: '#64748b' }}>
              * Le code postal ne sera pas partage avec les autres. Il servira uniquement a
              proposer, plus tard, une liste d&apos;amis possibles par departement.
            </div>
            <button
              onClick={saveProfile}
              disabled={!canSaveProfile}
              style={{
                width: 'fit-content',
                background: '#0ea5e9',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '8px 12px',
                opacity: !canSaveProfile ? 0.6 : 1,
                cursor: !canSaveProfile ? 'not-allowed' : 'pointer'
              }}
            >
              Enregistrer
            </button>
          </div>
        </section>

        <section style={cardStyle()}>
          <h2 style={{ marginTop: 0, marginBottom: 10, color: '#0f172a' }}>
            Recherche de joueurs
          </h2>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un pseudo (min 2 caracteres)"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '9px 10px',
              borderRadius: 8,
              border: '1px solid #cbd5e1'
            }}
          />

          <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
            {search.trim().length >= 2 && searchResults.length === 0 && (
              <div style={{ fontSize: 13, color: '#64748b' }}>Aucun resultat.</div>
            )}
            {searchResults.map((profile) => {
              const alreadyFriend = friendIds.has(profile.id)
              const requestState = getPendingRequestState(profile.id)
              const buttonLabel = alreadyFriend
                ? 'Deja ami'
                : requestState?.type === 'incoming'
                  ? 'Accepter'
                  : requestState?.type === 'outgoing'
                    ? 'Demande envoyee'
                    : 'Envoyer demande'

              return (
                <div
                  key={profile.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    padding: '10px 12px',
                    background: '#fff',
                    gap: 12
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>{profile.username}</div>
                    {profile.discord_username && (
                      <div style={{ fontSize: 12, color: '#64748b' }}>
                        Discord: {profile.discord_username}
                      </div>
                    )}
                  </div>
                  <button
                    disabled={alreadyFriend || requestState?.type === 'outgoing'}
                    onClick={() => void sendFriendRequest(profile.id)}
                    style={{
                      background: alreadyFriend
                        ? '#e2e8f0'
                        : requestState?.type === 'incoming'
                          ? '#f59e0b'
                          : '#0f766e',
                      color: alreadyFriend ? '#475569' : '#fff',
                      border: 'none',
                      borderRadius: 8,
                      padding: '7px 10px',
                      cursor:
                        alreadyFriend || requestState?.type === 'outgoing'
                          ? 'not-allowed'
                          : 'pointer',
                      opacity: busyAction === `send:${profile.id}` ? 0.7 : 1
                    }}
                  >
                    {buttonLabel}
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 12
        }}
      >
        <section style={cardStyle()}>
          <h2 style={{ marginTop: 0, marginBottom: 10, color: '#0f172a' }}>
            Demandes recues
          </h2>
          {incomingRequests.length === 0 && (
            <div style={{ fontSize: 14, color: '#64748b' }}>Aucune demande en attente.</div>
          )}
          <div style={{ display: 'grid', gap: 8 }}>
            {incomingRequests.map((request) => (
              <div
                key={request.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  border: '1px solid #fde68a',
                  borderRadius: 8,
                  padding: '10px 12px',
                  background: '#fffdf5',
                  gap: 12
                }}
              >
                <div style={{ fontWeight: 600, color: '#0f172a' }}>
                  {request.requester?.username || 'Joueur inconnu'}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => void acceptFriendRequest(request.id)}
                    disabled={busyAction === `accept:${request.id}`}
                    style={{
                      background: '#0f766e',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 8,
                      padding: '7px 10px'
                    }}
                  >
                    Accepter
                  </button>
                  <button
                    onClick={() => void declineFriendRequest(request.id)}
                    disabled={busyAction === `decline:${request.id}`}
                    style={{
                      background: '#fff',
                      color: '#92400e',
                      border: '1px solid #f59e0b',
                      borderRadius: 8,
                      padding: '7px 10px'
                    }}
                  >
                    Refuser
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section style={cardStyle()}>
          <h2 style={{ marginTop: 0, marginBottom: 10, color: '#0f172a' }}>
            Demandes envoyees
          </h2>
          {outgoingRequests.length === 0 && (
            <div style={{ fontSize: 14, color: '#64748b' }}>Aucune demande envoyee.</div>
          )}
          <div style={{ display: 'grid', gap: 8 }}>
            {outgoingRequests.map((request) => (
              <div
                key={request.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: '10px 12px',
                  background: '#fff',
                  gap: 12
                }}
              >
                <div style={{ fontWeight: 600, color: '#0f172a' }}>
                  {request.recipient?.username || 'Joueur inconnu'}
                </div>
                <button
                  onClick={() => void cancelOutgoingRequest(request.id)}
                  disabled={busyAction === `cancel:${request.id}`}
                  style={{
                    background: '#fff',
                    color: '#475569',
                    border: '1px solid #cbd5e1',
                    borderRadius: 8,
                    padding: '7px 10px'
                  }}
                >
                  Annuler
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section style={cardStyle()}>
        <h2 style={{ marginTop: 0, marginBottom: 10, color: '#0f172a' }}>Mes amis</h2>
        {friends.length === 0 && (
          <div style={{ fontSize: 14, color: '#64748b' }}>Aucun ami pour le moment.</div>
        )}
        <div style={{ display: 'grid', gap: 8 }}>
          {friends.map((friend) => (
            <div
              key={friend.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: '10px 12px',
                background: '#fff',
                gap: 12
              }}
            >
              <div>
                <div style={{ fontWeight: 600, color: '#0f172a' }}>{friend.username}</div>
                {friend.discord_username && (
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    Discord: {friend.discord_username}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Link href={`/friends/${friend.id}`}>Voir ses collections</Link>
                <Link href={`/friends/${friend.id}/trade`}>Voir echanges</Link>
                <button
                  onClick={() => void removeFriend(friend.id)}
                  disabled={busyAction === `remove:${friend.id}`}
                  style={{
                    background: '#fff',
                    color: '#b91c1c',
                    border: '1px solid #fca5a5',
                    borderRadius: 8,
                    padding: '7px 10px',
                    cursor: 'pointer'
                  }}
                >
                  Supprimer
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {message && <div style={{ color: '#0f172a', fontWeight: 600 }}>{message}</div>}
    </div>
  )
}
