import { NextResponse } from 'next/server'
import { requestOAuthAccessToken } from '@/lib/server/cardmarket'
import { supabaseServiceServer } from '@/lib/server/supabaseServer'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const oauthToken = url.searchParams.get('oauth_token') || ''
  const oauthVerifier = url.searchParams.get('oauth_verifier') || ''

  if (!oauthToken || !oauthVerifier) {
    return NextResponse.redirect(new URL('/friends?cardmarket=error', url.origin))
  }

  const { data: stateRow, error: stateError } = await supabaseServiceServer
    .from('cardmarket_oauth_states')
    .select('request_token_secret, user_id')
    .eq('request_token', oauthToken)
    .maybeSingle()

  if (stateError || !stateRow) {
    return NextResponse.redirect(new URL('/friends?cardmarket=error', url.origin))
  }

  try {
    const accessData = await requestOAuthAccessToken({
      oauthToken,
      oauthTokenSecret: stateRow.request_token_secret,
      oauthVerifier
    })

    const accessToken = accessData.oauth_token
    const accessSecret = accessData.oauth_token_secret

    if (!accessToken || !accessSecret) {
      throw new Error('Cardmarket access token response incomplete')
    }

    const { error: upsertError } = await supabaseServiceServer
      .from('cardmarket_accounts')
      .upsert(
        {
          user_id: stateRow.user_id,
          oauth_token: accessToken,
          oauth_token_secret: accessSecret,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'user_id' }
      )

    if (upsertError) {
      throw upsertError
    }

    await supabaseServiceServer
      .from('cardmarket_oauth_states')
      .delete()
      .eq('request_token', oauthToken)

    return NextResponse.redirect(
      new URL('/friends?cardmarket=connected', url.origin)
    )
  } catch {
    return NextResponse.redirect(new URL('/friends?cardmarket=error', url.origin))
  }
}
