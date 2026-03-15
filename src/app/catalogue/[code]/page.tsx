import type { Metadata } from 'next'
import { CatalogueSetPageClient } from '@/components/CatalogueSetPageClient'
import { supabaseServiceServer } from '@/lib/server/supabaseServer'

type Params = {
  code: string
}

export async function generateMetadata({
  params
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const code = String((await params).code || '')
    .replace('-', '')
    .toUpperCase()

  const { data: setData } = await supabaseServiceServer
    .from('sets')
    .select('code, name')
    .eq('code', code)
    .maybeSingle()

  const setName = setData?.name ? `${setData.code} - ${setData.name}` : code

  return {
    title: `Catalogue ${setName}`,
    description: `Consulte les cartes, raretes, types et variantes du set ${setName} sur One Piece Collector.`,
    alternates: {
      canonical: `/catalogue/${code}`
    },
    openGraph: {
      title: `Catalogue ${setName}`,
      description: `Consulte les cartes, raretes, types et variantes du set ${setName}.`
    }
  }
}

export default function CatalogueSetPage() {
  return <CatalogueSetPageClient />
}

