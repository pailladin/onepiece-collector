import crypto from 'node:crypto'

const CARDMARKET_API_BASE = 'https://apiv2.cardmarket.com/ws/v2.0'
const CARDMARKET_AUTHORIZE_URL =
  'https://www.cardmarket.com/ws/v2.0/oauth/authorize'

function envOrThrow(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing environment variable ${name}`)
  }
  return value
}

function percentEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, (c) =>
      `%${c.charCodeAt(0).toString(16).toUpperCase()}`
    )
}

function nonce(): string {
  return crypto.randomBytes(16).toString('hex')
}

function timestamp(): string {
  return Math.floor(Date.now() / 1000).toString()
}

type OAuthSignatureInput = {
  method: string
  url: string
  params: Record<string, string>
  consumerSecret: string
  tokenSecret?: string
}

function buildOAuthSignature({
  method,
  url,
  params,
  consumerSecret,
  tokenSecret
}: OAuthSignatureInput): string {
  const sortedPairs = Object.entries(params)
    .map(([k, v]) => [percentEncode(k), percentEncode(v)] as const)
    .sort(([ka, va], [kb, vb]) => (ka === kb ? va.localeCompare(vb) : ka.localeCompare(kb)))

  const normalized = sortedPairs.map(([k, v]) => `${k}=${v}`).join('&')

  const baseString = [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(normalized)
  ].join('&')

  const signingKey =
    `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret || '')}`

  return crypto
    .createHmac('sha1', signingKey)
    .update(baseString)
    .digest('base64')
}

type SignedRequestOptions = {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  token?: string
  tokenSecret?: string
  oauthExtra?: Record<string, string>
  query?: Record<string, string | number | boolean | undefined>
  jsonBody?: unknown
}

async function signedCardmarketRequest({
  method,
  path,
  token,
  tokenSecret,
  oauthExtra,
  query,
  jsonBody
}: SignedRequestOptions): Promise<{ response: Response; text: string }> {
  const appToken = envOrThrow('CARDMARKET_APP_TOKEN')
  const appSecret = envOrThrow('CARDMARKET_APP_SECRET')

  const url = new URL(`${CARDMARKET_API_BASE}${path}`)
  const queryParams: Record<string, string> = {}
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined) continue
    const v = String(value)
    url.searchParams.set(key, v)
    queryParams[key] = v
  }

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: appToken,
    oauth_nonce: nonce(),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp(),
    oauth_version: '1.0',
    ...(token ? { oauth_token: token } : {}),
    ...(oauthExtra || {})
  }

  const signature = buildOAuthSignature({
    method,
    url: `${url.origin}${url.pathname}`,
    params: {
      ...queryParams,
      ...oauthParams
    },
    consumerSecret: appSecret,
    tokenSecret
  })

  oauthParams.oauth_signature = signature

  const authHeader =
    'OAuth ' +
    Object.entries(oauthParams)
      .map(([k, v]) => `${percentEncode(k)}="${percentEncode(v)}"`)
      .join(', ')

  const response = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: authHeader,
      Accept: 'application/json',
      ...(jsonBody ? { 'Content-Type': 'application/json' } : {})
    },
    body: jsonBody ? JSON.stringify(jsonBody) : undefined
  })

  const text = await response.text()
  return { response, text }
}

export function buildAuthorizeUrl(oauthToken: string): string {
  const url = new URL(CARDMARKET_AUTHORIZE_URL)
  url.searchParams.set('oauth_token', oauthToken)
  return url.toString()
}

export function parseOAuthTokenResponse(text: string): Record<string, string> {
  const params = new URLSearchParams(text)
  return Object.fromEntries(params.entries())
}

export async function requestOAuthRequestToken(callbackUrl: string) {
  const { response, text } = await signedCardmarketRequest({
    method: 'POST',
    path: '/oauth/request_token',
    oauthExtra: {
      oauth_callback: callbackUrl
    }
  })

  if (!response.ok) {
    throw new Error(`Cardmarket request_token failed: ${response.status} ${text}`)
  }

  return parseOAuthTokenResponse(text)
}

export async function requestOAuthAccessToken(params: {
  oauthToken: string
  oauthTokenSecret: string
  oauthVerifier: string
}) {
  const { oauthToken, oauthTokenSecret, oauthVerifier } = params

  const { response, text } = await signedCardmarketRequest({
    method: 'POST',
    path: '/oauth/access_token',
    token: oauthToken,
    tokenSecret: oauthTokenSecret,
    oauthExtra: {
      oauth_verifier: oauthVerifier
    }
  })

  if (!response.ok) {
    throw new Error(`Cardmarket access_token failed: ${response.status} ${text}`)
  }

  return parseOAuthTokenResponse(text)
}

export async function cardmarketGet(params: {
  path: string
  token: string
  tokenSecret: string
  query?: Record<string, string | number | boolean | undefined>
}) {
  const { response, text } = await signedCardmarketRequest({
    method: 'GET',
    path: params.path,
    token: params.token,
    tokenSecret: params.tokenSecret,
    query: params.query
  })

  if (!response.ok) {
    throw new Error(`Cardmarket GET ${params.path} failed: ${response.status} ${text}`)
  }

  return text ? JSON.parse(text) : null
}

export async function cardmarketPut(params: {
  path: string
  token: string
  tokenSecret: string
  jsonBody?: unknown
}) {
  const { response, text } = await signedCardmarketRequest({
    method: 'PUT',
    path: params.path,
    token: params.token,
    tokenSecret: params.tokenSecret,
    jsonBody: params.jsonBody
  })

  if (!response.ok) {
    throw new Error(`Cardmarket PUT ${params.path} failed: ${response.status} ${text}`)
  }

  return text ? JSON.parse(text) : null
}
