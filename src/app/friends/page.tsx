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
    <div style={{ padding: 40, display: 'grid', gap: 28 }}>
      <section>
        <h1 style={{ marginTop: 0 }}>Amis</h1>
        <p style={{ marginTop: 4 }}>
          Definis ton pseudo, puis ajoute des amis pour voir leur collection.
        </p>
      </section>

      <section style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>Mon pseudo</h2>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Pseudo (min 3 caracteres)"
            style={{ minWidth: 260, padding: '8px 10px' }}
          />
          <button onClick={saveUsername} disabled={!canSaveUsername}>
            Enregistrer
          </button>
        </div>
      </section>

      <section style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>Recherche de joueurs</h2>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un pseudo"
          style={{ minWidth: 260, padding: '8px 10px' }}
        />

        <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
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
                  padding: '10px 12px'
                }}
              >
                <div>{profile.username}</div>
                <button
                  disabled={alreadyFriend}
                  onClick={() => addFriend(profile.id)}
                >
                  {alreadyFriend ? 'Deja ami' : 'Ajouter'}
                </button>
              </div>
            )
          })}
        </div>
      </section>

      <section style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>Mes amis</h2>
        {friends.length === 0 && (
          <div>Aucun ami pour le moment.</div>
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
                padding: '10px 12px'
              }}
            >
              <div>{friend.username}</div>
              <div style={{ display: 'flex', gap: 12 }}>
                <Link href={`/friends/${friend.id}`}>Voir ses collections</Link>
                <Link href={`/friends/${friend.id}/trade`}>Voir echanges</Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {message && (
        <div style={{ color: '#0f172a', fontWeight: 600 }}>{message}</div>
      )}
    </div>
  )
}
