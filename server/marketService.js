import { resolveGoogleMapsLink } from './locationService.js'

const cache = new Map()
const CACHE_TTL = 24 * 60 * 60 * 1000
const REVIEW_CACHE_TTL = 6 * 60 * 60 * 1000
const RADIUS_METERS = 3000

function normalize(value) {
  return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s-]/g, '').trim()
}

function distanceMeters(origin, destination) {
  if (![origin?.latitude, origin?.longitude, destination?.latitude, destination?.longitude].every(Number.isFinite)) return Infinity
  const radians = (value) => value * Math.PI / 180
  const latitudeDistance = radians(destination.latitude - origin.latitude)
  const longitudeDistance = radians(destination.longitude - origin.longitude)
  const a = Math.sin(latitudeDistance / 2) ** 2
    + Math.cos(radians(origin.latitude)) * Math.cos(radians(destination.latitude)) * Math.sin(longitudeDistance / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function withinAnalysisRadius(center, place) {
  return distanceMeters(center, place) <= RADIUS_METERS
}

function cacheGet(key, ttl = CACHE_TTL) {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.time > ttl) {
    cache.delete(key)
    return null
  }
  return entry.value
}

function cacheSet(key, value) {
  cache.set(key, { value, time: Date.now() })
  return value
}

async function fetchJson(url, options = {}, timeoutMs = 18000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    if (!response.ok) throw new Error(`Upstream ${response.status}`)
    return await response.json()
  } finally {
    clearTimeout(timeout)
  }
}

async function googleTextSearch(textQuery, center, pageSize = 12) {
  const body = { textQuery, pageSize, languageCode: 'id', regionCode: 'ID' }
  if (center) {
    const latitudeDelta = RADIUS_METERS / 111000
    const longitudeDelta = RADIUS_METERS / (111000 * Math.cos(center.latitude * Math.PI / 180))
    body.locationRestriction = {
      rectangle: {
        low: { latitude: center.latitude - latitudeDelta, longitude: center.longitude - longitudeDelta },
        high: { latitude: center.latitude + latitudeDelta, longitude: center.longitude + longitudeDelta },
      },
    }
  }

  const data = await fetchJson('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.googleMapsUri,places.primaryTypeDisplayName,places.priceLevel,places.businessStatus',
    },
    body: JSON.stringify(body),
  })

  return (data.places || []).map((place) => ({
    id: place.id,
    name: place.displayName?.text || 'Usaha lokal',
    rating: place.rating || null,
    reviewCount: place.userRatingCount || null,
    type: place.primaryTypeDisplayName?.text || 'Usaha lokal',
    address: place.formattedAddress || '',
    latitude: place.location?.latitude,
    longitude: place.location?.longitude,
    url: place.googleMapsUri,
    googleMapsUrl: place.googleMapsUri,
    googlePlaceId: place.id,
    priceLevel: place.priceLevel || null,
    businessStatus: place.businessStatus || null,
    provider: 'Google Places',
    locationAccuracy: 'verified',
  }))
}

async function serpApiPlaceReviews(placeId) {
  if (!process.env.SERPAPI_API_KEY || !placeId) return []

  const key = `serp-reviews:v2:${placeId}`
  const cached = cacheGet(key, REVIEW_CACHE_TTL)
  if (cached) return cached

  const url = new URL('https://serpapi.com/search.json')
  url.searchParams.set('engine', 'google_maps_reviews')
  url.searchParams.set('place_id', placeId)
  url.searchParams.set('hl', 'id')
  url.searchParams.set('sort_by', 'qualityScore')
  url.searchParams.set('api_key', process.env.SERPAPI_API_KEY)

  const data = await fetchJson(url, {}, 20000)
  if (data.error) throw new Error(`SerpApi: ${data.error}`)

  const reviews = (data.reviews || []).map((review) => ({
    authorName: review.user?.name || 'Pengguna Google',
    authorUrl: review.user?.link || null,
    authorPhotoUrl: review.user?.thumbnail || null,
    rating: review.rating || null,
    text: review.snippet || review.extracted_snippet?.original || '',
    relativeTime: review.date || null,
    publishedAt: review.iso_date || null,
    googleMapsUrl: review.link || null,
    flagContentUrl: null,
  })).filter((review) => review.text)

  return cacheSet(key, reviews)
}

