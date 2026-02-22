'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function AdminPage() {
  const [role, setRole] = useState<string | null>(null)

  useEffect(() => {
    const fetchRole = async () => {
      const { data: userData } = await supabase.auth.getUser()

      if (!userData.user) return

      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userData.user.id)
        .single()

      setRole(data?.role ?? null)
    }

    fetchRole()
  }, [])

  if (role !== 'admin') {
    return <div style={{ padding: 40 }}>Accès refusé</div>
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>Administration</h1>
      <p>Zone réservée aux administrateurs.</p>
    </div>
  )
}