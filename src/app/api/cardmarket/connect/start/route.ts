import { NextResponse } from 'next/server'
import { getRequestUserId } from '@/lib/server/authUser'
import {
  buildAuthorizeUrl,
  requestOAuthRequestToken
} from '@/lib/server/cardmarket'
import { supabaseServiceServer } from '@/lib/server/supabaseServer'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const { userId, error } = await getRequestUserId(request)
    if (!userId) {
      return NextResponse.json({ error }, { status: 401 })
    }

    const origin = new URL(request.url).origin
    const callbackUrl = `${origin}/api/cardmarket/connect/callback`

    const tokenData = await requestOAuthRequestToken(callbackUrl)
    const oauthToken = tokenData.oauth_token
    const oauthTokenSecret = tokenData.oauth_token_secret

    if (!oauthToken || !oauthTokenSecret) {
      return NextResponse.json(
        { error: 'Cardmarket response missing oauth token' },
        { status: 502 }
      )
    }

    const { error: stateError } = await supabaseServiceServer
      .from('cardmarket_oauth_states')
      .upsert(
        {
          request_token: oauthToken,
          request_token_secret: oauthTokenSecret,
          user_id: userId,
          created_at: new Date().toISOString()
        },
        { onConflict: 'request_token' }
      )

    if (stateError) {
      return NextResponse.json({ error: stateError.message }, { status: 500 })
    }

    return NextResponse.json({ authorizeUrl: buildAuthorizeUrl(oauthToken) })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
