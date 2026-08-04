// Username-based auth: we map usernames to an internal email domain
// so Supabase email/password auth works without real emails.
export const USERNAME_DOMAIN = 'nahdat-app.local'

export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${USERNAME_DOMAIN}`
}

export function isValidUsername(u: string): boolean {
  return /^[a-z0-9_.]{3,30}$/.test(u)
}
