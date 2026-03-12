import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getRequestUser } from '@/lib/server/authUser'
import { isAdminEmail, parseAdminEmails } from '@/lib/admin'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type ProfileRow = {
  id: string
  username: string | null
}

type CollectionRow = {
  user_id: string
  card_print_id: string
  quantity: number
}

type CardPrintRow = {
  id: string
  distribution_set_id: string
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

export async function GET(request: Request) {
  const userResult = await getRequestUser(request)
  if (!userResult.user) {
    return NextResponse.json(
      { error: userResult.error || 'Unauthorized' },
      { status: 401 }
    )
  }

  const adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS)
  if (!isAdminEmail(userResult.user.email, adminEmails)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000
  })

  if (error) {
    return NextResponse.json(
      { error: `Erreur liste users: ${error.message}` },
      { status: 500 }
    )
  }

  const users = data?.users || []
  const userIds = users.map((u) => u.id)

  let profileById = new Map<string, string | null>()
  const cardsCountByUserId = new Map<string, number>()
  const startedSetsByUserId = new Map<string, Set<string>>()
  if (userIds.length > 0) {
    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', userIds)

    if (!profilesError) {
      const profiles = (profilesData as ProfileRow[] | null) || []
      profileById = new Map(profiles.map((row) => [row.id, row.username]))
    }

    const collectionRows: CollectionRow[] = []
    for (const userIdsChunk of chunkArray(userIds, 200)) {
      const { data: collectionsData, error: collectionsError } = await supabase
        .from('collections')
        .select('user_id, card_print_id, quantity')
        .in('user_id', userIdsChunk)
        .gt('quantity', 0)

      if (!collectionsError) {
        collectionRows.push(
          ...((((collectionsData as CollectionRow[] | null) || []) as CollectionRow[]))
        )
      }
    }

    const printIds = [...new Set(collectionRows.map((row) => row.card_print_id))]
    const printToSetId = new Map<string, string>()
    for (const printIdsChunk of chunkArray(printIds, 500)) {
      const { data: printsData, error: printsError } = await supabase
        .from('card_prints')
        .select('id, distribution_set_id')
        .in('id', printIdsChunk)

      if (!printsError) {
        ;((((printsData as CardPrintRow[] | null) || []) as CardPrintRow[])).forEach((row) => {
          printToSetId.set(row.id, row.distribution_set_id)
        })
      }
    }

    for (const row of collectionRows) {
      cardsCountByUserId.set(row.user_id, (cardsCountByUserId.get(row.user_id) || 0) + (row.quantity || 0))

      const setId = printToSetId.get(row.card_print_id)
      if (!setId) continue
      if (!startedSetsByUserId.has(row.user_id)) {
        startedSetsByUserId.set(row.user_id, new Set<string>())
      }
      startedSetsByUserId.get(row.user_id)?.add(setId)
    }
  }

  const payload = users
    .map((row) => ({
      id: row.id,
      email: row.email || '',
      username:
        profileById.get(row.id) ||
        (typeof row.user_metadata?.username === 'string'
          ? row.user_metadata.username
          : ''),
      startedSetsCount: startedSetsByUserId.get(row.id)?.size || 0,
      cardsCount: cardsCountByUserId.get(row.id) || 0,
      createdAt: row.created_at || null,
      lastSignInAt: row.last_sign_in_at || null,
      emailConfirmedAt: row.email_confirmed_at || null
    }))
    .sort((a, b) => {
      const av = a.createdAt ? Date.parse(a.createdAt) : 0
      const bv = b.createdAt ? Date.parse(b.createdAt) : 0
      return bv - av
    })

  return NextResponse.json({ users: payload })
}
