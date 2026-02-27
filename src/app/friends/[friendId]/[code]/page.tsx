'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { CollectionSetView } from '@/components/CollectionSetView'

export default function FriendSetPage() {
  const params = useParams()
  const friendId = Array.isArray(params.friendId) ? params.friendId[0] : params.friendId
  const code = Array.isArray(params.code) ? params.code[0] : params.code
  const [friendUsername, setFriendUsername] = useState<string>('')

  useEffect(() => {
    const fetchProfile = async () => {
      if (!friendId) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', friendId)
        .maybeSingle()

      setFriendUsername(profile?.username || 'Ami')
    }

    fetchProfile()
  }, [friendId])

  if (!friendId || !code) {
    return <div style={{ padding: 40 }}>Set introuvable.</div>
  }

  return (
    <div>
      <div style={{ padding: '24px 40px 0' }}>
        <Link href={`/friends/${friendId}`}>Retour aux collections de cet ami</Link>
      </div>
      <CollectionSetView
        code={code}
        ownerUserId={friendId}
        editable={false}
        title={`Collection de ${friendUsername} - ${code}`}
      />
    </div>
  )
}
