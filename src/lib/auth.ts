'use client'

import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { User } from '@supabase/supabase-js'

function getDiscordProfileName(user: User | null): string {
  if (!user) return ''

  const discordIdentity = (user.identities || []).find(
    (identity) => String(identity.provider || '').toLowerCase() === 'discord'
  )
  const identityData = (discordIdentity?.identity_data || {}) as Record<string, unknown>

  const globalName = String(identityData.global_name || '').trim()
  if (globalName) return globalName

  const username = String(identityData.username || '').trim()
  const discriminator = String(identityData.discriminator || '').trim()
  if (username && discriminator && discriminator !== '0') return `${username}#${discriminator}`
  if (username) return username

  const metadata = (user.user_metadata || {}) as Record<string, unknown>
  const metadataGlobalName = String(metadata.global_name || '').trim()
  if (metadataGlobalName) return metadataGlobalName

  const metadataUsername = String(metadata.user_name || metadata.username || metadata.name || '').trim()
  return metadataUsername
}

async function syncDiscordUsername(user: User | null) {
  if (!user) return

  const discordUsername = getDiscordProfileName(user)
  const discordIdentity = (user.identities || []).find(
    (identity) => String(identity.provider || '').toLowerCase() === 'discord'
  )
  const identityData = (discordIdentity?.identity_data || {}) as Record<string, unknown>
  const discordUserId = String(identityData.provider_id || identityData.sub || '').trim()

  if (!discordUsername && !discordUserId) return

  const { data, error } = await supabase
    .from('profiles')
    .select('username, discord_username, discord_user_id')
    .eq('id', user.id)
    .maybeSingle()

  if (error) return

  const currentDiscordUsername = String(data?.discord_username || '').trim()
  const currentDiscordUserId = String((data as { discord_user_id?: string | null } | null)?.discord_user_id || '').trim()
  if (currentDiscordUsername && currentDiscordUserId) return

  await supabase.from('profiles').upsert(
    {
      id: user.id,
      username: String(data?.username || '').trim() || null,
      discord_username: currentDiscordUsername || discordUsername || null,
      discord_user_id: currentDiscordUserId || discordUserId || null
    },
    { onConflict: 'id' }
  )
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const setUserIfChanged = (nextUser: User | null) => {
      setUser((currentUser) => {
        if (!currentUser && !nextUser) return currentUser
        if (currentUser?.id === nextUser?.id && currentUser?.email === nextUser?.email) {
          return currentUser
        }
        return nextUser
      })
    }

    const getUser = async () => {
      const { data } = await supabase.auth.getUser()
      setUserIfChanged(data.user)
      void syncDiscordUsername(data.user)
      setLoading(false)
    }

    getUser()

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUserIfChanged(session?.user ?? null)
        void syncDiscordUsername(session?.user ?? null)
      }
    )

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [])

  return { user, loading }
}
