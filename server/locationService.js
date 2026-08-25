const WILAYAH_API = 'https://wilayah.id/api'
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000
const cache = new Map()
let regenciesPromise

function normalize(value = '') {
  return String(value).toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function titleCase(value = '') {
  return String(value).toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function cleanCityName(value = '') {
  return titleCase(String(value).replace(/^(KABUPATEN|KOTA ADMINISTRASI|KOTA)\s+/i, ''))
}

async function fetchData(path, timeoutMs = 15000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${WILAYAH_API}/${path}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'MulaiUsaha/0.1' },
    })
    if (!response.ok) throw new Error(`Wilayah API ${response.status}`)
    const payload = await response.json()
    return payload.data || []
  } finally {
    clearTimeout(timeout)
  }
}

async function cached(path) {
  const hit = cache.get(path)
  if (hit && Date.now() - hit.time < CACHE_TTL) return hit.data
  const data = await fetchData(path)
  cache.set(path, { data, time: Date.now() })
  return data
}

async function allRegencies() {
  if (regenciesPromise) return regenciesPromise
  regenciesPromise = (async () => {
    const provinces = await cached('provinces.json')
    const chunks = []
    for (let index = 0; index < provinces.length; index += 8) {
      const batch = provinces.slice(index, index + 8)
      chunks.push(...(await Promise.all(batch.map(async (province) => {
        const items = await cached(`regencies/${province.code}.json`)
        return items.map((item) => ({ ...item, provinceName: province.name }))
      }))))
    }
    return chunks.flat()
  })().catch((error) => {
    regenciesPromise = null
    throw error
  })
  return regenciesPromise
}

function bestCity(regencies, city) {
  const wanted = normalize(city)
  return regencies.find((item) => normalize(cleanCityName(item.name)) === wanted)
    || regencies.find((item) => normalize(item.name).includes(wanted))
}

function matches(items, query, name = (item) => item.name) {
  const wanted = normalize(query)
  return items
    .filter((item) => normalize(name(item)).includes(wanted))
    .sort((a, b) => {
      const aName = normalize(name(a))
      const bName = normalize(name(b))
      return Number(bName.startsWith(wanted)) - Number(aName.startsWith(wanted)) || aName.localeCompare(bName)
    })
    .slice(0, 8)
}

export async function suggestLocations({ field, query, city, district }) {
  if (!['city', 'district', 'village'].includes(field) || normalize(query).length < 2) return []
  const regencies = await allRegencies()

  if (field === 'city') {
    return matches(regencies, query, (item) => `${item.name} ${item.provinceName}`).map((item) => ({
      code: item.code,
      value: cleanCityName(item.name),
      label: `${titleCase(item.name)} — ${titleCase(item.provinceName)}`,
      city: cleanCityName(item.name),
    }))
  }

  const selectedCity = bestCity(regencies, city)
  if (!selectedCity) return []
  const districts = await cached(`districts/${selectedCity.code}.json`)

  if (field === 'district') {
    return matches(districts, query).map((item) => ({
      code: item.code,
      value: titleCase(item.name),
      label: `${titleCase(item.name)} — ${cleanCityName(selectedCity.name)}`,
      district: titleCase(item.name),
      city: cleanCityName(selectedCity.name),
    }))
  }

  const wantedDistrict = normalize(district)
  const selectedDistrict = districts.find((item) => normalize(item.name) === wantedDistrict)
    || districts.find((item) => normalize(item.name).includes(wantedDistrict))
  if (!selectedDistrict) return []
  const villages = await cached(`villages/${selectedDistrict.code}.json`)
  return matches(villages, query).map((item) => ({
    code: item.code,
    value: titleCase(item.name),
    label: `${titleCase(item.name)} — ${titleCase(selectedDistrict.name)}, ${cleanCityName(selectedCity.name)}`,
    village: titleCase(item.name),
    district: titleCase(selectedDistrict.name),
    city: cleanCityName(selectedCity.name),
  }))
}

function googleHost(hostname) {
  return /(^|\.)google\.(com|co\.id)$/.test(hostname) || hostname === 'maps.app.goo.gl' || hostname === 'goo.gl'
}

