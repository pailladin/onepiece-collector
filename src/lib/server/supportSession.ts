import crypto from 'node:crypto'
import type { NextRequest, NextResponse } from 'next/server'

const SUPPORT_COOKIE_NAME = 'opc_support_session'
const SUPPORT_COOKIE_MAX_AGE = 60 * 60 * 4

type SupportSessionPayload = {
  userId: string
  issuedAt: number
}

function getSupportSecret() {
  return process.env.SUPPORT_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

function toBase64Url(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function fromBase64Url(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function signValue(value: string) {
  return crypto.createHmac('sha256', getSupportSecret()).update(value).digest('base64url')
}

export function createSupportSessionValue(userId: string) {
  const payload: SupportSessionPayload = {
    userId: String(userId || '').trim(),
    issuedAt: Date.now()
  }
  const encodedPayload = toBase64Url(JSON.stringify(payload))
  const signature = signValue(encodedPayload)
  return `${encodedPayload}.${signature}`
}

export function parseSupportSessionValue(rawValue: string | null | undefined) {
  const value = String(rawValue || '').trim()
  if (!value) return null

  const [encodedPayload, signature] = value.split('.')
  if (!encodedPayload || !signature) return null
  if (signValue(encodedPayload) !== signature) return null

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload)) as SupportSessionPayload
    const userId = String(payload.userId || '').trim()
    const issuedAt = Number(payload.issuedAt || 0)
    if (!userId || !Number.isFinite(issuedAt)) return null
    if (Date.now() - issuedAt > SUPPORT_COOKIE_MAX_AGE * 1000) return null
    return { userId, issuedAt }
  } catch {
    return null
  }
}

export function getSupportSessionFromRequest(request: NextRequest) {
  return parseSupportSessionValue(request.cookies.get(SUPPORT_COOKIE_NAME)?.value)
}

export function setSupportSessionCookie(response: NextResponse, userId: string) {
  response.cookies.set(SUPPORT_COOKIE_NAME, createSupportSessionValue(userId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SUPPORT_COOKIE_MAX_AGE
  })
}

export function clearSupportSessionCookie(response: NextResponse) {
  response.cookies.set(SUPPORT_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0
  })
}

