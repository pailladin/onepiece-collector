'use client'

import { useParams } from 'next/navigation'
import { CollectionSetView } from '@/components/CollectionSetView'

export default function SharedSetPage() {
  const params = useParams()
  const token = Array.isArray(params.token) ? params.token[0] : params.token
  const code = Array.isArray(params.code) ? params.code[0] : params.code

  if (!token || !code) {
    return <div style={{ padding: 40 }}>Lien de partage invalide.</div>
  }

  return (
    <CollectionSetView
      code={code}
      editable={false}
      shareToken={token}
      title={`Collection partagee - ${code}`}
    />
  )
}
