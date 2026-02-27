'use client'

import { useParams } from 'next/navigation'
import { CollectionSetView } from '@/components/CollectionSetView'

export default function CollectionSetPage() {
  const params = useParams()
  const code = Array.isArray(params.code) ? params.code[0] : params.code

  if (!code) {
    return <div style={{ padding: 40 }}>Set introuvable.</div>
  }

  return <CollectionSetView code={code} editable />
}
