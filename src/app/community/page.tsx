'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabaseClient'
import { type CommunitySubmissionStatus, type CommunitySubmissionType } from '@/lib/community'
import { SET_LANGUAGE_CODES, getCollectionLanguageShortLabel } from '@/lib/collections/languages'
import { PLACE_ACTIVITY_OPTIONS } from '@/lib/places'

type SetOption = {
  code: string
  name: string | null
}

type SubmissionListRow = {
  id: string
  submission_type: CommunitySubmissionType
  title: string
  message: string | null
  status: CommunitySubmissionStatus
  admin_comment: string | null
  created_at: string
}

type LeaderboardRow = {
  rank: number
  userId: string
  username: string
  points: number
  approvedCount: number
  rejectedCount: number
}

type SetCardOption = {
  id: string
  label: string
  baseCode: string
  printCode: string
  name: string
  rarity: string
  type: string
  variantType: string
  availableLanguages: string[]
}

function sectionStyle() {
  return {
    border: '1px solid #d1d5db',
    borderRadius: 12,
    padding: 14,
    background: '#ffffffd1',
    minWidth: 0
  } as const
}

function fieldStyle() {
  return {
    width: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
    padding: '9px 10px',
    borderRadius: 8,
    border: '1px solid #cbd5e1'
  } as const
}

function getSubmissionLabel(type: CommunitySubmissionType) {
  if (type === 'card_add') return 'Ajout de carte'
  if (type === 'place_add') return 'Ajout de lieu'
  return 'Correction de carte'
}

