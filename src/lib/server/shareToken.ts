import crypto from 'node:crypto'

type ShareTokenPayload = {
  u: string
  c: string
  exp: number
}

const TOKEN_VERSION = 'v1'
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 365 // 1 year

function getSecret() {
  const secret =
    process.env.SHARE_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!secret) {
    throw new Error('Missing SHARE_LINK_SECRET (or SUPABASE_SERVICE_ROLE_KEY)')
  }
  return secret
}

function normalizeSetCode(value: string) {
  return value.trim().toUpperCase().replace(/-/g, '')
}

function sign(input: string) {
  return crypto.createHmac('sha256', getSecret()).update(input).digest('base64url')
}

export function createShareSetToken(params: { userId: string; setCode: string }) {
  const payload: ShareTokenPayload = {
    u: params.userId,
    c: normalizeSetCode(params.setCode),
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS
  }

  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const signature = sign(`${TOKEN_VERSION}.${body}`)
  return `${TOKEN_VERSION}.${body}.${signature}`
}

export function verifyShareSetToken(token: string): { userId: string; setCode: string } {
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid token format')
  }

  const [version, body, signature] = parts
  if (version !== TOKEN_VERSION) {
    throw new Error('Invalid token version')
  }

  const expected = sign(`${version}.${body}`)
  const expectedBuffer = Buffer.from(expected)
  const signatureBuffer = Buffer.from(signature)
  if (
    expectedBuffer.length !== signatureBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
  ) {
    throw new Error('Invalid token signature')
  }

  const payload = JSON.parse(
    Buffer.from(body, 'base64url').toString('utf8')
  ) as ShareTokenPayload

  if (!payload?.u || !payload?.c || !payload?.exp) {
    throw new Error('Invalid token payload')
  }
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expired')
  }

  return {
    userId: payload.u,
    setCode: normalizeSetCode(payload.c)
  }
}
