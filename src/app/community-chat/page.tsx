'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth'
import { isAdminEmail, parseAdminEmails } from '@/lib/admin'
import { supabase } from '@/lib/supabaseClient'

type ChatMessageRow = {
  id: string
  user_id: string
  message: string
  is_admin: boolean
  created_at: string
}

type ProfileRow = {
  id: string
  username: string | null
}

function formatTimeLabel(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

function formatShortDateLabel(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit'
  }).format(date)
}

export default function CommunityChatPage() {
  const { user, loading: authLoading } = useAuth()
  const adminEmails = parseAdminEmails(process.env.NEXT_PUBLIC_ADMIN_EMAILS)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessageRow[]>([])
  const [profilesById, setProfilesById] = useState<Record<string, string>>({})
  const viewportRef = useRef<HTMLDivElement | null>(null)

  const loadMessages = async () => {
    setError(null)

    const { data, error: messagesError } = await supabase
      .from('community_chat_messages')
      .select('id, user_id, message, is_admin, created_at')
      .order('created_at', { ascending: true })
      .limit(200)

    if (messagesError) {
      setError(`Erreur chargement chat: ${messagesError.message}`)
      setMessages([])
      return
    }

    const nextMessages = (((data as ChatMessageRow[] | null) || []) as ChatMessageRow[])
    setMessages(nextMessages)

    const userIds = [...new Set(nextMessages.map((row) => row.user_id).filter(Boolean))]
    if (userIds.length === 0) {
      setProfilesById({})
      return
    }

    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', userIds)

    if (profilesError) {
      setProfilesById({})
      return
    }

    const nextProfiles = Object.fromEntries(
      ((((profilesData as ProfileRow[] | null) || []) as ProfileRow[])).map((row) => [
        row.id,
        String(row.username || '').trim()
      ])
    )

    setProfilesById(nextProfiles)
  }

  useEffect(() => {
    if (!user) {
      setLoading(false)
      setMessages([])
      return
    }

    const run = async () => {
      setLoading(true)
      await loadMessages()
      setLoading(false)
    }

    void run()
  }, [user])

  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel('community-chat-room')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'community_chat_messages' },
        () => {
          void loadMessages()
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user])

  useEffect(() => {
    if (!viewportRef.current) return
    viewportRef.current.scrollTop = viewportRef.current.scrollHeight
  }, [messages])

  const sendMessage = async () => {
    if (!user || sending) return

    const message = input.trim()
    if (!message) return

    setSending(true)
    setError(null)

    const { error: insertError } = await supabase.from('community_chat_messages').insert({
      user_id: user.id,
      message,
      is_admin: isAdminEmail(user.email, adminEmails)
    })

    if (insertError) {
      setError(`Erreur envoi message: ${insertError.message}`)
      setSending(false)
      return
    }

    setInput('')
    setSending(false)
  }

  if (authLoading || loading) {
    return <div style={{ padding: 40 }}>Chargement communaute...</div>
  }

  if (!user) {
    return <div style={{ padding: 40 }}>Connecte-toi pour acceder au chat communaute.</div>
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
          padding: 14,
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          alignItems: 'flex-start',
          flexWrap: 'wrap'
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 30, color: '#0f172a' }}>Communaute</h1>
          <p style={{ marginTop: 8, color: '#475569', maxWidth: 760 }}>
            Discute en direct des cartes manquantes, des ajouts a faire et des ameliorations du site.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link
            href="/community"
            style={{
              border: '1px solid #cbd5e1',
              background: '#fff',
              color: '#1e3a8a',
              borderRadius: 10,
              padding: '10px 14px',
              textDecoration: 'none',
              fontWeight: 700
            }}
          >
            Ouvrir contributions
          </Link>
        </div>
      </section>

      <section
        style={{
          border: '1px solid #d1d5db',
          borderRadius: 14,
          background: '#ffffffde',
          padding: 12,
          display: 'grid',
          gap: 12
        }}
      >
        <div
          ref={viewportRef}
          style={{
            minHeight: 360,
            maxHeight: '65vh',
            overflowY: 'auto',
            display: 'grid',
            gap: 10,
            padding: 4
          }}
        >
          {messages.length === 0 ? (
            <div style={{ color: '#64748b', padding: 12 }}>
              Aucun message pour le moment. Lance la discussion.
            </div>
          ) : (
            messages.map((row) => (
                <div
                  key={row.id}
                  style={{
                    justifySelf: row.user_id === user.id ? 'end' : 'start',
                    maxWidth: 'min(720px, 92%)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    alignItems: row.user_id === user.id ? 'flex-end' : 'flex-start'
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      color: '#64748b',
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      flexWrap: 'wrap',
                      justifyContent: row.user_id === user.id ? 'flex-end' : 'flex-start'
                    }}
                  >
                    <span style={{ fontWeight: 700, color: '#334155' }}>
                      {profilesById[row.user_id] || 'Collectionneur'}
                    </span>
                    {row.is_admin && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: '#7c2d12',
                          background: '#ffedd5',
                          border: '1px solid #fdba74',
                          borderRadius: 999,
                          padding: '2px 6px'
                        }}
                      >
                        Admin
                      </span>
                    )}
                    <span style={{ color: '#94a3b8' }}>
                      {formatShortDateLabel(row.created_at)} {formatTimeLabel(row.created_at)}
                    </span>
                  </div>
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: 14,
                      background: row.user_id === user.id ? '#dbeafe' : '#f8fafc',
                      border: row.user_id === user.id ? '1px solid #93c5fd' : '1px solid #e2e8f0',
                      color: '#0f172a',
                      whiteSpace: 'pre-wrap',
                      lineHeight: 1.5,
                      display: 'block',
                      maxWidth: '100%'
                    }}
                  >
                    {row.message}
                  </div>
                </div>
            ))
          )}
        </div>

        {error && (
          <div style={{ color: '#b91c1c', fontSize: 13 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gap: 8 }}>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ecris un message a la communaute..."
            rows={3}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid #cbd5e1',
              resize: 'vertical'
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              Messages visibles par tous les joueurs connectes.
            </div>
            <button
              onClick={() => void sendMessage()}
              disabled={sending || !input.trim()}
              style={{
                border: '1px solid #0f766e',
                background: '#0f766e',
                color: '#fff',
                borderRadius: 10,
                padding: '10px 14px',
                cursor: sending || !input.trim() ? 'not-allowed' : 'pointer',
                opacity: sending || !input.trim() ? 0.7 : 1,
                fontWeight: 700
              }}
            >
              {sending ? 'Envoi...' : 'Envoyer'}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
