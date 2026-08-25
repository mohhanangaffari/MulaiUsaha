import 'dotenv/config'
import express from 'express'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { analyzeMarket, geocodeLocation, getPlaceDetails } from './marketService.js'
import { resolveGoogleMapsLink, reverseGeocode } from './locationService.js'
import { generateIngredients, generateConcepts } from './aiService.js'
import { searchLocalStore, groupIngredientsByCategory } from './serpApiService.js'
import { matchIngredient } from './ingredientPriceService.js'
import {
  SESSION_COOKIE,
  authConfigured,
  clearSessionCookieHeader,
  createSessionToken,
  readCookie,
  readSessionToken,
  sessionCookieHeader,
  verifyGoogleIdToken,
} from './authService.js'
import { upsertUser, userStoreConfigured } from './userStore.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const isDev = process.argv.includes('--dev')
const port = Number(process.env.PORT || 5173)
const app = express()

app.disable('x-powered-by')
app.use(express.json({ limit: '32kb' }))

// Sign-in is optional while developing so the app stays usable before the Google
// credentials exist, but a production build must never start half-configured — a
// missing env var there would silently ship an app with no gate at all.
if (!isDev && !authConfigured()) {
  console.error('Tidak bisa start: GOOGLE_CLIENT_ID dan SESSION_SECRET wajib diisi di .env untuk mode produksi.')
  process.exit(1)
}
if (!isDev && !userStoreConfigured()) {
  console.error('Tidak bisa start: SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib diisi di .env untuk mode produksi.')
  process.exit(1)
}
// Cookies are only marked Secure over HTTPS; in dev the app is served over plain
// http://localhost, where a Secure cookie would simply be dropped.
const secureCookies = !isDev

/**
 * The Google client ID is a public identifier — it is meant to appear in the page.
 * It is still served from here rather than baked in at build time so that every
 * credential in this app follows one rule: the frontend asks the server for what
 * it needs, and .env is the only place any of them are written.
 */
app.get('/api/auth/config', (_request, response) => {
  response.json({
    enabled: authConfigured(),
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
  })
})

app.get('/api/auth/session', (request, response) => {
  const session = readSessionToken(readCookie(request, SESSION_COOKIE))
  response.json({ user: session, authEnabled: authConfigured() })
})

app.post('/api/auth/google', async (request, response) => {
  if (!authConfigured()) {
    return response.status(503).json({ error: 'Masuk dengan Google belum dikonfigurasi di server ini.' })
  }
  try {
    const user = await verifyGoogleIdToken(request.body?.credential)
    await upsertUser(user)
    response.setHeader('Set-Cookie', sessionCookieHeader(createSessionToken(user), { secure: secureCookies }))
    return response.json({ user })
  } catch (error) {
    // 401 for a token we refused, 500 for our own failure to store the user.
    const rejected = /token|terverifikasi|identitas|aplikasi lain|Penerbit/i.test(error.message)
    return response.status(rejected ? 401 : 500).json({ error: error.message })
  }
})

app.post('/api/auth/logout', (_request, response) => {
  response.setHeader('Set-Cookie', clearSessionCookieHeader({ secure: secureCookies }))
  response.json({ ok: true })
})

app.get('/api/health', (_request, response) => {
  response.json({
    ok: true,
    service: 'MulaiUsaha Market API',
    provider: process.env.GOOGLE_MAPS_API_KEY ? 'google_places' : 'google_places_setup_required',
    googlePlacesConfigured: Boolean(process.env.GOOGLE_MAPS_API_KEY),
    reviewProvider: process.env.SERPAPI_API_KEY ? 'serpapi' : 'google_places_only',
    serpApiConfigured: Boolean(process.env.SERPAPI_API_KEY),
    time: new Date().toISOString(),
  })
})

app.get('/api/locations/reverse-geocode', async (request, response) => {
  try {
    const lat = Number(request.query.lat)
    const lng = Number(request.query.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return response.status(400).json({ error: 'Koordinat tidak valid.' })
    }
    const location = await reverseGeocode(lat, lng)
    response.set('Cache-Control', 'no-store')
    return response.json({ location })
  } catch (error) {
    console.error('[reverse-geocode]', error)
    return response.status(502).json({ error: 'Lokasi belum berhasil dideteksi. Isi manual jika perlu.' })
  }
})

app.post('/api/locations/resolve-map', async (request, response) => {
  try {
    const mapsUrl = String(request.body?.mapsUrl || '').trim()
    if (!mapsUrl || mapsUrl.length > 2048) return response.status(400).json({ error: 'Link Google Maps belum valid.' })
    return response.json({ location: await resolveGoogleMapsLink(mapsUrl) })
  } catch (error) {
    return response.status(error.status || 502).json({ error: error.publicMessage || 'Link Google Maps belum berhasil dibaca.' })
  }
})

