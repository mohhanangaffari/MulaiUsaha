/**
 * Vercel Function entry point.
 *
 * Vercel does not run a long-lived process, so `app.listen()` is never called in a
 * deployment — the platform invokes the exported Express app per request instead.
 * `server/index.js` stays the entry point for local development, where listening is
 * exactly what we want.
 *
 * Everything under /api is routed here by vercel.json; the built Vite frontend is
 * served as static files alongside it.
 */
import app from '../server/app.js'

export default app
