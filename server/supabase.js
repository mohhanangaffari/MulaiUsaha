/**
 * One place that knows how to talk to Supabase over REST, so no npm client is
 * needed and there is exactly one spot where the keys are read.
 *
 * Two keys, two jobs:
 *  - anon        : the public sign-up / sign-in endpoints. Designed to be public.
 *  - service_role: reading and writing tables. BYPASSES row level security, so it
 *                  must never leave the server and every query it makes has to be
 *                  scoped to the signed-in user by hand.
 *
 * Nothing in src/ imports this file.
 */

export const supabaseUrl = () => (process.env.SUPABASE_URL || '').replace(/\/+$/, '')
const anonKey = () => process.env.SUPABASE_ANON_KEY || ''
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export const authConfigured = () => Boolean(supabaseUrl() && anonKey() && process.env.SESSION_SECRET)

/**
 * Shape-only report on the credentials, for /api/health. Deliberately booleans and
 * nothing else: enough to spot a value that was truncated or picked up a stray
 * character when it was pasted into a dashboard, without revealing any of it.
 */
export function credentialShape() {
  const url = process.env.SUPABASE_URL || ''
  const check = (value) => ({
    ada: Boolean(value),
    adaSpasiAtauBarisBaru: /\s/.test(value || ''),
    bentukJwt: /^ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test((value || '').trim()),
  })
  return {
    url: { ada: Boolean(url), diawaliHttps: url.startsWith('https://'), adaSpasiAtauBarisBaru: /\s/.test(url) },
    anonKey: check(process.env.SUPABASE_ANON_KEY),
    serviceKey: check(process.env.SUPABASE_SERVICE_ROLE_KEY),
    sessionSecret: { ada: Boolean(process.env.SESSION_SECRET), cukupPanjang: (process.env.SESSION_SECRET || '').length >= 32 },
  }
}
export const projectStoreConfigured = () => Boolean(supabaseUrl() && serviceKey())

/** Supabase reports failures in several shapes; this finds the readable one. */
function messageFrom(payload, fallback) {
  if (!payload || typeof payload !== 'object') return fallback
  return payload.msg || payload.error_description || payload.message || payload.error || fallback
}

/** Calls Supabase's auth API with the anon key, the way a browser client would. */
export async function authRequest(path, body) {
  if (!authConfigured()) throw Object.assign(new Error('Supabase belum dikonfigurasi di server ini.'), { status: 503 })
  let response
  try {
    response = await fetch(`${supabaseUrl()}/auth/v1${path}`, {
      method: 'POST',
      headers: { apikey: anonKey(), Authorization: `Bearer ${anonKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (error) {
    // Swallowing the real reason here cost an hour once already. An invalid URL and
    // a bad header value both throw instantly and look identical from outside, so
    // the underlying message goes to the log where it can actually be read.
    console.error('[supabase-auth]', error.name + ': ' + error.message, error.cause ? '| cause: ' + error.cause.message : '')
    throw Object.assign(new Error('Tidak bisa menghubungi Supabase. Coba lagi sebentar.'), { status: 503 })
  }
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw Object.assign(new Error(messageFrom(payload, 'Permintaan ditolak Supabase.')), { status: response.status })
  }
  return payload
}

/** Calls PostgREST with the service_role key. `path` starts with the table name. */
export async function dbRequest(path, { method = 'GET', body, prefer } = {}) {
  if (!projectStoreConfigured()) {
    throw Object.assign(new Error('SUPABASE_SERVICE_ROLE_KEY belum diatur di server ini.'), { status: 503 })
  }
  const headers = {
    apikey: serviceKey(),
    Authorization: `Bearer ${serviceKey()}`,
    'Content-Type': 'application/json',
  }
  if (prefer) headers.Prefer = prefer

  const response = await fetch(`${supabaseUrl()}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    // Truncated deliberately: a PostgREST error can echo the request, and the key
    // must never reach a log or a response body.
    throw Object.assign(new Error(`Supabase menolak permintaan (HTTP ${response.status}). ${detail.slice(0, 200)}`), {
      status: response.status >= 500 ? 502 : 400,
    })
  }
  if (response.status === 204) return null
  return response.json().catch(() => null)
}
