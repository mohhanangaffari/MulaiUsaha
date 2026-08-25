/**
 * Fixed-window counter, kept in memory.
 *
 * In memory on purpose: no dependency and no round trip on a path that has to stay
 * fast. The trade-off is real and worth stating — memory belongs to one process, so
 * on Vercel each Function instance counts separately and a cold start resets the
 * count. It still stops the crude case (one script hammering signup, which lands on
 * a warm instance) but it is not a hard guarantee. Making it durable means moving
 * the counter into Supabase, at the cost of two extra requests per attempt.
 */

const buckets = new Map()
// Cheap guard against unbounded growth on a long-lived process: once the map gets
// big, drop everything already expired.
const SWEEP_AT = 5000

function sweep(now) {
  if (buckets.size < SWEEP_AT) return
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key)
  }
}

export function rateLimit(key, { limit, windowMs }) {
  const now = Date.now()
  sweep(now)

  const bucket = buckets.get(key)
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, retryAfterSeconds: 0 }
  }

  bucket.count += 1
  if (bucket.count > limit) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) }
  }
  return { allowed: true, retryAfterSeconds: 0 }
}

/**
 * The caller's address.
 *
 * x-forwarded-for is trivially spoofable when a request arrives directly, so it is
 * only trusted when something is actually in front of us. Vercel sets x-real-ip
 * itself and strips client-supplied copies, which is why it is preferred here.
 * Locally there is no proxy and the socket address is the truth.
 */
export function clientIp(request) {
  const behindProxy = Boolean(process.env.VERCEL)
  if (behindProxy) {
    const real = request.headers['x-real-ip']
    if (typeof real === 'string' && real.trim()) return real.trim()
    const forwarded = request.headers['x-forwarded-for']
    if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim()
  }
  return request.socket?.remoteAddress || request.ip || 'unknown'
}

/** Express middleware. `name` keeps different routes in separate buckets. */
export function limiter(name, { limit, windowMs, message }) {
  return (request, response, next) => {
    const result = rateLimit(`${name}:${clientIp(request)}`, { limit, windowMs })
    if (result.allowed) return next()
    response.setHeader('Retry-After', String(result.retryAfterSeconds))
    const minutes = Math.ceil(result.retryAfterSeconds / 60)
    return response.status(429).json({ error: `${message} Coba lagi dalam ${minutes} menit.` })
  }
}
