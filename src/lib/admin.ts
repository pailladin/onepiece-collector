export function parseAdminEmails(raw: string | undefined): string[] {
  return (raw || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
}

export function isAdminEmail(
  email: string | null | undefined,
  adminEmails: string[]
): boolean {
  if (!email) return false
  return adminEmails.includes(email.trim().toLowerCase())
}
