import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const response = await fetch('https://optcgapi.com/api/sets')

    if (!response.ok) {
      return NextResponse.json({ error: 'Erreur API OPTCG' }, { status: 500 })
    }

    const data = await response.json()

    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