app.get('/api/locations/geocode', async (request, response) => {
  try {
    const village = String(request.query.village || '').trim()
    const district = String(request.query.district || '').trim()
    const city = String(request.query.city || '').trim()
    if (!city || [village, district, city].some((value) => value.length > 80)) {
      return response.status(400).json({ error: 'Wilayah belum lengkap.' })
    }
    const query = [village, district, city, 'Indonesia'].filter(Boolean).join(', ')
    return response.json({ location: await geocodeLocation(query) })
  } catch (error) {
    return response.status(error.status || 502).json({ error: error.publicMessage || 'Lokasi belum berhasil ditemukan.' })
  }
})

app.get('/api/places/details', async (request, response) => {
  try {
    const placeId = String(request.query.id || '').trim()
    const includeReviews = String(request.query.includeReviews || '') === '1'
    if (!placeId || placeId.length > 120) return response.status(400).json({ error: 'ID usaha tidak valid.' })
    response.set('Cache-Control', 'no-store')
    return response.json({ details: await getPlaceDetails(placeId, { includeReviews }) })
  } catch (error) {
    console.error('[place-details]', error)
    return response.status(502).json({ error: 'Detail usaha belum berhasil dimuat.' })
  }
})

app.post('/api/business/concepts', async (request, response) => {
  try {
    const product = String(request.body?.product || '').trim()
    const userPrompt = String(request.body?.userPrompt || '').trim()
    const bust = Boolean(request.body?.bust)
    if (!product || product.length > 80) return response.status(400).json({ error: 'Nama produk tidak valid.' })
    if (userPrompt.length > 200) return response.status(400).json({ error: 'Deskripsi ide terlalu panjang.' })
    if (!process.env.GEMINI_API_KEY) return response.status(503).json({ error: 'AI belum dikonfigurasi.' })
    const result = await generateConcepts(product, { userPrompt, bust })
    if (!result) return response.status(503).json({ error: 'AI belum dikonfigurasi.' })
    response.set('Cache-Control', 'no-store')
    return response.json(result)
  } catch (error) {
    console.error('[business-concepts]', error.message)
    return response.status(502).json({ error: 'Konsep belum berhasil dibuat. Coba lagi.' })
  }
})

app.post('/api/business/ingredients', async (request, response) => {
  try {
    const product = String(request.body?.product || '').trim()
    const conceptTitle = String(request.body?.conceptTitle || '').trim()
    const rawPrice = Number(request.body?.suggestedPrice)
    const suggestedPrice = Number.isFinite(rawPrice) && rawPrice > 0 && rawPrice <= 100000000 ? rawPrice : null
    const unitInfo = {
      unit: String(request.body?.unit || '').trim().slice(0, 20),
      unitContent: String(request.body?.unitContent || '').trim().slice(0, 80),
      piecesPerUnit: Number(request.body?.piecesPerUnit),
    }
    if (!product || product.length > 80) return response.status(400).json({ error: 'Nama produk tidak valid.' })
    if (!process.env.GEMINI_API_KEY) return response.status(503).json({ error: 'AI belum dikonfigurasi.' })
    const result = await generateIngredients(product, conceptTitle, suggestedPrice, unitInfo)
    if (!result) return response.status(503).json({ error: 'AI belum dikonfigurasi.' })
    response.set('Cache-Control', 'private, max-age=86400')
    return response.json(result)
  } catch (error) {
    console.error('[business-ingredients]', error.message)
    return response.status(502).json({ error: 'Daftar bahan belum berhasil dibuat. Coba lagi.' })
  }
})

app.post('/api/suppliers/local', async (request, response) => {
  try {
    const ingredients = request.body?.ingredients
    const lat = Number(request.body?.lat)
    const lng = Number(request.body?.lng)
    const product = String(request.body?.product || '').trim()
    if (!Array.isArray(ingredients) || !ingredients.length) return response.status(400).json({ error: 'Daftar bahan tidak valid.' })
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return response.status(400).json({ error: 'Koordinat tidak valid.' })
    if (!getKeys().length) return response.status(503).json({ error: 'SerpApi belum dikonfigurasi.' })

    const groups = groupIngredientsByCategory(ingredients)
    const results = await Promise.all(
      Object.entries(groups).map(async ([category, ings]) => {
        try {
          const stores = await searchLocalStore(category, lat, lng, product)
          return { category, ingredients: ings, stores }
        } catch {
          return { category, ingredients: ings, stores: [], error: true }
        }
      })
    )
    response.set('Cache-Control', 'no-store')
    return response.json({ groups: results })
  } catch (error) {
    console.error('[suppliers-local]', error.message)
    return response.status(502).json({ error: 'Pencarian toko lokal gagal.' })
  }
})