export default function CommunityPage() {
  const { user, loading: authLoading } = useAuth()
  const [proposalDomain, setProposalDomain] = useState<'cards' | 'places'>('cards')
  const [cardMode, setCardMode] = useState<'card_edit' | 'card_add'>('card_edit')
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [setCode, setSetCode] = useState('')
  const [selectedSetCardId, setSelectedSetCardId] = useState('')
  const [currentPrintCode, setCurrentPrintCode] = useState('')
  const [baseCode, setBaseCode] = useState('')
  const [name, setName] = useState('')
  const [rarity, setRarity] = useState('')
  const [type, setType] = useState('')
  const [variantType, setVariantType] = useState('normal')
  const [imageUrl, setImageUrl] = useState('')
  const [cardmarketProductId, setCardmarketProductId] = useState('')
  const [availableLanguages, setAvailableLanguages] = useState<Record<string, boolean>>({})
  const [placeSlug, setPlaceSlug] = useState('')
  const [placeAddressLine, setPlaceAddressLine] = useState('')
  const [placeCity, setPlaceCity] = useState('')
  const [placePostalCode, setPlacePostalCode] = useState('')
  const [placeCountry, setPlaceCountry] = useState('France')
  const [placeDiscordUrl, setPlaceDiscordUrl] = useState('')
  const [placeWebsiteUrl, setPlaceWebsiteUrl] = useState('')
  const [placeGoogleMapsUrl, setPlaceGoogleMapsUrl] = useState('')
  const [placeActivities, setPlaceActivities] = useState<Record<string, boolean>>({})
  const [sets, setSets] = useState<SetOption[]>([])
  const [rarityOptions, setRarityOptions] = useState<string[]>([])
  const [typeOptions, setTypeOptions] = useState<string[]>([])
  const [variantOptions, setVariantOptions] = useState<string[]>([])
  const [setCardOptions, setSetCardOptions] = useState<SetCardOption[]>([])
  const [mySubmissions, setMySubmissions] = useState<SubmissionListRow[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([])
  const [messageText, setMessageText] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadingData, setLoadingData] = useState(true)

  const setOptions = useMemo(
    () => sets.map((row) => `${row.code}${row.name ? ` - ${row.name}` : ''}`),
    [sets]
  )

  const getAuthHeader = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    const accessToken = data.session?.access_token
    return accessToken
      ? ({ Authorization: `Bearer ${accessToken}` } as Record<string, string>)
      : ({} as Record<string, string>)
  }, [])

  const loadData = useCallback(async () => {
    if (!user) return
    setLoadingData(true)

    const authHeaders = await getAuthHeader()
    const [setsData, raritiesData, typesData, variantsData, submissionsRes, leaderboardRes] =
      await Promise.all([
        supabase.from('sets').select('code, name').order('code', { ascending: true }),
        supabase.from('cards').select('rarity').not('rarity', 'is', null),
        supabase.from('cards').select('type').not('type', 'is', null),
        supabase.from('card_prints').select('variant_type').not('variant_type', 'is', null),
        fetch('/api/community/submissions', { headers: authHeaders }),
        fetch('/api/community/leaderboard', { headers: authHeaders })
      ])

    const rarityValues = (((raritiesData.data as Array<{ rarity: string | null }> | null) || []) as Array<{
      rarity: string | null
    }>)
      .map((row) => String(row.rarity || '').trim())
      .filter(Boolean)
    const typeValues = (((typesData.data as Array<{ type: string | null }> | null) || []) as Array<{
      type: string | null
    }>)
      .map((row) => String(row.type || '').trim())
      .filter(Boolean)
    const variantValues = (((variantsData.data as Array<{ variant_type: string | null }> | null) || []) as Array<{
      variant_type: string | null
    }>)
      .map((row) => String(row.variant_type || '').trim())
      .filter(Boolean)

    setSets((((setsData.data as SetOption[] | null) || []) as SetOption[]))
    setRarityOptions([...new Set(rarityValues)].sort((a, b) => a.localeCompare(b, 'fr')))
    setTypeOptions([...new Set(typeValues)].sort((a, b) => a.localeCompare(b, 'fr')))
    setVariantOptions([...new Set(variantValues)].sort((a, b) => a.localeCompare(b, 'fr')))

    const submissionsData = await submissionsRes.json().catch(() => ({}))
    const leaderboardData = await leaderboardRes.json().catch(() => ({}))
    setMySubmissions(Array.isArray(submissionsData?.submissions) ? submissionsData.submissions : [])
    setLeaderboard(Array.isArray(leaderboardData?.rows) ? leaderboardData.rows : [])
    setLoadingData(false)
  }, [getAuthHeader, user])

  useEffect(() => {
    if (!user) return
    void loadData()
  }, [loadData, user])

  useEffect(() => {
    const loadSetCards = async () => {
      if (!user || proposalDomain !== 'cards' || cardMode !== 'card_edit' || !setCode.trim()) {
        setSetCardOptions([])
        setSelectedSetCardId('')
        setCurrentPrintCode('')
        return
      }

      const authHeaders = await getAuthHeader()
      const res = await fetch(`/api/community/set-cards/${encodeURIComponent(setCode.trim())}`, {
        headers: authHeaders
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setSetCardOptions([])
        setSelectedSetCardId('')
        setCurrentPrintCode('')
        return
      }

      const items = Array.isArray(data?.items) ? (data.items as SetCardOption[]) : []
      setSetCardOptions(items)
      setSelectedSetCardId('')
      setCurrentPrintCode('')
    }

    void loadSetCards()
  }, [cardMode, getAuthHeader, proposalDomain, setCode, user])

  useEffect(() => {
    if (proposalDomain !== 'cards' || cardMode !== 'card_edit') return
    const selected = setCardOptions.find((entry) => entry.id === selectedSetCardId)
    if (!selected) return

    setCurrentPrintCode(selected.printCode || '')
    setBaseCode(selected.baseCode || '')
    setName(selected.name || '')
    setRarity(selected.rarity || '')
    setType(selected.type || '')
    setVariantType(selected.variantType || 'normal')
    setAvailableLanguages(
      Object.fromEntries(
        SET_LANGUAGE_CODES.map((language) => [language, selected.availableLanguages.includes(language)])
      )
    )
    if (!title.trim()) {
      setTitle(`Correction de ${selected.baseCode || selected.name}`)
    }
  }, [cardMode, proposalDomain, selectedSetCardId, setCardOptions, title])

  const resetForm = () => {
    setTitle('')
    setMessage('')
    setSetCode('')
    setSelectedSetCardId('')
    setCurrentPrintCode('')
    setBaseCode('')
    setName('')
    setRarity('')
    setType('')
    setVariantType('normal')
    setImageUrl('')
    setCardmarketProductId('')
    setAvailableLanguages({})
    setPlaceSlug('')
    setPlaceAddressLine('')
    setPlaceCity('')
    setPlacePostalCode('')
    setPlaceCountry('France')
    setPlaceDiscordUrl('')
    setPlaceWebsiteUrl('')
    setPlaceGoogleMapsUrl('')
    setPlaceActivities({})
  }

  const submitProposal = async () => {
    if (!user || saving) return
    setSaving(true)
    setMessageText('')

    try {
      const authHeaders = await getAuthHeader()
      const submissionType: CommunitySubmissionType =
        proposalDomain === 'places' ? 'place_add' : cardMode

      const payload =
        submissionType === 'place_add'
          ? {
              slug: placeSlug,
              name,
              description: message,
              imageUrl,
              addressLine: placeAddressLine,
              city: placeCity,
              postalCode: placePostalCode,
              country: placeCountry,
              discordUrl: placeDiscordUrl,
              websiteUrl: placeWebsiteUrl,
              googleMapsUrl: placeGoogleMapsUrl,
              activities: PLACE_ACTIVITY_OPTIONS.filter((entry) => placeActivities[entry.value]).map(
                (entry) => entry.value
              )
            }
          : submissionType === 'card_add'
            ? {
                setCode,
                baseCode,
                name,
                rarity,
                type,
                variantType,
                imageUrl,
                cardmarketProductId,
                availableLanguages: SET_LANGUAGE_CODES.filter((entry) => availableLanguages[entry])
              }
            : {
                setCode,
                currentPrintCode,
                baseCode,
                name,
                rarity,
                type,
                variantType,
                imageUrl,
                cardmarketProductId,
                availableLanguages: SET_LANGUAGE_CODES.filter((entry) => availableLanguages[entry])
              }

      const res = await fetch('/api/community/submissions', {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          submissionType,
          title,
          message,
          payload
        })
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || 'Erreur envoi proposition')
      }

      setMessageText('Proposition envoyee. Elle sera verifiee par un admin.')
      resetForm()
      await loadData()
    } catch (error) {
      setMessageText(error instanceof Error ? error.message : 'Erreur envoi proposition')
    } finally {
      setSaving(false)
    }
  }

  if (authLoading || loadingData) return <div style={{ padding: 40 }}>Chargement...</div>
  if (!user) return <div style={{ padding: 40 }}>Connecte-toi pour acceder a l'espace contributions.</div>

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '18px 28px 28px',
        background: 'radial-gradient(circle at 12% 8%, #fff4e6 0%, #e0f2fe 40%, #eef2ff 100%)',
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
        <h1 style={{ margin: 0, fontSize: 30, color: '#0f172a' }}>Contributions</h1>
        <p style={{ marginTop: 8, color: '#475569' }}>
          Propose des corrections de cartes ou de nouveaux lieux. Chaque proposition est relue
          et validee par un admin avant application.
        </p>
      </section>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 0.8fr)',
          gap: 12,
          minWidth: 0
        }}
      >
        <section style={sectionStyle()}>
          <h2 style={{ marginTop: 0, color: '#0f172a' }}>Faire une proposition</h2>

          <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
            <select
              value={proposalDomain}
              onChange={(e) => setProposalDomain(e.target.value as 'cards' | 'places')}
              style={fieldStyle()}
            >
              <option value="cards">Cartes</option>
              <option value="places">Lieux</option>
            </select>

            {proposalDomain === 'cards' && (
              <>
                <select
                  value={cardMode}
                  onChange={(e) => setCardMode(e.target.value as 'card_edit' | 'card_add')}
                  style={fieldStyle()}
                >
                  <option value="card_edit">Correction d'une carte</option>
                  <option value="card_add">Ajout d'une carte</option>
                </select>

                <input
                  list="community-set-options"
                  value={setCode}
                  onChange={(e) => setSetCode(e.target.value.toUpperCase())}
                  placeholder="Set concerne. Exemple: OP01"
                  style={fieldStyle()}
                />
                <datalist id="community-set-options">
                  {setOptions.map((value) => (
                    <option key={value} value={value.split(' - ')[0]} />
                  ))}
                </datalist>

                {cardMode === 'card_edit' && (
                  <select
                    value={selectedSetCardId}
                    onChange={(e) => setSelectedSetCardId(e.target.value)}
                    style={fieldStyle()}
                  >
                    <option value="">Choisir une carte du set</option>
                    {setCardOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                )}
              </>
            )}

            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                proposalDomain === 'places'
                  ? 'Titre court. Exemple: Ajout de la boutique X a Paris'
                  : 'Titre court. Exemple: Correction du nom de OP01-001'
              }
              style={fieldStyle()}
            />

            {proposalDomain === 'cards' ? (
              <input
                value={baseCode}
                onChange={(e) => setBaseCode(e.target.value.toUpperCase())}
                placeholder="Base code. Exemple: OP01-001"
                style={fieldStyle()}
              />
            ) : (
              <input
                value={placeSlug}
                onChange={(e) => setPlaceSlug(e.target.value)}
                placeholder="Slug du lieu (optionnel)"
                style={fieldStyle()}
              />
            )}

            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                proposalDomain === 'places'
                  ? 'Nom du lieu'
                  : 'Nom propose. Exemple: Roronoa Zoro'
              }
              style={fieldStyle()}
            />

            {proposalDomain === 'cards' ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                  <select value={rarity} onChange={(e) => setRarity(e.target.value)} style={fieldStyle()}>
                    <option value="">Rarete</option>
                    {rarityOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <select value={type} onChange={(e) => setType(e.target.value)} style={fieldStyle()}>
                    <option value="">Type</option>
                    {typeOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <select value={variantType} onChange={(e) => setVariantType(e.target.value)} style={fieldStyle()}>
                    <option value="">Variant</option>
                    {variantOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <input
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="Image URL (optionnel)"
                  style={fieldStyle()}
                />
                <input
                  value={cardmarketProductId}
                  onChange={(e) => setCardmarketProductId(e.target.value)}
                  placeholder="ID Cardmarket (optionnel)"
                  style={fieldStyle()}
                />

                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {SET_LANGUAGE_CODES.map((language) => (
                    <label key={language} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                      <input
                        type="checkbox"
                        checked={Boolean(availableLanguages[language])}
                        onChange={(e) =>
                          setAvailableLanguages((prev) => ({ ...prev, [language]: e.target.checked }))
                        }
                      />
                      <span>{getCollectionLanguageShortLabel(language)}</span>
                    </label>
                  ))}
                </div>
              </>
            ) : (
              <>
                <input
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="Image URL du lieu"
                  style={fieldStyle()}
                />
                <input
                  value={placeAddressLine}
                  onChange={(e) => setPlaceAddressLine(e.target.value)}
                  placeholder="Adresse"
                  style={fieldStyle()}
                />
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 160px', gap: 8 }}>
                  <input value={placeCity} onChange={(e) => setPlaceCity(e.target.value)} placeholder="Ville" style={fieldStyle()} />
                  <input value={placePostalCode} onChange={(e) => setPlacePostalCode(e.target.value)} placeholder="Code postal" style={fieldStyle()} />
                </div>
                <input value={placeCountry} onChange={(e) => setPlaceCountry(e.target.value)} placeholder="Pays" style={fieldStyle()} />
                <input value={placeDiscordUrl} onChange={(e) => setPlaceDiscordUrl(e.target.value)} placeholder="Lien Discord du lieu" style={fieldStyle()} />
                <input value={placeWebsiteUrl} onChange={(e) => setPlaceWebsiteUrl(e.target.value)} placeholder="Site web (optionnel)" style={fieldStyle()} />
                <input value={placeGoogleMapsUrl} onChange={(e) => setPlaceGoogleMapsUrl(e.target.value)} placeholder="Lien Google Maps (optionnel)" style={fieldStyle()} />
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {PLACE_ACTIVITY_OPTIONS.map((activity) => (
                    <label key={activity.value} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                      <input
                        type="checkbox"
                        checked={Boolean(placeActivities[activity.value])}
                        onChange={(e) =>
                          setPlaceActivities((prev) => ({ ...prev, [activity.value]: e.target.checked }))
                        }
                      />
                      <span>{activity.label}</span>
                    </label>
                  ))}
                </div>
              </>
            )}

            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                proposalDomain === 'places'
                  ? 'Decris le lieu et ce qu on peut y faire.'
                  : 'Explique ce qui doit etre corrige ou ajoute.'
              }
              rows={5}
              style={{ ...fieldStyle(), resize: 'vertical' }}
            />

            <button
              onClick={submitProposal}
              disabled={saving}
              style={{
                width: 'fit-content',
                background: '#0f766e',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '8px 12px',
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1
              }}
            >
              {saving ? 'Envoi...' : 'Envoyer la proposition'}
            </button>
          </div>
        </section>

        <section style={sectionStyle()}>
          <h2 style={{ marginTop: 0, color: '#0f172a' }}>Classement des contributeurs</h2>
          <div style={{ display: 'grid', gap: 8 }}>
            {leaderboard.length === 0 && (
              <div style={{ fontSize: 14, color: '#64748b' }}>Aucun classement pour le moment.</div>
            )}
            {leaderboard.map((row) => (
              <div
                key={row.userId}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '40px 1fr auto',
                  alignItems: 'center',
                  gap: 8,
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: '10px 12px',
                  background: '#fff'
                }}
              >
                <div style={{ fontWeight: 700, color: '#0f172a' }}>#{row.rank}</div>
                <div>
                  <div style={{ fontWeight: 600, color: '#0f172a' }}>{row.username}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    {row.approvedCount} validation(s) • {row.rejectedCount} refus
                  </div>
                </div>
                <div style={{ fontWeight: 700, color: '#0f766e' }}>{row.points} pts</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section style={sectionStyle()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, color: '#0f172a' }}>Mes propositions</h2>
          <Link href="/admin/community" style={{ color: '#1d4ed8' }}>
            Moderation admin
          </Link>
        </div>
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          {mySubmissions.length === 0 && (
            <div style={{ fontSize: 14, color: '#64748b' }}>Aucune proposition pour le moment.</div>
          )}
          {mySubmissions.map((row) => (
            <div
              key={row.id}
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 10,
                padding: '12px 14px',
                background: '#fff'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 700, color: '#0f172a' }}>{row.title}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    {getSubmissionLabel(row.submission_type)} • {new Date(row.created_at).toLocaleString('fr-FR')}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color:
                      row.status === 'approved'
                        ? '#0f766e'
                        : row.status === 'rejected'
                          ? '#b91c1c'
                          : '#92400e'
                  }}
                >
                  {row.status === 'approved' ? 'Validee' : row.status === 'rejected' ? 'Refusee' : 'En attente'}
                </div>
              </div>
              {row.message && (
                <div style={{ marginTop: 8, color: '#334155', whiteSpace: 'pre-wrap' }}>{row.message}</div>
              )}
              {row.admin_comment && (
                <div style={{ marginTop: 8, fontSize: 13, color: '#475569' }}>
                  Commentaire admin: {row.admin_comment}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {messageText && <div style={{ color: '#0f172a', fontWeight: 600 }}>{messageText}</div>}
    </div>
  )
}
