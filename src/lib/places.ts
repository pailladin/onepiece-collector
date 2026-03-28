export const PLACE_ACTIVITY_OPTIONS = [
  { value: 'buy_boosters', label: 'Acheter des boosters' },
  { value: 'buy_singles', label: 'Acheter des singles' },
  { value: 'sell_cards', label: 'Revendre des cartes' },
  { value: 'trade_cards', label: 'Echanger des cartes' },
  { value: 'play_casual', label: 'Jouer librement' },
  { value: 'tournaments', label: 'Faire des tournois' },
  { value: 'learn_game', label: 'Decouvrir le jeu' },
  { value: 'preorders', label: 'Precommandes' }
] as const

export type PlaceActivity = (typeof PLACE_ACTIVITY_OPTIONS)[number]['value']

export type PlaceRow = {
  id: string
  slug: string
  name: string
  description: string | null
  image_url: string | null
  address_line: string | null
  city: string | null
  postal_code: string | null
  department_code: string | null
  country: string | null
  discord_url: string | null
  website_url: string | null
  google_maps_url: string | null
  activities: string[] | null
  is_active: boolean | null
  created_at?: string | null
  updated_at?: string | null
}

export function normalizePlaceSlug(value: string | null | undefined) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function deriveDepartmentCode(postalCode: string | null | undefined) {
  const raw = (postalCode || '').trim()
  if (!raw) return null
  if (/^(97|98)\d/.test(raw)) return raw.slice(0, 3)
  if (/^\d{2,5}$/.test(raw)) return raw.slice(0, 2)
  return null
}

export function normalizePlaceActivities(values: unknown): PlaceActivity[] {
  const allowed = new Set<string>(PLACE_ACTIVITY_OPTIONS.map((option) => option.value))
  if (!Array.isArray(values)) return []

  return values
    .map((value) => String(value || '').trim())
    .filter((value): value is PlaceActivity => allowed.has(value))
}

export function buildPlaceSearchText(input: {
  name?: string | null
  description?: string | null
  city?: string | null
  postalCode?: string | null
  departmentCode?: string | null
  addressLine?: string | null
  country?: string | null
}) {
  return [
    input.name,
    input.description,
    input.city,
    input.postalCode,
    input.departmentCode,
    input.addressLine,
    input.country
  ]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ')
}

export function getPlaceActivityLabel(activity: string) {
  return (
    PLACE_ACTIVITY_OPTIONS.find((option) => option.value === activity)?.label || activity
  )
}
