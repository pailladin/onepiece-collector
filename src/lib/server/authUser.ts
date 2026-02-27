import { supabaseAnonServer } from '@/lib/server/supabaseServer'

function readBearerToken(value: string | null): string | null {
  if (!value) return null
  const match = value.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

export async function getRequestUserId(
  request: Request
): Promise<{ userId: string | null; error?: string }> {
  const token = readBearerToken(request.headers.get('authorization'))
  if (!token) return { userId: null, error: 'Missing bearer token' }

  const { data, error } = await supabaseAnonServer.auth.getUser(token)
  if (error || !data.user) {
    return { userId: null, error: 'Invalid auth token' }
  }

  return { userId: data.user.id }
}

export async function getRequestUser(
  request: Request
): Promise<{
  user: { id: string; email: string | null } | null
  error?: string
}> {
  const token = readBearerToken(request.headers.get('authorization'))
  if (!token) return { user: null, error: 'Missing bearer token' }

  const { data, error } = await supabaseAnonServer.auth.getUser(token)
  if (error || !data.user) {
    return { user: null, error: 'Invalid auth token' }
  }

  return {
    user: {
      id: data.user.id,
      email: data.user.email ?? null
    }
  }
}
