const cache = new Map()
const CACHE_TTL = 24 * 60 * 60 * 1000
const keyUsage = new Map()

function cacheGet(key) {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.time > CACHE_TTL) { cache.delete(key); return null }
  return entry.value
}

function cacheSet(key, value) {
  cache.set(key, { value, time: Date.now() })
  return value
}

function getKeys() {
  return [
    process.env.SERPAPI_API_KEY,
    process.env.SERPAPI_KEY_2,
    process.env.SERPAPI_KEY_3,
    process.env.SERPAPI_KEY_4,
    process.env.SERPAPI_KEY_5,
  ].filter(Boolean)
}

function pickKey() {
  const keys = getKeys()
  if (!keys.length) throw new Error('No SerpApi keys configured')
  // Pick the key with lowest usage count
  let best = keys[0]
  let bestCount = keyUsage.get(best) || 0
  for (const key of keys) {
    const count = keyUsage.get(key) || 0
    if (count < bestCount) { best = key; bestCount = count }
  }
  keyUsage.set(best, bestCount + 1)
  return best
}

function markKeyExhausted(key) {
  // Penalize exhausted key heavily so rotation kicks in
  keyUsage.set(key, (keyUsage.get(key) || 0) + 500)
}

async function serpFetch(params) {
  const keys = getKeys()
  let lastError
  for (let attempt = 0; attempt < keys.length; attempt++) {
    const key = pickKey()
    const url = new URL('https://serpapi.com/search')
    Object.entries({ ...params, api_key: key }).forEach(([k, v]) => url.searchParams.set(k, v))
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    let res
    try {
      res = await fetch(url.toString(), { signal: controller.signal })
    } finally {
      clearTimeout(timeout)
    }
    if (res.status === 429 || res.status === 403) {
      markKeyExhausted(key)
      lastError = new Error(`SerpApi key exhausted (${res.status})`)
      continue
    }
    if (!res.ok) throw new Error(`SerpApi ${res.status}`)
    return res.json()
  }
  throw lastError || new Error('All SerpApi keys exhausted')
}

// Group ingredients by store category based on their source field
export function groupIngredientsByCategory(ingredients) {
  const groups = {}
  for (const ing of ingredients) {
    const src = (ing.source || '').toLowerCase()
    let category
    if (/bahan kue|kue|bakery|patisserie/i.test(src)) category = 'Toko Bahan Kue'
    else if (/sembako|grosir|wholesale/i.test(src)) category = 'Grosir Sembako'
    else if (/minimarket/i.test(src)) category = 'Minimarket'
    else if (/pasar/i.test(src)) category = 'Pasar Lokal'
    else if (/plastik|packaging|kemasan/i.test(src)) category = 'Toko Kemasan'
    else if (/pemasok|supplier/i.test(src)) category = 'Pemasok Lokal'
    else category = 'Toko Umum'
    if (!groups[category]) groups[category] = []
    groups[category].push(ing)
  }
  return groups
}

// Search for nearest local store by category + location
export async function searchLocalStore(category, lat, lng, product) {
  const cacheKey = `local:${category}:${lat.toFixed(3)}:${lng.toFixed(3)}`
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  const query = `${category} dekat sini`
  const data = await serpFetch({
    engine: 'google_maps',
    q: query,
    ll: `@${lat},${lng},14z`,
    hl: 'id',
    gl: 'id',
    type: 'search',
  })

  const results = (data.local_results || []).slice(0, 5).map((place) => ({
    name: place.title,
    address: place.address || '',
    rating: place.rating || null,
    reviewCount: place.reviews || null,
    latitude: place.gps_coordinates?.latitude || null,
    longitude: place.gps_coordinates?.longitude || null,
    googleMapsUrl: place.links?.directions || place.link || null,
    type: category,
    placeId: place.place_id || null,
  })).filter((p) => p.latitude && p.longitude)

  return cacheSet(cacheKey, results)
}