async function googlePlaceDetails(placeId, { includeReviews = false } = {}) {
  // Version the review cache separately so a previously cached fallback can
  // never hide reviews that Google Places now returns for the same Place ID.
  const key = `google-detail:v2:${placeId}:${includeReviews ? 'reviews' : 'basic'}`
  const cached = cacheGet(key, includeReviews ? REVIEW_CACHE_TTL : CACHE_TTL)
  if (cached) return cached
  const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`)
  url.searchParams.set('languageCode', 'id')
  url.searchParams.set('regionCode', 'ID')
  const baseFieldMask = 'id,displayName,formattedAddress,location,rating,userRatingCount,googleMapsUri,primaryTypeDisplayName,businessStatus,currentOpeningHours,regularOpeningHours,nationalPhoneNumber,websiteUri'
  let place
  try {
    place = await fetchJson(url, {
      headers: {
        'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': includeReviews ? `${baseFieldMask},reviews` : baseFieldMask,
      },
    }, 12000)
  } catch (error) {
    // Review bubbles should remain useful when the small development quota is
    // exhausted. This fallback is keyed only by Place ID, never by category,
    // so it works for every kind of business returned by Google Places.
    if (includeReviews && process.env.SERPAPI_API_KEY) {
      try {
        const reviews = await serpApiPlaceReviews(placeId)
        return cacheSet(key, {
          available: reviews.length > 0,
          openingHours: null,
          weeklyOpeningHours: [],
          phone: null,
          website: null,
          email: null,
          delivery: null,
          takeaway: null,
          wheelchair: null,
          source: 'SerpApi (fallback Google Places)',
          reviewSource: reviews.length ? 'SerpApi' : null,
          sourceUrl: null,
          googlePlaceId: placeId,
          degraded: true,
          reviews,
        })
      } catch (fallbackError) {
        console.error('[google-place-details]', error.message, '[serpapi-reviews]', fallbackError.message)
      }
    }
    throw error
  }
  const isOpen = place.currentOpeningHours?.openNow
  const googleReviews = includeReviews ? (place.reviews || []).map((review) => ({
    authorName: review.authorAttribution?.displayName || 'Pengguna Google',
    authorUrl: review.authorAttribution?.uri || null,
    authorPhotoUrl: review.authorAttribution?.photoUri || null,
    rating: review.rating || null,
    text: review.text?.text || review.originalText?.text || '',
    relativeTime: review.relativePublishTimeDescription || null,
    publishedAt: review.publishTime || null,
    googleMapsUrl: review.googleMapsUri || null,
    flagContentUrl: review.flagContentUri || null,
  })).filter((review) => review.text) : []
  let reviews = googleReviews
  let reviewSource = googleReviews.length ? 'Google Places' : null

  if (includeReviews && !reviews.length && process.env.SERPAPI_API_KEY) {
    try {
      reviews = await serpApiPlaceReviews(placeId)
      if (reviews.length) reviewSource = 'SerpApi'
    } catch (error) {
      console.error('[serpapi-reviews]', error.message)
    }
  }

  const details = {
    available: true,
    openingHours: typeof isOpen === 'boolean' ? (isOpen ? 'Buka sekarang' : 'Tutup sekarang') : null,
    weeklyOpeningHours: place.regularOpeningHours?.weekdayDescriptions || [],
    phone: place.nationalPhoneNumber || null,
    website: place.websiteUri || null,
    email: null,
    delivery: null,
    takeaway: null,
    wheelchair: null,
    source: reviewSource === 'SerpApi' ? 'Google Places + SerpApi' : 'Google Places',
    reviewSource,
    sourceUrl: place.googleMapsUri || null,
    googlePlaceId: place.id,
    reviews,
  }
  return cacheSet(key, details)
}

export async function geocodeLocation(locationText) {
  const key = `geo:${normalize(locationText)}`
  const cached = cacheGet(key)
  if (cached) return cached

  if (process.env.GOOGLE_MAPS_API_KEY) {
    const places = await googleTextSearch(locationText, null, 1)
    if (places[0]?.latitude) {
      return cacheSet(key, {
        latitude: places[0].latitude,
        longitude: places[0].longitude,
        displayName: places[0].address || locationText,
        provider: 'Google Places',
      })
    }
  }

  const contact = process.env.APP_CONTACT_URL || 'http://localhost:5173'
  const searchNominatim = async (query) => {
    const url = new URL('https://nominatim.openstreetmap.org/search')
    url.searchParams.set('q', query)
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('limit', '1')
    url.searchParams.set('countrycodes', 'id')
    return fetchJson(url, {
      headers: { 'User-Agent': `MulaiUsaha/0.1 (${contact})`, Accept: 'application/json' },
    })
  }

  let data = await searchNominatim(locationText)
  if (!data[0]) {
    const broaderLocation = locationText.split(',').slice(1).join(',').trim()
    await new Promise((resolve) => setTimeout(resolve, 1100))
    data = await searchNominatim(broaderLocation)
  }

  if (!data[0]) {
    const error = new Error('Location not found')
    error.status = 404
    error.publicMessage = 'Lokasi belum ditemukan. Periksa kembali nama kelurahan, kecamatan, dan kota.'
    throw error
  }

  return cacheSet(key, {
    latitude: Number(data[0].lat),
    longitude: Number(data[0].lon),
    displayName: data[0].display_name,
    provider: 'OpenStreetMap Nominatim',
  })
}

function escapeRegex(value) {
  return normalize(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '|')
}

function competitorSelectors(product) {
  const normalized = normalize(product)
  if (/donat|donut/.test(normalized)) {
    return ['["name"~"donat|donut",i]', '["shop"="bakery"]', '["cuisine"~"donut",i]']
  }
  if (/kopi|coffee/.test(normalized)) return ['["name"~"kopi|coffee",i]', '["amenity"="cafe"]']
  if (/gorengan|snack|jajanan/.test(normalized)) return [`["name"~"${escapeRegex(product)}",i]`, '["amenity"="fast_food"]']
  return [`["name"~"${escapeRegex(product)}",i]`]
}

function buildOverpassQuery(product, center) {
  const around = `(around:${RADIUS_METERS},${center.latitude},${center.longitude})`
  const lines = ['[out:json][timeout:20];', '(']
  for (const selector of competitorSelectors(product)) lines.push(`nwr${around}${selector};`)
  lines.push(`nwr(around:1500,${center.latitude},${center.longitude})["shop"="supermarket"];`)
  lines.push(`nwr${around}["shop"="wholesale"];`)
  lines.push(`nwr${around}["name"~"bahan kue|kemasan|plastik|sembako|grosir",i];`)
  lines.push(');', 'out center 50;')
  return lines.join(String.fromCharCode(10))
}

function pointOf(element) {
  return {
    latitude: Number(element.lat ?? element.center?.lat),
    longitude: Number(element.lon ?? element.center?.lon),
  }
}

function addressOf(tags = {}) {
  return [tags['addr:street'], tags['addr:housenumber'], tags['addr:suburb']].filter(Boolean).join(' ') || tags['addr:full'] || ''
}

function isSupplier(tags = {}) {
  return /supermarket|convenience|wholesale/.test(tags.shop || '') || /bahan kue|kemasan|plastik|sembako|grosir/i.test(tags.name || '')
}

function isCompetitor(tags = {}, product) {
  const productPattern = new RegExp(escapeRegex(product), 'i')
  if (productPattern.test(tags.name || '')) return true
  const normalized = normalize(product)
  if (/donat|donut/.test(normalized)) return tags.shop === 'bakery' || /donut/i.test(tags.cuisine || '')
  if (/kopi|coffee/.test(normalized)) return tags.amenity === 'cafe'
  if (/gorengan|snack|jajanan/.test(normalized)) return tags.amenity === 'fast_food'
  return false
}

async function searchOpenStreetMap(product, center) {
  const key = `osm:${normalize(product)}:${center.latitude.toFixed(3)}:${center.longitude.toFixed(3)}`
  const cached = cacheGet(key)
  if (cached) return cached

  const body = new URLSearchParams({ data: buildOverpassQuery(product, center) })
  const endpoints = ['https://overpass.private.coffee/api/interpreter', 'https://overpass-api.de/api/interpreter']
  let data
  for (const endpoint of endpoints) {
    try {
      data = await fetchJson(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': `MulaiUsaha/0.1 (${process.env.APP_CONTACT_URL || 'http://localhost:5173'})`,
        },
        body,
      }, 22000)
      break
    } catch (error) {
      if (endpoint === endpoints.at(-1)) throw error
    }
  }

  const mapped = (data.elements || []).filter((element) => element.tags?.name).map((element) => {
    const point = pointOf(element)
    return {
      id: `${element.type}/${element.id}`,
      name: element.tags.name,
      rating: null,
      reviewCount: null,
      type: element.tags.shop || element.tags.amenity || 'Usaha lokal',
      address: addressOf(element.tags),
      latitude: point.latitude,
      longitude: point.longitude,
      url: `https://www.openstreetmap.org/${element.type}/${element.id}`,
      provider: 'OpenStreetMap',
      locationAccuracy: 'mapped',
      tags: element.tags,
    }
  })

  const unique = (items) => [...new Map(items.map((item) => [normalize(item.name), item])).values()]
  return cacheSet(key, {
    competitors: unique(mapped.filter((item) => isCompetitor(item.tags, product))).slice(0, 20),
    suppliers: unique(mapped.filter((item) => isSupplier(item.tags))).slice(0, 12),
  })
}

