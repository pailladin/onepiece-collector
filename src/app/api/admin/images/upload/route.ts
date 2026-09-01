import { NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/server/authUser'
import { isAdminEmail, parseAdminEmails } from '@/lib/admin'
import { putCardImage } from '@/lib/server/imageStorage'

export const runtime = 'nodejs'

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_')
}

export async function POST(request: Request) {
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

  const formData = await request.formData()
  const file = (
    formData as unknown as { get(name: string): FormDataEntryValue | null }
  ).get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Fichier requis' }, { status: 400 })
  }

  const fileName = safeFileName(file.name)
  const setCode = safeFileName(fileName.split('-')[0] || '').toUpperCase()
  if (!setCode || !fileName) {
    return NextResponse.json({ error: 'Nom de fichier invalide' }, { status: 400 })
  }

  const path = `${setCode}/${fileName}`
  await putCardImage(
    path,
    Buffer.from(await file.arrayBuffer()),
    file.type || 'application/octet-stream'
  )

  return NextResponse.json({ ok: true, path })
}
