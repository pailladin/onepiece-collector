'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabaseClient'

type Profile = {
  id: string
  username: string
}

type FriendRow = {
  friend_id: string
}

export default function FriendsPage() {
  const { user, loading } = useAuth()
  const [username, setUsername] = useState('')
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Profile[]>([])
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set())
  const [friends, setFriends] = useState<Profile[]>([])
  const [message, setMessage] = useState('')

  const canSaveUsername = useMemo(
    () => username.trim().length >= 3,
    [username]
  )

  const loadFriends = async (userId: string) => {
    const { data: rows } = await supabase
      .from('friends')
      .select('friend_id')
      .eq('user_id', userId)

    const ids = (rows as FriendRow[] | null)?.map((r) => r.friend_id) || []
    setFriendIds(new Set(ids))

    if (ids.length === 0) {
      setFriends([])
      return
    }

    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', ids)
      .order('username')

    setFriends((profilesData as Profile[] | null) || [])
  }

  useEffect(() => {
    const loadData = async () => {
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, username')
        .eq('id', user.id)
        .maybeSingle()

      setUsername(profile?.username || '')
      await loadFriends(user.id)
    }

    loadData()
  }, [user])

  useEffect(() => {
    const runSearch = async () => {
      if (!user || search.trim().length < 2) {
        setSearchResults([])
        return
      }

      const { data } = await supabase
        .from('profiles')
        .select('id, username')
        .ilike('username', `%${search.trim()}%`)
        .neq('id', user.id)
        .limit(10)

      setSearchResults((data as Profile[] | null) || [])
    }

    runSearch()
  }, [search, user])

  const saveUsername = async () => {
    if (!user || !canSaveUsername) return

    setMessage('')
    const value = username.trim()

    const { error } = await supabase.from('profiles').upsert(
      {
        id: user.id,
        username: value
      },
      { onConflict: 'id' }
    )

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Pseudo mis a jour.')
  }

  const addFriend = async (friendId: string) => {
    if (!user) return
    setMessage('')

    const { error } = await supabase.from('friends').insert({
      user_id: user.id,
      friend_id: friendId
    })

    if (error) {
      setMessage(error.message)
      return
    }

    await loadFriends(user.id)
    setMessage('Ami ajoute.')
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
          Definis ton pseudo, ajoute des amis et compare vos collections pour preparer
          vos echanges.
        </p>
      </section>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(280px, 1fr) minmax(320px, 1.2fr)',
          gap: 12
        }}
      >
        <section
          style={{
            border: '1px solid #d1d5db',
            borderRadius: 12,
            padding: 12,
            background: '#ffffffd1'
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: 10, color: '#0f172a' }}>Mon pseudo</h2>
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
            <button
              onClick={saveUsername}
              disabled={!canSaveUsername}
              style={{
                width: 'fit-content',
                background: '#0ea5e9',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '8px 12px',
                opacity: !canSaveUsername ? 0.6 : 1,
                cursor: !canSaveUsername ? 'not-allowed' : 'pointer'
              }}
            >
              Enregistrer
            </button>
          </div>
        </section>

        <section
          style={{
            border: '1px solid #d1d5db',
            borderRadius: 12,
            padding: 12,
            background: '#ffffffd1'
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: 10, color: '#0f172a' }}>Recherche de joueurs</h2>
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
                    background: '#fff'
                  }}
                >
                  <div style={{ fontWeight: 600, color: '#0f172a' }}>{profile.username}</div>
                  <button
                    disabled={alreadyFriend}
                    onClick={() => addFriend(profile.id)}
                    style={{
                      background: alreadyFriend ? '#e2e8f0' : '#0f766e',
                      color: alreadyFriend ? '#475569' : '#fff',
                      border: 'none',
                      borderRadius: 8,
                      padding: '7px 10px',
                      cursor: alreadyFriend ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {alreadyFriend ? 'Deja ami' : 'Ajouter'}
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      </div>

      <section
        style={{
          border: '1px solid #d1d5db',
          borderRadius: 12,
          padding: 12,
          background: '#ffffffd1'
        }}
      >
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
                background: '#fff'
              }}
            >
              <div style={{ fontWeight: 600, color: '#0f172a' }}>{friend.username}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Link href={`/friends/${friend.id}`}>Voir ses collections</Link>
                <Link href={`/friends/${friend.id}/trade`}>Voir echanges</Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {message && <div style={{ color: '#0f172a', fontWeight: 600 }}>{message}</div>}
    </div>
  )
}
