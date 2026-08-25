/**
 * User records live in Supabase, reached over its REST API with plain fetch — the
 * project has no database driver and this keeps it that way.
 *
 * The service_role key bypasses Supabase's row level security, so it must never
 * leave the server. Nothing in src/ imports this file.
 *
 * Run this once in the Supabase SQL editor before using it:
 *
 *   create table public.users (
 *     google_sub  text primary key,
 *     email       text not null,
 *     name        text,
 *     picture     text,
 *     created_at  timestamptz not null default now(),
 *     last_seen_at timestamptz not null default now()
 *   );
 *   alter table public.users enable row level security;
 *   -- no policies: only the service_role key may touch this table
 */

const baseUrl = () => (process.env.SUPABASE_URL || '').replace(/\/+$/, '')
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export const userStoreConfigured = () => Boolean(baseUrl() && serviceKey())

function headers(extra = {}) {
  const key = serviceKey()
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...extra,
  }
}

/**
 * Inserts the user on first sign-in and refreshes their profile on every later one.
 * Google is the source of truth for name and picture, so both are overwritten
 * rather than merged — a user who changes their Google photo should see it change
 * here too.
 */
export async function upsertUser(user) {
  if (!userStoreConfigured()) {
    throw new Error('SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum diatur di .env')
  }
  const now = new Date().toISOString()
  const response = await fetch(`${baseUrl()}/rest/v1/users?on_conflict=google_sub`, {
    method: 'POST',
    headers: headers({ Prefer: 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify([{
      google_sub: user.googleSub,
      email: user.email,
      name: user.name,
      picture: user.picture,
      last_seen_at: now,
    }]),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    // The key itself must never reach a log or a response body.
    throw new Error(`Supabase menolak penyimpanan pengguna (HTTP ${response.status}). ${detail.slice(0, 200)}`)
  }

  const [row] = await response.json().catch(() => [])
  return row || null
}