function photonPlace(feature, kind) {
  const properties = feature.properties || {}
  const coordinates = feature.geometry?.coordinates || []
  const osmType = { N: 'node', W: 'way', R: 'relation' }[properties.osm_type]
  return {
    id: `photon/${properties.osm_type || 'place'}/${properties.osm_id || properties.name}`,
    name: properties.name || kind,
    rating: null,
    reviewCount: null,
    type: kind,
    address: [properties.street, properties.district, properties.city].filter(Boolean).join(', '),
    latitude: Number(coordinates[1]),
    longitude: Number(coordinates[0]),
    url: osmType && properties.osm_id ? `https://www.openstreetmap.org/${osmType}/${properties.osm_id}` : null,
    provider: 'OpenStreetMap Photon',
    locationAccuracy: 'mapped',
  }
}

async function searchPhoton(product, center) {
  const key = `photon:${normalize(product)}:${center.latitude.toFixed(3)}:${center.longitude.toFixed(3)}`
  const cached = cacheGet(key)
  if (cached) return cached

  const latDelta = RADIUS_METERS / 111000
  const lonDelta = RADIUS_METERS / (111000 * Math.cos(center.latitude * Math.PI / 180))
  const bbox = [center.longitude - lonDelta, center.latitude - latDelta, center.longitude + lonDelta, center.latitude + latDelta].join(',')
  const search = async (query, limit = 20) => {
    const url = new URL('https://photon.komoot.io/api/')
    url.searchParams.set('q', query)
    url.searchParams.set('bbox', bbox)
    url.searchParams.set('limit', String(limit))
    const result = await fetchJson(url, { headers: { 'User-Agent': `MulaiUsaha/0.1 (${process.env.APP_CONTACT_URL || 'http://localhost:5173'})` } }, 12000)
    return result.features || []
  }

  const [competitorFeatures, markets, minimarkets, otherMinimarkets] = await Promise.all([
    search(product),
    search('pasar', 10),
    search('Indomaret', 10),
    search('Alfamart', 10),
  ])
  const unique = (items) => [...new Map(items.filter((item) => item.name).map((item) => [normalize(item.name), item])).values()]
  return cacheSet(key, {
    competitors: unique(competitorFeatures.map((feature) => photonPlace(feature, 'Usaha terkait'))).filter((place) => withinAnalysisRadius(center, place)).slice(0, 20),
    suppliers: unique([
      ...markets.map((feature) => photonPlace(feature, 'Pasar lokal')),
      ...minimarkets.map((feature) => photonPlace(feature, 'Minimarket')),
      ...otherMinimarkets.map((feature) => photonPlace(feature, 'Minimarket')),
    ]).filter((place) => withinAnalysisRadius(center, place)).slice(0, 12),
  })
}