function coordinatesFromUrl(rawUrl) {
  const decoded = decodeURIComponent(rawUrl)
  const patterns = [
    /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/,
    /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/,
    /(?:q|query|ll)=(-?\d{1,2}\.\d+)%?2C(-?\d{1,3}\.\d+)/i,
    /(?:q|query|ll)=(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/i,
  ]
  for (const pattern of patterns) {
    const match = decoded.match(pattern)
    if (!match) continue
    const latitude = Number(match[1])
    const longitude = Number(match[2])
    if (latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
      return { latitude, longitude }
    }
  }
  return null
}

export async function resolveGoogleMapsLink(rawUrl) {
  let url
  try {
    url = new URL(String(rawUrl || '').trim())
  } catch {
    const error = new Error('Invalid Google Maps URL')
    error.status = 400
    error.publicMessage = 'Link Google Maps belum valid.'
    throw error
  }
  if (!['http:', 'https:'].includes(url.protocol) || !googleHost(url.hostname)) {
    const error = new Error('Unsupported map host')
    error.status = 400
    error.publicMessage = 'Gunakan link yang dibagikan langsung dari Google Maps.'
    throw error
  }

  let finalUrl = url.toString()
  let point = coordinatesFromUrl(finalUrl)
  if (!point && ['maps.app.goo.gl', 'goo.gl'].includes(url.hostname)) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12000)
    try {
      const response = await fetch(finalUrl, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'User-Agent': 'MulaiUsaha/0.1' },
      })
      finalUrl = response.url
      point = coordinatesFromUrl(finalUrl)
    } finally {
      clearTimeout(timeout)
    }
  }

  if (!point) {
    const error = new Error('Coordinates not found')
    error.status = 422
    error.publicMessage = 'Koordinat belum terbaca. Bagikan pin lokasi dari Google Maps, lalu tempel linknya di sini.'
    throw error
  }

  return { ...point, mapsUrl: url.toString(), resolvedUrl: finalUrl, provider: 'Google Maps pin' }
}

export async function reverseGeocode(lat, lng) {
  // Google Geocoding is a separate API from Places and may not be enabled on the
  // project, so fall back to OpenStreetMap rather than leaving the user with no area.
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (apiKey) {
    try {
      return await googleReverseGeocode(lat, lng, apiKey)
    } catch (error) {
      console.warn('[reverse-geocode] Google unavailable, using OpenStreetMap:', error.message)
    }
  }
  return nominatimReverseGeocode(lat, lng)
}

async function googleReverseGeocode(lat, lng, apiKey) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=id&key=${apiKey}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  let res
  try {
    res = await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
  if (!res.ok) throw new Error(`Geocoding API ${res.status}`)
  const data = await res.json()
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(data.error_message || `Geocoding: ${data.status}`)
  }
  const components = data.results?.[0]?.address_components || []
  const get = (type) => components.find((c) => c.types.includes(type))?.long_name || ''
  return {
    city: stripPrefix(get('administrative_area_level_2'), /^(Kabupaten|Kota Administrasi|Kota)\s+/i),
    district: stripPrefix(get('administrative_area_level_3'), /^Kecamatan\s+/i),
    village: stripPrefix(get('administrative_area_level_4'), /^(Kelurahan|Desa)\s+/i),
  }
}

async function nominatimReverseGeocode(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=16&addressdetails=1&accept-language=id`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  let res
  try {
    res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': `MulaiUsaha/0.1 (${process.env.APP_CONTACT_URL || 'http://localhost:5173'})`, Accept: 'application/json' },
    })
  } finally {
    clearTimeout(timeout)
  }
  if (!res.ok) throw new Error(`Nominatim ${res.status}`)
  const address = (await res.json())?.address || {}
  return {
    city: stripPrefix(address.city || address.town || address.county || address.state || '', /^(Kabupaten|Kota Administrasi|Kota)\s+/i),
    district: stripPrefix(address.city_district || address.municipality || address.suburb || '', /^Kecamatan\s+/i),
    village: stripPrefix(address.village || address.neighbourhood || address.quarter || address.hamlet || '', /^(Kelurahan|Desa)\s+/i),
  }
}

function stripPrefix(value, pattern) {
  return String(value || '').replace(pattern, '').trim()
}
