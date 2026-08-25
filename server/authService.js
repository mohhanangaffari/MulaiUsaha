import { createHmac, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = 'mu_session'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7

/**
 * Google's own tokeninfo endpoint checks the signature and the expiry for us. That
 * costs one request per sign-in — which happens rarely — and saves pulling a JWKS
 * library into a project that has deliberately stayed thin on dependencies.
 */
export async function verifyGoogleIdToken(idToken) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID belum diatur di .env')
  if (typeof idToken !== 'string' || idToken.length < 20) throw new Error('Token masuk tidak valid.')

  let payload
  try {
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`)
    if (!response.ok) throw new Error('rejected')
    payload = await response.json()
  } catch {
    // A network failure and a forged token are not the same thing, but from here
    // both mean the same: we could not establish who this is, so nobody gets in.
    throw new Error('Google tidak dapat memverifikasi token ini. Coba masuk lagi.')
  }

  // tokeninfo validates the token itself but has no idea which app asked. Without
  // this check, a token minted for ANY other Google app would be accepted here.
  if (payload.aud !== clientId) throw new Error('Token ini diterbitkan untuk aplikasi lain.')
  const issuer = String(payload.iss || '')
  if (issuer !== 'accounts.google.com' && issuer !== 'https://accounts.google.com') {
    throw new Error('Penerbit token tidak dikenali.')
  }
  // tokeninfo returns these as strings, not booleans.
  if (String(payload.email_verified) !== 'true') throw new Error('Email Google ini belum terverifikasi.')
  if (!payload.sub || !payload.email) throw new Error('Google tidak mengirim identitas yang lengkap.')

  return {
    googleSub: String(payload.sub),
    email: String(payload.email),
    name: payload.name ? String(payload.name) : String(payload.email).split('@')[0],
    picture: payload.picture ? String(payload.picture) : null,
  }
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
    sub: user.googleSub,
    email: user.email,
    name: user.name,
    picture: user.picture,
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
    return { googleSub: payload.sub, email: payload.email, name: payload.name, picture: payload.picture }
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

export const authConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.SESSION_SECRET)
