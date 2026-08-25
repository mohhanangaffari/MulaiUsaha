import { createHmac, timingSafeEqual } from 'node:crypto'
import { authRequest } from './supabase.js'

export const SESSION_COOKIE = 'mu_session'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

export { authConfigured } from './supabase.js'

const MIN_PASSWORD = 8

function validateCredentials(email, password) {
  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw Object.assign(new Error('Alamat email tidak valid.'), { status: 400 })
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    throw Object.assign(new Error(`Kata sandi minimal ${MIN_PASSWORD} karakter.`), { status: 400 })
  }
  return { email: cleanEmail, password }
}

/** Supabase returns the account under different keys for signup vs token. */
function userFrom(payload) {
  const user = payload?.user || payload
  if (!user?.id || !user?.email) {
    throw Object.assign(new Error('Supabase tidak mengembalikan identitas yang lengkap.'), { status: 502 })
  }
  return { id: String(user.id), email: String(user.email) }
}

export async function registerWithPassword(email, password) {
  const clean = validateCredentials(email, password)
  const payload = await authRequest('/signup', clean).catch((error) => {
    // Supabase says "User already registered"; say something a person can act on.
    if (/already registered|already exists/i.test(error.message)) {
      throw Object.assign(new Error('Email ini sudah terdaftar. Coba masuk saja.'), { status: 409 })
    }
    throw error
  })

  // With "Confirm email" switched off, signup returns a usable session. If it is
  // ever switched back on, there is no session here and the account cannot be used
  // until the link is clicked — say so rather than pretending the sign-in worked.
  if (!payload?.access_token && !payload?.user?.id) {
    throw Object.assign(new Error('Akun dibuat, tapi perlu konfirmasi email sebelum bisa dipakai.'), { status: 202 })
  }
  return userFrom(payload)
}

export async function loginWithPassword(email, password) {
  const clean = validateCredentials(email, password)
  const payload = await authRequest('/token?grant_type=password', clean).catch((error) => {
    if (/invalid login credentials/i.test(error.message)) {
      throw Object.assign(new Error('Email atau kata sandi salah.'), { status: 401 })
    }
    if (/email not confirmed/i.test(error.message)) {
      throw Object.assign(new Error('Email ini belum dikonfirmasi.'), { status: 403 })
    }
    throw error
  })
  return userFrom(payload)
}

function sessionSecret() {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET belum diatur di .env, atau terlalu pendek (minimal 32 karakter).')
  }
  return secret
}

const sign = (body) => createHmac('sha256', sessionSecret()).update(body).digest('base64url')

export function createSessionToken(user) {
  const body = Buffer.from(JSON.stringify({
    sub: user.id,
    email: user.email,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  })).toString('base64url')
  return `${body}.${sign(body)}`
}

export function readSessionToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null
  const [body, signature] = token.split('.')
  if (!body || !signature) return null

  let expected
  try { expected = sign(body) } catch { return null }
  // Length must match before timingSafeEqual, which throws on unequal buffers.
  const given = Buffer.from(signature)
  const wanted = Buffer.from(expected)
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return null

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (!payload?.sub || !payload?.exp) return null
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null
    return { id: payload.sub, email: payload.email }
  } catch {
    return null
  }
}

/** Minimal cookie reader — the app has no cookie middleware and needs exactly one. */
export function readCookie(request, name) {
  const header = request.headers?.cookie
  if (!header) return null
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    if (part.slice(0, index).trim() !== name) continue
    return decodeURIComponent(part.slice(index + 1).trim())
  }
  return null
}

/**
 * httpOnly keeps the token out of reach of any script on the page, so an injected
 * script cannot read or exfiltrate the session. SameSite=Lax stops another site
 * from making authenticated requests on the user's behalf.
 */
export function sessionCookieHeader(token, { secure }) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function clearSessionCookieHeader({ secure }) {
  const parts = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0']
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

/** Reads the session off a request, or null. Used to scope every project query. */
export function currentUser(request) {
  return readSessionToken(readCookie(request, SESSION_COOKIE))
}