export async function getPlaceDetails(placeId, { includeReviews = false } = {}) {
  if (process.env.GOOGLE_MAPS_API_KEY && !String(placeId).includes('/')) {
    return googlePlaceDetails(placeId, { includeReviews })
  }
  const match = String(placeId || '').match(/^(?:photon\/)?([NWR]|node|way|relation)\/(\d+)$/i)
  if (!match) return { available: false, source: 'Data ringkas' }
  const type = { n: 'node', w: 'way', r: 'relation' }[match[1].toLowerCase()] || match[1].toLowerCase()
  const osmId = match[2]
  const key = `osm-detail:${type}:${osmId}`
  const cached = cacheGet(key)
  if (cached) return cached
  const data = await fetchJson(`https://api.openstreetmap.org/api/0.6/${type}/${osmId}.json`, {
    headers: { 'User-Agent': `MulaiUsaha/0.1 (${process.env.APP_CONTACT_URL || 'http://localhost:5173'})`, Accept: 'application/json' },
  }, 12000)
  const element = data.elements?.find((item) => String(item.id) === osmId) || data.elements?.[0]
  const tags = element?.tags || {}
  const details = {
    available: Object.keys(tags).length > 0,
    openingHours: tags.opening_hours || null,
    phone: tags['contact:phone'] || tags.phone || tags['contact:mobile'] || null,
    website: tags['contact:website'] || tags.website || null,
    email: tags['contact:email'] || tags.email || null,
    cuisine: tags.cuisine || null,
    delivery: tags.delivery || null,
    takeaway: tags.takeaway || null,
    wheelchair: tags.wheelchair || null,
    payment: Object.entries(tags).filter(([name, value]) => name.startsWith('payment:') && value === 'yes').map(([name]) => name.replace('payment:', '').replaceAll('_', ' ')),
    source: 'OpenStreetMap',
    sourceUrl: `https://www.openstreetmap.org/${type}/${osmId}`,
  }
  return cacheSet(key, details)
}