function getKeys() {
  return [
    process.env.SERPAPI_API_KEY,
    process.env.SERPAPI_KEY_2,
    process.env.SERPAPI_KEY_3,
    process.env.SERPAPI_KEY_4,
    process.env.SERPAPI_KEY_5,
  ].filter(Boolean)
}

app.post('/api/suppliers/online', (request, response) => {
  try {
    const ingredients = request.body?.ingredients
    if (!Array.isArray(ingredients) || !ingredients.length) return response.status(400).json({ error: 'Daftar bahan tidak valid.' })

    // Top 3 most expensive ingredients only — matched against the hand-verified local
    // price database, not searched. SerpApi is reserved for the local-store tab.
    const top3 = [...ingredients].sort((a, b) => (b.baseCost || 0) - (a.baseCost || 0)).slice(0, 3)
    const results = top3.map((ing) => {
      const match = matchIngredient(ing.name)
      if (!match || !match.link) return { ingredient: ing, items: [] }
      return {
        ingredient: ing,
        items: [{
          title: match.judul || match.nama,
          link: match.link,
          price: match.harga,
          source: /shopee/i.test(match.link) ? 'shopee' : 'tokopedia',
          checkedAt: match.dicekTanggal || null,
        }],
      }
    })
    response.set('Cache-Control', 'no-store')
    return response.json({ results })
  } catch (error) {
    console.error('[suppliers-online]', error.message)
    return response.status(502).json({ error: 'Pencarian harga gagal.' })
  }
})

app.post('/api/market/analyze', async (request, response) => {
  try {
    const fields = ['product', 'village', 'district', 'city']
    const input = Object.fromEntries(fields.map((field) => [field, String(request.body?.[field] || '').trim()]))
    input.mapsUrl = String(request.body?.mapsUrl || '').trim()
    input.latitude = request.body?.latitude == null || request.body.latitude === '' ? null : Number(request.body.latitude)
    input.longitude = request.body?.longitude == null || request.body.longitude === '' ? null : Number(request.body.longitude)

    if (!input.product) {
      return response.status(400).json({ error: 'Nama produk harus diisi.' })
    }
    if (fields.some((field) => input[field].length > 80)) {
      return response.status(400).json({ error: 'Input terlalu panjang.' })
    }
    if (input.mapsUrl.length > 2048) return response.status(400).json({ error: 'Link Google Maps terlalu panjang.' })
    const hasLatitude = input.latitude != null
    const hasLongitude = input.longitude != null
    if (!hasLatitude && !hasLongitude) {
      return response.status(400).json({ error: 'Pilih dan konfirmasi titik lokasi jualan sebelum mengecek pasar.' })
    }
    if (hasLatitude !== hasLongitude || (hasLatitude && (!Number.isFinite(input.latitude) || !Number.isFinite(input.longitude) || Math.abs(input.latitude) > 90 || Math.abs(input.longitude) > 180))) {
      return response.status(400).json({ error: 'Koordinat lokasi tidak valid.' })
    }

    const result = await analyzeMarket(input)
    response.set('Cache-Control', 'private, max-age=300')
    return response.json(result)
  } catch (error) {
    console.error('[market-analysis]', error)
    return response.status(error.status || 502).json({
      error: error.publicMessage || 'Data pasar belum berhasil diambil. Silakan coba lagi.',
    })
  }
})

if (isDev) {
  const { createServer } = await import('vite')
  const vite = await createServer({ root, server: { middlewareMode: true }, appType: 'spa' })
  app.use(vite.middlewares)
} else {
  const dist = resolve(root, 'dist')
  app.use(express.static(dist))
  app.use((_request, response) => response.sendFile(resolve(dist, 'index.html')))
}

app.listen(port, '0.0.0.0', () => {
  console.log(`MulaiUsaha running at http://localhost:${port}`)
  console.log(`Competitor provider: ${process.env.GOOGLE_MAPS_API_KEY ? 'Google Places' : 'Google Places setup required'}`)
  console.log(`Review fallback: ${process.env.SERPAPI_API_KEY ? 'SerpApi' : 'not configured'}`)
  console.log(`Google sign-in: ${authConfigured() ? 'active' : 'not configured — app is open in dev'}`)
  console.log(`User store: ${userStoreConfigured() ? 'Supabase' : 'not configured'}`)
})
