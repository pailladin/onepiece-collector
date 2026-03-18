'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { CollectionSetView } from '@/components/CollectionSetView'

export default function AdminSupportCollectionSetPage() {
  const params = useParams()
  const code = Array.isArray(params.code) ? params.code[0] : params.code

  if (!code) {
    return <div style={{ padding: 40 }}>Set introuvable.</div>
  }

  return (
    <div>
      <div style={{ padding: '24px 40px 0', display: 'flex', gap: 14 }}>
        <Link href="/admin/support/collection">Retour a la collection support</Link>
        <Link href="/admin/support/account">Voir le compte</Link>
      </div>
      <CollectionSetView code={code} editable={false} supportMode />
    </div>
  )
}