function scoreMarket(competitors, provider) {
  const count = competitors.length

  // Sinyal permintaan: semakin banyak kompetitor, semakin terbukti permintaannya
  const demand = count === 0 ? 28 : Math.min(91, 40 + count * 3.2)

  // Ruang bersaing: dipengaruhi jumlah DAN rating rata-rata pesaing
  const ratedOnes = competitors.filter((c) => c.rating != null)
  const avgRating = ratedOnes.length ? ratedOnes.reduce((sum, c) => sum + c.rating, 0) / ratedOnes.length : 3.5
  const highRatedCount = ratedOnes.filter((c) => c.rating >= 4.5).length
  // Ruang bersaing rendah = kompetitor banyak + rating tinggi
  const baseCompetition = Math.max(18, 92 - count * 5)
  const ratingPenalty = Math.round(highRatedCount * 3.5)
  const competition = Math.max(12, Math.min(85, baseCompetition - ratingPenalty))

  // Peluang pembeda: lebih besar jika rating pesaing rendah-menengah (ada gap kualitas)
  const gapOpportunity = avgRating < 4.0 ? 88 : avgRating < 4.4 ? 78 : avgRating < 4.7 ? 70 : 62
  const differentiation = count === 0 ? 82 : Math.min(91, gapOpportunity + (count < 3 ? 8 : 0))

  // Kecocokan lokasi: berdasarkan jumlah kompetitor (sinyal area aktif)
  const locationFit = count === 0 ? 55 : count < 3 ? 63 : count < 8 ? 72 : count < 15 ? 78 : Math.min(88, 78 + (count - 15))

  const score = Math.round(demand * 0.35 + competition * 0.25 + differentiation * 0.2 + locationFit * 0.2)
  const confidence = provider === 'google_places' && count >= 5 ? 'Tinggi' : count >= 3 ? 'Sedang' : 'Rendah'
  const label = score >= 75 ? 'Potensi kuat' : score >= 60 ? 'Menjanjikan dengan diferensiasi' : score >= 40 ? 'Perlu uji pasar' : 'Kurang disarankan'

  const competitionNote = competition <= 30 ? 'Kompetitor padat dan berrating tinggi' : competition <= 50 ? 'Persaingan cukup ketat' : 'Persaingan masih terbuka'
  const diffNote = differentiation >= 80 ? 'Ada celah kualitas yang bisa dimanfaatkan' : differentiation >= 70 ? 'Perlu konsep yang lebih spesifik' : 'Pesaing sudah solid, butuh diferensiasi kuat'
  const avgRatingStr = ratedOnes.length ? `(rata-rata rating ${avgRating.toFixed(1)})` : ''

  return {
    score,
    label,
    confidence,
    avgRating: ratedOnes.length ? Math.round(avgRating * 10) / 10 : null,
    highRatedCount,
    metrics: [
      { label: 'Sinyal permintaan', value: Math.round(demand), note: count ? `${count} usaha terkait ditemukan` : 'Sinyal lokal masih terbatas' },
      { label: 'Ruang bersaing', value: Math.round(competition), note: `${competitionNote} ${avgRatingStr}`.trim() },
      { label: 'Peluang pembeda', value: Math.round(differentiation), note: diffNote },
      { label: 'Kecocokan lokasi', value: Math.round(locationFit), note: count >= 8 ? 'Area cukup ramai usaha sejenis' : 'Berdasarkan aktivitas usaha sekitar' },
    ],
  }
}

export async function analyzeMarket(input) {
  const locationQuery = `${input.village}, ${input.district}, ${input.city}, Indonesia`
  let location
  if (Number.isFinite(input.latitude) && Number.isFinite(input.longitude)) {
    location = {
      latitude: input.latitude,
      longitude: input.longitude,
      displayName: `${input.village}, ${input.district}, ${input.city}`,
      provider: 'Titik pilihan OpenStreetMap',
      mapsUrl: `https://www.openstreetmap.org/?mlat=${input.latitude}&mlon=${input.longitude}#map=17/${input.latitude}/${input.longitude}`,
    }
  } else if (input.mapsUrl) {
    const pin = await resolveGoogleMapsLink(input.mapsUrl)
    location = { ...pin, displayName: `${input.village}, ${input.district}, ${input.city}` }
  } else {
    location = await geocodeLocation(locationQuery)
  }
  let competitors = []
  let suppliers = []
  let provider
  let mode = 'google_places_live'
  const googlePlacesConfigured = Boolean(process.env.GOOGLE_MAPS_API_KEY)

  if (googlePlacesConfigured) {
    const [places, supplierPlaces] = await Promise.all([
      googleTextSearch(input.product, location, 20),
      googleTextSearch('toko bahan baku dan grosir', location, 10),
    ])
    competitors = places.filter((place) => place.googlePlaceId && place.businessStatus !== 'CLOSED_PERMANENTLY' && withinAnalysisRadius(location, place))
    suppliers = supplierPlaces.filter((place) => withinAnalysisRadius(location, place))
    provider = 'google_places'
  } else {
    provider = 'google_places_not_configured'
    mode = 'google_places_setup_required'
  }

  const opportunity = googlePlacesConfigured ? scoreMarket(competitors, provider) : {
    score: 0,
    label: 'Google Places belum terhubung',
    confidence: 'Rendah',
    metrics: [
      { label: 'Sinyal permintaan', value: 0, note: 'Menunggu data Google Places' },
      { label: 'Ruang bersaing', value: 0, note: 'Belum dapat dinilai' },
      { label: 'Peluang pembeda', value: 0, note: 'Belum dapat dinilai' },
      { label: 'Kecocokan lokasi', value: 0, note: 'Belum dapat dinilai' },
    ],
  }
  const generatedAt = new Date().toISOString()
  const sources = [
    { name: location.provider, url: location.mapsUrl || (location.provider.includes('Google') ? 'https://developers.google.com/maps/documentation/places/web-service/text-search' : 'https://www.openstreetmap.org/copyright'), kind: 'Lokasi live' },
    { name: googlePlacesConfigured ? 'Google Places' : 'Google Maps listing terverifikasi', url: 'https://developers.google.com/maps/documentation/places/web-service/text-search', kind: 'Usaha sekitar' },
  ]

  return {
    query: input,
    location: { ...location, role: 'selling_location', radiusMeters: RADIUS_METERS },
    competitors,
    suppliers,
    opportunity,
    priceRange: null,
    verdict: googlePlacesConfigured ? {
      headline: competitors.length >= 5 ? `Pasarnya terlihat aktif, tetapi ${input.product.toLowerCase()} generik akan sulit menonjol.` : `Ada ruang untuk menguji ${input.product.toLowerCase()} dalam skala kecil.`,
      summary: `${competitors.length} usaha dengan Google Place ID ditemukan dalam radius sekitar 3 km.`,
      recommendation: opportunity.score >= 60 ? 'Lanjutkan' : 'Validasi dulu',
      recommendationNote: competitors.length >= 5 ? 'Dengan konsep yang berbeda' : 'Mulai dengan batch uji pasar',
    } : {
      headline: 'Hubungkan Google Places untuk analisis kompetitor yang akurat.',
      summary: `${competitors.length} listing demo terverifikasi tersedia. Skor pasar belum dihitung agar lokasi tanpa Place ID tidak dianggap sebagai kompetitor yang valid.`,
      recommendation: 'Hubungkan data',
      recommendationNote: 'Google Places API diperlukan',
    },
    insights: googlePlacesConfigured ? (() => {
      const c = competitors.length
      const avg = opportunity.avgRating
      const high = opportunity.highRatedCount || 0
      const prod = input.product.toLowerCase()
      let opp, risk
      if (c === 0) {
        opp = `Belum ada ${prod} di radar 3 km — kamu bisa jadi yang pertama.`
        risk = 'Tanpa kompetitor, permintaan lokal perlu dibuktikan sendiri.'
      } else if (avg != null && avg < 4.0) {
        opp = `Rating pesaing rendah (${avg.toFixed(1)}★) — kualitas konsisten sudah cukup untuk menang.`
        risk = 'Pasar sudah ada, tetapi belum ada pemain yang benar-benar solid.'
      } else if (avg != null && avg >= 4.6 && high >= 3) {
        opp = `${high} pesaing berrating tinggi — butuh konsep yang sangat berbeda, bukan sekadar lebih murah.`
        risk = `Pesaing ${prod} di sini sudah dipercaya pelanggan (${avg.toFixed(1)}★ rata-rata).`
      } else if (c >= 10) {
        opp = `Pasar ${prod} sudah ramai — peluang ada di ceruk yang belum dilayani.`
        risk = 'Kompetitor banyak; tanpa pembeda yang jelas, sulit dapat perhatian pertama.'
      } else {
        opp = `Ada ${c} pesaing aktif — pasar sudah terbukti, masih ada ruang untuk pemain baru.`
        risk = 'Perlu bukti rasa dan ulasan awal sebelum dipercaya pelanggan baru.'
      }
      return { opportunity: opp, risk, price: null }
    })() : {
      opportunity: 'Hubungkan Google Places untuk menemukan ruang pasar.',
      risk: 'Keputusan belum boleh dibuat dari data kompetitor yang belum lengkap.',
      price: null,
    },
    metadata: {
      mode,
      provider,
      googlePlacesConfigured,
      setupRequired: !googlePlacesConfigured,
      generatedAt,
      radiusKm: 3,
      cachedForHours: 24,
      attribution: googlePlacesConfigured ? 'Google Places' : 'Google Places belum terhubung',
    },
    sources,
  }
}
