import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Landing from './Landing.jsx'
import { AuthDialog, ProjectsDialog, SaveDialog } from './Account.jsx'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  Compass,
  ExternalLink,
  FileText,
  Globe2,
  Info,
  Lightbulb,
  FolderOpen,
  LocateFixed,
  LogIn,
  LogOut,
  Mail,
  Map as MapIcon,
  MapPin,
  Maximize2,
  MessageCircle,
  Move,
  Navigation,
  PackageCheck,
  Pencil,
  Phone,
  RefreshCw,
  Search,
  ShoppingBasket,
  Sparkles,
  Star,
  Store,
  Target,
  TrendingUp,
  Users,
  WalletCards,
  X,
} from 'lucide-react'

const stages = [
  { label: 'Ide usaha', short: 'Ide' },
  { label: 'Potensi pasar', short: 'Pasar' },
  { label: 'Pilih konsep', short: 'Konsep' },
  { label: 'Rencana usaha', short: 'Rencana' },
]

const placeReviewCache = new Map()

const rupiah = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
})

function Logo() {
  return (
    <div className="brand" aria-label="MulaiUsaha">
      <span className="brand-mark"><TrendingUp size={19} strokeWidth={2.8} /></span>
      <span>Mulai<span>Usaha</span></span>
    </div>
  )
}

function Progress({ step, maxStep, onGo }) {
  return (
    <div className="progress-wrap" aria-label="Tahapan pembuatan rencana usaha">
      {stages.map((stage, index) => {
        const isActive = index === step
        const isReachable = index <= maxStep
        const isDone = isReachable && !isActive
        return (
          <div className="progress-item" key={stage.label}>
            <button
              className={`progress-dot ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}`}
              onClick={() => !isActive && isReachable && onGo(index)}
              disabled={!isReachable}
              aria-label={stage.label}
            >
              {isDone ? <Check size={15} /> : index + 1}
            </button>
            <span className={isReachable ? 'current' : ''}>
              <span className="progress-full">{stage.label}</span>
              <span className="progress-short">{stage.short}</span>
            </span>
            {index < stages.length - 1 && <div className={`progress-line ${index < maxStep ? 'done' : ''}`} />}
          </div>
        )
      })}
    </div>
  )
}

const REVEAL_SELECTOR = '.panel, .launch-panel'

// Panels that start below the fold fade in as they are scrolled to. Mirrors the
// landing page's observer and keeps its guarantee — no support, reduced motion, or
// an observer that never reports all end with the content shown. It goes further:
// the hiding class is only ever added here, so if this effect does not run at all
// the page is simply static rather than blank.
function useStepReveal(step) {
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || typeof MutationObserver === 'undefined') return undefined
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    const main = document.querySelector('main')
    if (!main) return undefined

    const tracked = []
    const considered = new WeakSet()
    let observerReported = false
    let observerDead = false

    const observer = new IntersectionObserver(
      (entries) => {
        observerReported = true
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          entry.target.classList.add('is-in')
          observer.unobserve(entry.target)
        })
      },
      // The trigger line sits a quarter of the way up the viewport, and a sliver of
      // the panel is not enough to cross it. Firing at the very bottom edge — which
      // is what a 0 threshold with a small margin does — meant the 0.7s transition
      // had always finished by the time the panel reached reading position, so it
      // looked like nothing had animated at all.
      { rootMargin: '0px 0px -25% 0px', threshold: 0.08 },
    )

    const consider = (el) => {
      if (considered.has(el)) return
      considered.add(el)
      if (observerDead) return
      // Anything already on screen should simply be there. Only what is genuinely
      // below the fold is worth hiding and animating in.
      if (el.getBoundingClientRect().top <= window.innerHeight + 40) return
      el.classList.add('app-reveal')
      tracked.push(el)
      observer.observe(el)
    }

    main.querySelectorAll(REVEAL_SELECTOR).forEach(consider)

    // Steps 2 and 4 build most of their panels only once their fetches resolve. A
    // one-shot query at mount would miss every one of them.
    const mutations = new MutationObserver((records) => {
      records.forEach((record) => {
        record.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return
          if (node.matches?.(REVEAL_SELECTOR)) consider(node)
          node.querySelectorAll?.(REVEAL_SELECTOR).forEach(consider)
        })
      })
    })
    mutations.observe(main, { childList: true, subtree: true })

    // If the observer never reports, drop the hidden state entirely rather than
    // transitioning everything in at once — a page that was never animated should
    // look like a page that was never animated.
    const failsafe = window.setTimeout(() => {
      if (observerReported) return
      observerDead = true
      tracked.forEach((el) => el.classList.remove('app-reveal'))
    }, 900)

    return () => {
      window.clearTimeout(failsafe)
      observer.disconnect()
      mutations.disconnect()
      tracked.forEach((el) => el.classList.remove('app-reveal', 'is-in'))
    }
  }, [step])
}

function Shell({ step, maxStep, setStep, user, canSave, onLogout, onLogin, onSave, onProjects, children }) {
  useStepReveal(step)
  return (
    <div className="app-shell">
      <header className="topbar">
        <Logo />
        <nav>
          <button className="ghost-button" onClick={() => setStep(0)}>Mulai baru</button>
          {/* Saving only makes sense once there is an analysed idea to save. */}
          {canSave && step > 0 && (
            <button className="topbar-action" onClick={onSave}><FolderOpen size={14} /> Simpan projek</button>
          )}
          {user
            ? <button className="ghost-button" onClick={onProjects}>Projek saya</button>
            : canSave && <button className="topbar-action" onClick={onLogin}><LogIn size={14} /> Masuk</button>}
          {user && (
            <div className="account-chip">
              {user.picture
                ? <img src={user.picture} alt="" referrerPolicy="no-referrer" />
                : <i>{(user.name || user.email || '?')[0].toUpperCase()}</i>}
              <span>
                <b>{user.name || user.email}</b>
                <small>{user.email}</small>
              </span>
              <button type="button" onClick={onLogout} aria-label="Keluar dari akun"><LogOut size={15} /></button>
            </div>
          )}
        </nav>
      </header>
      <Progress step={step} maxStep={maxStep} onGo={setStep} />
      {/* Keyed on the step so moving between steps remounts it and replays the
          entrance animation, which a plain re-render would not do. */}
      <main key={step} className="step-enter">{children}</main>
      <footer>
        <Logo />
        <p>Keputusan lebih yakin, langkah usaha lebih nyata.</p>
        <span>Prototype Building Indonesia 2026</span>
      </footer>
    </div>
  )
}

const DEFAULT_MAP_POINT = { latitude: -5.3971, longitude: 105.2668 }

function LocationPicker({ form, setForm }) {
  const mapElementRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const [draftPoint, setDraftPoint] = useState({
    latitude: form.latitude ?? DEFAULT_MAP_POINT.latitude,
    longitude: form.longitude ?? DEFAULT_MAP_POINT.longitude,
  })
  const [locationStatus, setLocationStatus] = useState({ type: 'loading', message: 'Mencari lokasi perangkat sebagai titik awal peta…' })
  const [detectedLocation, setDetectedLocation] = useState(null)

  const movePin = (point, zoom = 16, message = '') => {
    const latitude = Number(point.latitude)
    const longitude = Number(point.longitude)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return
    const next = { latitude, longitude }
    setDraftPoint(next)
    markerRef.current?.setLatLng([latitude, longitude])
    mapRef.current?.setView([latitude, longitude], zoom, { animate: true })
    setForm((current) => ({ ...current, latitude: null, longitude: null }))
    if (message) setLocationStatus({ type: 'ready', message })
  }

  const locateUser = () => {
    if (!navigator.geolocation) {
      setLocationStatus({ type: 'error', message: 'Perangkat ini tidak menyediakan lokasi. Geser pin secara manual.' })
      return
    }
    setLocationStatus({ type: 'loading', message: 'Mencari lokasi perangkat sebagai titik awal peta…' })
    navigator.geolocation.getCurrentPosition(
      (position) => movePin({ latitude: position.coords.latitude, longitude: position.coords.longitude }, 17, 'Lokasi perangkat ditemukan sebagai titik awal. Geser pin ke lokasi jualan, lalu tekan “Pilih lokasi”.'),
      () => setLocationStatus({ type: 'ready', message: 'Izin lokasi tidak diberikan. Pilih titik secara manual di peta.' }),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return undefined
    const initial = [draftPoint.latitude, draftPoint.longitude]
    const map = L.map(mapElementRef.current, { zoomControl: true }).setView(initial, 14)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)
    const markerIcon = L.divIcon({
      className: 'usaha-marker-shell',
      html: '<span class="usaha-marker"><span></span></span>',
      iconSize: [38, 46],
      iconAnchor: [19, 43],
    })
    const marker = L.marker(initial, { draggable: true, icon: markerIcon, title: 'Geser untuk memilih lokasi usaha' }).addTo(map)
    mapRef.current = map
    markerRef.current = marker
    marker.on('dragend', () => {
      const point = marker.getLatLng()
      movePin({ latitude: point.lat, longitude: point.lng }, map.getZoom(), 'Pin dipindahkan. Tekan “Pilih lokasi” untuk menyimpannya.')
    })
    map.on('click', (event) => movePin({ latitude: event.latlng.lat, longitude: event.latlng.lng }, map.getZoom(), 'Titik baru ditandai. Tekan “Pilih lokasi” untuk menyimpannya.'))
    const invalidateTimer = window.setTimeout(() => map.invalidateSize(), 50)
    locateUser()
    return () => {
      window.clearTimeout(invalidateTimer)
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
  }, [])

  // Follow the pin back when the form's coordinates are changed from outside —
  // e.g. cancelling the reset dialog restores the previously analysed location.
  // Only runs on confirmed coordinates: while the user is dragging the pin the
  // form is deliberately blanked, so this cannot fight them mid-drag.
  useEffect(() => {
    const { latitude, longitude } = form
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return
    if (latitude === draftPoint.latitude && longitude === draftPoint.longitude) return
    setDraftPoint({ latitude, longitude })
    markerRef.current?.setLatLng([latitude, longitude])
    mapRef.current?.setView([latitude, longitude], mapRef.current.getZoom(), { animate: true })
  }, [form.latitude, form.longitude])

  const confirmPoint = async () => {
    setLocationStatus({ type: 'loading', message: 'Mendeteksi wilayah dari koordinat peta…' })
    let city = '', district = '', village = ''
    try {
      const response = await fetch(`/api/locations/reverse-geocode?lat=${draftPoint.latitude}&lng=${draftPoint.longitude}`)
      const result = await response.json()
      if (response.ok && result.location) {
        city = result.location.city || ''
        district = result.location.district || ''
        village = result.location.village || ''
        setDetectedLocation({ city, district, village })
      }
    } catch {
      // If reverse geocode fails, still allow confirm with empty location
    }
    setForm((current) => ({ ...current, latitude: draftPoint.latitude, longitude: draftPoint.longitude, city, district, village }))
    setLocationStatus({ type: 'success', message: 'Lokasi usaha sudah dipilih dan akan menjadi pusat analisis pasar.' })
  }

  const isConfirmed = form.latitude != null && form.longitude != null

  return (
    <section className="location-picker" aria-label="Pilih titik lokasi usaha">
      <div className="location-picker-heading">
        <div><small>LOKASI PRESISI</small><h3>Pilih titik usaha di peta</h3></div>
        <button type="button" onClick={locateUser}><LocateFixed size={15} /> Lokasi saya</button>
      </div>
      <div className="embedded-map" ref={mapElementRef} />
      <div className={`map-picker-status ${locationStatus.type}`}>
        {locationStatus.type === 'loading' ? <RefreshCw className="spin" size={15} /> : locationStatus.type === 'success' ? <CheckCircle2 size={15} /> : <Move size={15} />}
        <span>{locationStatus.message}</span>
      </div>
      <div className="map-picker-footer">
        <span>{draftPoint.latitude.toFixed(5)}, {draftPoint.longitude.toFixed(5)}</span>
        <button className={`select-location-button ${isConfirmed ? 'confirmed' : ''}`} type="button" onClick={confirmPoint}>
          {isConfirmed ? <><Check size={16} /> Lokasi dipilih</> : <><MapPin size={16} /> Pilih lokasi</>}
        </button>
      </div>
      {isConfirmed && detectedLocation && (detectedLocation.city || detectedLocation.district) && (
        <div className="detected-location-strip">
          <MapPin size={14} />
          <span>
            {[detectedLocation.village, detectedLocation.district, detectedLocation.city].filter(Boolean).join(', ')}
          </span>
        </div>
      )}
    </section>
  )
}

function Intro({ form, setForm, onAnalyze, isAnalyzing, error }) {
  const submit = (event) => {
    event.preventDefault()
    onAnalyze()
  }

  return (
    <section className="intro-page">
      <div className="hero-copy">
        <div className="eyebrow"><Sparkles size={15} /> Asisten usaha untuk semua</div>
        <h1>Ide bagus dimulai dari <em>peluang yang nyata.</em></h1>
        <p className="hero-lead">Cek kondisi pasar di sekitarmu lebih dulu. Kalau potensial, kami bantu susun kebutuhan hingga modalnya.</p>
        <div className="trust-row">
          <div><span><Search size={17} /></span><p><b>Cek pasar lokal</b><small>Lihat permintaan & pesaing</small></p></div>
          <div><span><Lightbulb size={17} /></span><p><b>Temukan pembeda</b><small>Dapatkan rekomendasi konsep</small></p></div>
          <div><span><WalletCards size={17} /></span><p><b>Hitung dari nol</b><small>Bahan, modal, dan harga jual</small></p></div>
        </div>
      </div>

      <form className="idea-card" onSubmit={submit}>
        <div className="card-heading">
          <span className="icon-box"><Compass size={20} /></span>
          <div><small>LANGKAH PERTAMA</small><h2>Ceritakan ide usahamu</h2></div>
        </div>
        <label>
          Mau jualan apa?
          <div className="input-wrap"><ShoppingBasket size={18} /><input value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })} placeholder="Contoh: donat, risol mayo, gorengan" required /></div>
        </label>
        <LocationPicker form={form} setForm={setForm} />
        <div className="info-strip"><Info size={16} /><span>Kamu belum perlu menentukan modal. Kami hitung setelah kebutuhan usahanya jelas.</span></div>
        {error && <div className="error-strip"><Info size={16} /><span>{error}</span></div>}
        <button className="primary-button large" type="submit" disabled={isAnalyzing}>
          {isAnalyzing ? <><RefreshCw className="spin" size={18} /> Menganalisis pasar…</> : <>Cek potensi pasar <ArrowRight size={18} /></>}
        </button>
        <p className="data-note"><BadgeCheck size={14} /> Lokasi hanya digunakan untuk analisis pasar.</p>
      </form>
    </section>
  )
}

function ScoreRing({ score }) {
  return (
    <div className="score-ring" style={{ '--score': score }}>
      <div><strong>{score}</strong><span>/100</span></div>
    </div>
  )
}

function distanceFrom(center, place) {
  if (![center?.latitude, center?.longitude, place?.latitude, place?.longitude].every(Number.isFinite)) return null
  const radians = (value) => value * Math.PI / 180
  const latitudeDistance = radians(place.latitude - center.latitude)
  const longitudeDistance = radians(place.longitude - center.longitude)
  const a = Math.sin(latitudeDistance / 2) ** 2
    + Math.cos(radians(center.latitude)) * Math.cos(radians(place.latitude)) * Math.sin(longitudeDistance / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function googleMapsDestination(place) {
  if (place?.googlePlaceId) {
    const query = place.googleMapsQuery || [place.name, place.address].filter(Boolean).join(', ')
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}&query_place_id=${encodeURIComponent(place.googlePlaceId)}`
  }
  if (place?.googleMapsUrl) return place.googleMapsUrl
  if (place?.url?.includes('google.com/maps')) return place.url
  return null
}

function CompetitorMapCanvas({ center, places, onSelect, focusRequest = null, expanded = false }) {
  const elementRef = useRef(null)
  const mapRef = useRef(null)
  const selectRef = useRef(onSelect)
  selectRef.current = onSelect
  const markersRef = useRef([])
  const [tilesReady, setTilesReady] = useState(false)

  // Highlight selected marker and fly to it — runs WITHOUT rebuilding the map
  useEffect(() => {
    if (!mapRef.current) return
    const focusedPlace = focusRequest?.place
    // Compare only on fields both sides actually have — SerpApi stores carry
    // `placeId`/name but no `id`, so a bare `a.id === b.id` matches every marker.
    const samePlace = (a, b) => {
      if (!a || !b) return false
      if (a.id != null && b.id != null) return a.id === b.id
      if (a.placeId != null && b.placeId != null) return a.placeId === b.placeId
      return Boolean(a.name && b.name && a.name === b.name)
    }
    markersRef.current.forEach(({ place, leafletMarker }) => {
      const el = leafletMarker.getElement()?.querySelector('.radar-place-marker')
      el?.classList.toggle('selected', samePlace(place, focusedPlace))
    })
    if (focusedPlace && Number.isFinite(focusedPlace.latitude) && Number.isFinite(focusedPlace.longitude)) {
      mapRef.current.flyTo([focusedPlace.latitude, focusedPlace.longitude], expanded ? 17 : 16, { duration: 0.55 })
    }
  }, [focusRequest?.requestId])

  useEffect(() => {
    if (!elementRef.current || !Number.isFinite(center?.latitude) || !Number.isFinite(center?.longitude)) return undefined
    const map = L.map(elementRef.current, { zoomControl: true }).setView([center.latitude, center.longitude], expanded ? 14 : 13)
    mapRef.current = map
    setTilesReady(false)
    const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)
    // The tile pane is held transparent until the first batch paints, so the
    // container fades in instead of flashing its placeholder colour. The timer is
    // the failsafe: if the tile server is blocked or offline, `load` never fires
    // and the map would otherwise stay invisible.
    tiles.on('load', () => setTilesReady(true))
    const tileFailsafe = window.setTimeout(() => setTilesReady(true), 2600)
    L.circle([center.latitude, center.longitude], { radius: 3000, color: '#ef5b2a', weight: 1, fillColor: '#ef5b2a', fillOpacity: .06, dashArray: '5 5' }).addTo(map)
    const userIcon = L.divIcon({ className: 'radar-user-marker-shell', html: '<span class="radar-user-marker"></span>', iconSize: [32, 32], iconAnchor: [16, 16] })
    L.marker([center.latitude, center.longitude], { icon: userIcon, title: 'Titik lokasi jualan', keyboard: true }).addTo(map)
    const markers = []
    markersRef.current = []
    places.filter((place) => Number.isFinite(place.latitude) && Number.isFinite(place.longitude)).forEach((place, index) => {
      const letter = (place.name || '?').trim().charAt(0).toUpperCase()
      // Pins drop in one after another. Capped so a dense area does not make the
      // last pin land a second and a half after the first.
      const dropDelay = Math.min(index, 11) * 45
      const icon = L.divIcon({
        className: 'radar-place-marker-shell',
        html: `<span class="radar-place-marker${place.locationAccuracy === 'approximate' ? ' approximate' : ''}" style="--md:${dropDelay}ms">${letter.replace(/[^A-Z0-9]/g, '?')}</span>`,
        iconSize: [34, 40],
        iconAnchor: [17, 37],
      })
      const marker = L.marker([place.latitude, place.longitude], { icon, title: `Lihat detail ${place.name}`, keyboard: true }).addTo(map)
      let lastFocusAt = 0
      const focusPlace = () => {
        const now = window.performance.now()
        if (now - lastFocusAt < 80) return
        lastFocusAt = now
        map.flyTo([place.latitude, place.longitude], expanded ? 17 : 16, { duration: .55 })
        selectRef.current(place)
      }
      marker.on('click', focusPlace)
      markers.push(marker)
      markersRef.current.push({ place, leafletMarker: marker })
    })
    if (expanded && markers.length) {
      const group = L.featureGroup(markers)
      map.fitBounds(group.getBounds().pad(.28), { maxZoom: 16 })
    }
    const invalidateTimer = window.setTimeout(() => map.invalidateSize(), 80)
    return () => {
      window.clearTimeout(invalidateTimer)
      window.clearTimeout(tileFailsafe)
      markersRef.current = []
      mapRef.current = null
      map.remove()
    }
  }, [center?.latitude, center?.longitude, places, expanded])

  return <div className={`competitor-map-canvas ${expanded ? 'expanded' : ''} ${tilesReady ? 'tiles-ready' : ''}`} ref={elementRef} aria-label="Peta interaktif usaha terkait" />
}

function PlaceDetailCard({ place, center, onClose, full = false }) {
  const [details, setDetails] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!place?.id) return undefined
    const controller = new AbortController()
    setLoading(true)
    fetch(`/api/places/details?id=${encodeURIComponent(place.id)}`, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error)
        setDetails(result.details)
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setDetails({ available: false, source: place.provider || 'Data ringkas' })
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [place?.id])

  if (!place) return null
  const approximate = place.locationAccuracy === 'approximate'
  const hasVerifiedGoogleListing = Boolean(place.googlePlaceId || place.googleMapsUrl || place?.url?.includes('google.com/maps'))
  const googleMapsUrl = googleMapsDestination(place)
  const distance = approximate ? null : distanceFrom(center, place)
  const ratingText = place.rating
    ? `${String(place.rating).replace('.', ',')} / 5${place.reviewCount ? ` · ${place.reviewCount.toLocaleString('id-ID')} ulasan` : ' · jumlah ulasan belum tersedia'}`
    : 'Belum tersedia dari sumber ini'

  return (
    <aside className={`place-detail-card ${full ? 'full' : 'compact'}`} aria-label={`Detail ${place.name}`}>
      <div className="place-detail-heading">
        <span className="place-detail-avatar">{place.name?.[0] || '?'}</span>
        <div><small>{place.type || 'Usaha lokal'}</small><h3>{place.name}</h3></div>
        <button type="button" onClick={onClose} aria-label="Tutup detail"><X size={17} /></button>
      </div>
      <p className="place-address"><MapPin size={15} /> <span>{place.address || 'Alamat belum tersedia'}{approximate ? <b className="approximate-location">Lokasi perkiraan - cocokkan di Google Maps</b> : distance != null && <b>{distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1).replace('.', ',')} km`} dari lokasi jualan</b>}</span></p>
      <div className="place-detail-grid">
        <div><CalendarClock size={15} /><span><small>Jam buka</small><b>{loading ? 'Memuat…' : details?.openingHours || 'Belum tersedia'}</b></span></div>
        <div><Phone size={15} /><span><small>Kontak</small><b>{loading ? 'Memuat…' : details?.phone || 'Belum tersedia'}</b></span></div>
        <div><Star size={15} /><span><small>Rating & review</small><b>{ratingText}</b></span></div>
        <div><Globe2 size={15} /><span><small>Website</small>{details?.website ? <a href={details.website} target="_blank" rel="noreferrer">Kunjungi website</a> : <b>{loading ? 'Memuat…' : 'Belum tersedia'}</b>}</span></div>
        {full && <div><Mail size={15} /><span><small>Email</small><b>{loading ? 'Memuat…' : details?.email || 'Belum tersedia'}</b></span></div>}
        {full && <div><Info size={15} /><span><small>Layanan</small><b>{[details?.delivery === 'yes' && 'Pesan antar', details?.takeaway === 'yes' && 'Bawa pulang', details?.wheelchair === 'yes' && 'Akses kursi roda'].filter(Boolean).join(' · ') || 'Belum tersedia'}</b></span></div>}
      </div>
      <div className="place-detail-actions">
        <span>Sumber: {details?.source || place.provider || 'Data publik'}{approximate ? ' - lokasi perkiraan' : ''}</span>
        {hasVerifiedGoogleListing && googleMapsUrl
          ? <a href={googleMapsUrl} target="_blank" rel="noreferrer"><Navigation size={15} /> Buka listing Google Maps</a>
          : <span className="maps-listing-unavailable"><Info size={14} /> Listing Google belum terverifikasi</span>}
      </div>
    </aside>
  )
}

function MarketMap({ data, focusRequest }) {
  const center = data?.location
  const places = data?.competitors || []
  const [selectedPlace, setSelectedPlace] = useState(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (focusRequest?.place) setSelectedPlace(focusRequest.place)
  }, [focusRequest?.requestId])

  useEffect(() => {
    if (!expanded) return undefined
    const close = (event) => event.key === 'Escape' && setExpanded(false)
    document.body.classList.add('map-modal-open')
    window.addEventListener('keydown', close)
    return () => {
      document.body.classList.remove('map-modal-open')
      window.removeEventListener('keydown', close)
    }
  }, [expanded])

  return (
    <>
      <div className="interactive-market-map">
        <button className="expand-map-button" type="button" onClick={() => setExpanded(true)}><Maximize2 size={15} /> Perbesar peta</button>
        <CompetitorMapCanvas center={center} places={places} onSelect={setSelectedPlace} focusRequest={focusRequest} />
        <div className="map-legend"><span className="legend-you" /> Lokasi jualan <span className="legend-them" /> Usaha terkait</div>
      </div>
      {selectedPlace && !expanded && <PlaceDetailCard place={selectedPlace} center={center} onClose={() => setSelectedPlace(null)} />}
      {expanded && <div className="map-modal-backdrop" role="dialog" aria-modal="true" aria-label="Peta besar usaha terkait">
        <div className="map-modal">
          <div className="map-modal-heading"><div><small>RADAR LOKAL · 3 KM</small><h2>Jelajahi usaha di sekitar lokasi jualan</h2></div><button type="button" onClick={() => setExpanded(false)} aria-label="Tutup peta besar"><X size={20} /></button></div>
          <div className="map-modal-body">
            <CompetitorMapCanvas center={center} places={places} onSelect={setSelectedPlace} focusRequest={focusRequest} expanded />
            <div className="map-detail-pane">
              {selectedPlace ? <PlaceDetailCard place={selectedPlace} center={center} onClose={() => setSelectedPlace(null)} full /> : <div className="map-empty-detail"><MapPin size={28} /><h3>Pilih pin usaha</h3><p>Klik pin berinisial pada peta untuk melihat informasi usahanya.</p></div>}
            </div>
          </div>
        </div>
      </div>}
    </>
  )
}

function CompetitorReviewBubble({ place }) {
  const placeId = place?.googlePlaceId || place?.id
  const [reviewState, setReviewState] = useState(() => placeReviewCache.get(placeId) || { loading: true, reviews: [] })
  const [reviewIndex, setReviewIndex] = useState(0)
  const [cycle, setCycle] = useState(0)

  useEffect(() => {
    const cached = placeReviewCache.get(placeId)
    if (cached) {
      setReviewState(cached)
      return undefined
    }
    if (!placeId) {
      setReviewState({ loading: false, reviews: [] })
      return undefined
    }

    const controller = new AbortController()
    setReviewState({ loading: true, reviews: [] })
    fetch(`/api/places/details?id=${encodeURIComponent(placeId)}&includeReviews=1`, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error)
        const nextState = { loading: false, reviews: result.details?.reviews || [] }
        placeReviewCache.set(placeId, nextState)
        setReviewState(nextState)
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setReviewState({ loading: false, reviews: [] })
      })
    return () => controller.abort()
  }, [placeId])

  useEffect(() => {
    setReviewIndex(0)
    setCycle(0)
  }, [placeId])

  if (reviewState.loading) {
    return <div className="competitor-review-bubble loading" role="status"><MessageCircle size={13} /><span>Memuat ulasan…</span></div>
  }

  if (!reviewState.reviews.length) {
    return <div className="competitor-review-bubble empty"><MessageCircle size={13} /><span>{place.reviewCount ? `${place.reviewCount.toLocaleString('id-ID')} penilaian tercatat, tetapi teks ulasannya belum dikirim Google Places.` : 'Belum ada ulasan tertulis yang tersedia.'}</span></div>
  }

  const review = reviewState.reviews[reviewIndex % reviewState.reviews.length]
  const reviewText = review.text.length > 230 ? `${review.text.slice(0, 227).trim()}…` : review.text
  const displayDuration = Math.min(8000, Math.max(3000, 2600 + review.text.length * 34))
  const showNextReview = () => {
    if (reviewState.reviews.length > 1) {
      setReviewIndex((current) => (current + 1 + Math.floor(Math.random() * (reviewState.reviews.length - 1))) % reviewState.reviews.length)
    }
    setCycle((current) => current + 1)
  }

  return (
    <div
      className="competitor-review-bubble animated"
      key={`${placeId}-${cycle}`}
      style={{ '--review-duration': `${displayDuration}ms` }}
      onAnimationEnd={showNextReview}
      role="status"
      aria-live="polite"
    >
      <div className="review-bubble-meta">
        <span><Star size={11} fill="currentColor" /> {review.rating ? String(review.rating).replace('.', ',') : 'Ulasan'}</span>
        <small>{review.relativeTime || 'Ulasan Google'}</small>
      </div>
      <blockquote>“{reviewText}”</blockquote>
      <div className="review-bubble-footer">
        <span className="review-author">
          {review.authorPhotoUrl ? <img src={review.authorPhotoUrl} alt="" referrerPolicy="no-referrer" /> : <i>{review.authorName?.[0] || 'G'}</i>}
          {review.authorUrl ? <a href={review.authorUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>{review.authorName}</a> : <b>{review.authorName}</b>}
        </span>
        {review.googleMapsUrl && <a href={review.googleMapsUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>Lihat di Google Maps</a>}
      </div>
    </div>
  )
}

function MarketAnalysis({ form, data, onNext, onBack }) {
  const [showAll, setShowAll] = useState(false)
  const [activeCompetitorId, setActiveCompetitorId] = useState(null)
  const [pinnedCompetitorId, setPinnedCompetitorId] = useState(null)
  const [suppressedHoverId, setSuppressedHoverId] = useState(null)
  const [mapFocusRequest, setMapFocusRequest] = useState(null)
  const competitorPanelRef = useRef(null)
  const liveCompetitors = data?.competitors || competitors
  const rankedCompetitors = useMemo(() => liveCompetitors
    .map((item, index) => ({ item, index, distance: distanceFrom(data?.location, item) }))
    .sort((left, right) => {
      const distanceDifference = (left.distance ?? Infinity) - (right.distance ?? Infinity)
      if (Number.isFinite(distanceDifference) && distanceDifference !== 0) return distanceDifference
      const ratingDifference = (right.item.rating || 0) - (left.item.rating || 0)
      if (ratingDifference !== 0) return ratingDifference
      const reviewDifference = (right.item.reviewCount || 0) - (left.item.reviewCount || 0)
      return reviewDifference || left.index - right.index
    })
    .map(({ item }) => item), [liveCompetitors, data?.location?.latitude, data?.location?.longitude])
  const mainCompetitors = rankedCompetitors.slice(0, 5)
  const otherCompetitors = rankedCompetitors.slice(5)
  const opportunity = data?.opportunity || null
  const metrics = opportunity?.metrics || []
  // Headline reflects how crowded the market actually is, based on the same total
  // shown in the "N usaha" pill — not just the five listed below it.
  const competitorCount = liveCompetitors.length
  const competitionLabel = competitorCount === 0 ? 'Belum ada pesaing langsung'
    : competitorCount <= 3 ? 'Persaingan masih longgar'
    : competitorCount <= 8 ? 'Persaingan sedang'
    : 'Persaingan cukup padat'

  useEffect(() => {
    const closeBubble = (event) => {
      if (!competitorPanelRef.current?.contains(event.target)) {
        setActiveCompetitorId(null)
        setPinnedCompetitorId(null)
        setSuppressedHoverId(null)
      }
    }
    document.addEventListener('pointerdown', closeBubble)
    return () => document.removeEventListener('pointerdown', closeBubble)
  }, [])

  const toggleCompetitor = (competitorId) => {
    if (pinnedCompetitorId === competitorId) {
      setPinnedCompetitorId(null)
      setActiveCompetitorId(null)
      setSuppressedHoverId(competitorId)
      return
    }
    setPinnedCompetitorId(competitorId)
    setActiveCompetitorId(competitorId)
    setSuppressedHoverId(null)
  }

  const focusCompetitorOnMap = (place) => {
    setMapFocusRequest({ place, requestId: window.performance.now() })
  }

  return (
    <section className="content-page market-page">
      <button className="back-link" onClick={onBack}><ArrowLeft size={17} /> Ubah ide</button>
      <div className="page-title split-title">
        <div>
          <div className="eyebrow"><BarChart3 size={15} /> Analisis pasar lokal</div>
          <h1>Peluang {form.product.toLowerCase()} di <span>{[form.district, form.city].filter(Boolean).join(', ') || 'lokasi kamu'}</span></h1>
          <p>Kami membandingkan sinyal permintaan, persaingan, dan ruang pembeda dalam radius 3 km dari titik lokasi jualan yang kamu pilih.</p>
        </div>
      </div>

      {opportunity && (
        <div className="opportunity-card">
          <ScoreRing score={opportunity.score} />
          <div className="opportunity-copy">
            <span className="status-tag"><TrendingUp size={15} /> {opportunity.label}</span>
            {data?.verdict?.headline && <h2>{data.verdict.headline}</h2>}
            {data?.verdict?.summary && <p>{data.verdict.summary}</p>}
          </div>
          {data?.verdict?.recommendation && <div className="verdict-box"><small>REKOMENDASI</small><strong>{data.verdict.recommendation}</strong><span>{data.verdict.recommendationNote}</span></div>}
        </div>
      )}

      <div className="market-grid">
        <div className="panel map-panel">
          <div className="panel-heading"><div><small>RADAR LOKAL · {data?.metadata?.radiusKm || 3} KM</small><h3>Usaha terkait yang terlihat</h3></div><span className="count-pill">{liveCompetitors.length} usaha</span></div>
          <MarketMap data={data} focusRequest={mapFocusRequest} />
        </div>
        <div className="panel competitor-panel" ref={competitorPanelRef}>
          <div className="panel-heading"><div><small>PEMAIN UTAMA</small><h3>{competitionLabel}</h3></div><Store size={20} /></div>
          <div className="competitor-list">
            {mainCompetitors.map((item, index) => {
              const competitorId = item.googlePlaceId || item.id || item.name
              const reviewActive = activeCompetitorId === competitorId
              return (
              <div
                className={`competitor-row ${reviewActive ? 'review-active' : ''}`}
                key={competitorId}
                role="button"
                tabIndex={0}
                aria-expanded={reviewActive}
                aria-label={`Tampilkan ulasan ${item.name}`}
                onPointerEnter={(event) => {
                  if (event.pointerType === 'mouse' && suppressedHoverId !== competitorId) {
                    setPinnedCompetitorId(null)
                    setActiveCompetitorId(competitorId)
                  }
                }}
                onPointerLeave={(event) => {
                  if (event.pointerType === 'mouse') {
                    setActiveCompetitorId(null)
                    setPinnedCompetitorId(null)
                    setSuppressedHoverId(null)
                  }
                }}
                onClick={(event) => {
                  event.stopPropagation()
                  toggleCompetitor(competitorId)
                  focusCompetitorOnMap(item)
                }}
                onFocus={() => setActiveCompetitorId(competitorId)}
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) {
                    setActiveCompetitorId(null)
                    setPinnedCompetitorId(null)
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    toggleCompetitor(competitorId)
                    focusCompetitorOnMap(item)
                  }
                }}
              >
                <span className={`store-avatar ${item.tone || ['coral', 'yellow', 'purple', 'green', 'blue', 'pink'][index % 6]}`}>{item.name[0]}</span>
                <p><b>{item.name}</b><small>{item.type} · {item.address || item.area || 'Alamat belum tersedia'}</small></p>
                <span className={`rating ${!item.rating ? 'unrated' : ''}`}><Star size={13} fill={item.rating ? 'currentColor' : 'none'} /> {item.rating ? String(item.rating).replace('.', ',') : 'OSM'}</span>
                {reviewActive && <CompetitorReviewBubble place={item} />}
              </div>
            )})}
          </div>
          {otherCompetitors.length > 0 && <button className={`text-button other-business-toggle ${showAll ? 'open' : ''}`} onClick={() => { setShowAll(!showAll); setActiveCompetitorId(null); setPinnedCompetitorId(null) }}>{showAll ? 'Sembunyikan usaha lainnya' : `Lihat ${otherCompetitors.length} usaha lainnya`} <ChevronRight size={16} /></button>}
          {showAll && otherCompetitors.length > 0 && <div className="other-competitors-section">
            <div className="other-competitors-heading"><div><small>KOMPETITOR LAINNYA</small><h4>Usaha lain dalam radius 3 km</h4></div><span>Tanpa ulasan</span></div>
            <div className="other-competitor-list">
              {otherCompetitors.map((item, index) => (
                <div className="other-competitor-row" key={item.googlePlaceId || item.id || item.name}>
                  <span className={`store-avatar ${item.tone || ['coral', 'yellow', 'purple', 'green', 'blue', 'pink'][(index + 5) % 6]}`}>{item.name[0]}</span>
                  <p><b>{item.name}</b><small>{item.type} · {item.address || item.area || 'Alamat belum tersedia'}</small></p>
                  <span className={`rating ${!item.rating ? 'unrated' : ''}`}><Star size={13} fill={item.rating ? 'currentColor' : 'none'} /> {item.rating ? String(item.rating).replace('.', ',') : 'OSM'}</span>
                </div>
              ))}
            </div>
          </div>}
        </div>
      </div>

      {metrics.length > 0 && (
        <div className="metrics-panel">
          <div className="panel-heading"><div><small>KENAPA SKORNYA {opportunity.score}?</small><h3>Komponen penilaian</h3></div><span className="formula-pill">{metrics.length} sinyal utama</span></div>
          <div className="metric-grid">
            {metrics.map((metric) => (
              <div className="metric" key={metric.label}>
                <div><span>{metric.label}</span><b>{metric.value}</b></div>
                <div className="metric-bar"><i style={{ width: `${metric.value}%` }} /></div>
                <small>{metric.note}</small>
              </div>
            ))}
          </div>
        </div>
      )}

      {(data?.insights?.opportunity || data?.insights?.risk || data?.priceRange) && (
        <div className="insight-grid">
          {data?.insights?.opportunity && <div className="insight-card positive"><span><Target size={20} /></span><div><small>PELUANG TERBESAR</small><h3>{data.insights.opportunity}</h3></div></div>}
          {data?.insights?.risk && <div className="insight-card warning"><span><Users size={20} /></span><div><small>RISIKO UTAMA</small><h3>{data.insights.risk}</h3></div></div>}
          {data?.priceRange && <div className="insight-card neutral"><span><CircleDollarSign size={20} /></span><div><small>RENTANG PASAR</small><h3>{data.priceRange.label}</h3><p>{`Diperiksa dari ${data.priceRange.sources.length} sumber menu publik.`}</p></div></div>}
        </div>
      )}

      <div className="action-row"><button className="secondary-button" onClick={onBack}><ArrowLeft size={17} /> Kembali</button><button className="primary-button" onClick={onNext}>Lihat konsep yang cocok <ArrowRight size={17} /></button></div>
    </section>
  )
}

function ConceptChoice({ form, selected, setSelected, onNext, onBack, aiConcepts, setAiConcepts }) {
  const [loading, setLoading] = useState(aiConcepts === null)
  const [ideaInput, setIdeaInput] = useState('')
  const [conceptError, setConceptError] = useState(null)

  async function fetchConcepts({ userPrompt = '', bust = false } = {}) {
    setLoading(true)
    setConceptError(null)
    try {
      const res = await fetch('/api/business/concepts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product: form.product, userPrompt, bust }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Konsep belum berhasil dibuat.')
      const concepts = Array.isArray(data.concepts) ? data.concepts : []
      setAiConcepts(concepts)
      if (concepts.length) setSelected(concepts[0].id)
      else setConceptError('AI belum menghasilkan konsep. Coba generate ulang.')
    } catch (error) {
      setAiConcepts([])
      setConceptError(error.message || 'Konsep belum berhasil dibuat. Coba lagi.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (aiConcepts !== null) { setLoading(false); return }
    fetchConcepts()
  }, [])

  const concepts = aiConcepts || []

  useEffect(() => {
    if (!loading && concepts.length && !concepts.some((c) => c.id === selected)) setSelected(concepts[0].id)
  }, [concepts, loading, selected, setSelected])

  const topConcept = concepts[0]

  return (
    <section className="content-page concept-page">
      <button className="back-link" onClick={onBack}><ArrowLeft size={17} /> Kembali ke analisis</button>
      <div className="page-title centered">
        <div className="eyebrow"><Lightbulb size={15} /> Arah usaha</div>
        <h1>Pilih cara kamu <span>masuk ke pasar</span></h1>
        <p>Tiga konsep berbeda agar kamu tidak bersaing sebagai penjual {form.product.toLowerCase()} biasa.</p>
      </div>

      <div className="concept-generate-bar">
        <input
          className="concept-idea-input"
          type="text"
          value={ideaInput}
          onChange={(e) => setIdeaInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ideaInput.trim() && !loading && fetchConcepts({ userPrompt: ideaInput.trim() })}
          placeholder="Punya arah sendiri? Contoh: mau jualan online, modal kecil, target anak sekolah…"
          maxLength={200}
          disabled={loading}
        />
        <button
          className="concept-guided-btn"
          onClick={() => fetchConcepts({ userPrompt: ideaInput.trim() })}
          disabled={!ideaInput.trim() || loading}
          title="Generate berdasarkan ide kamu"
        >
          <Sparkles size={14} /> Pakai Ide Ini
        </button>
      </div>

      <div className="concept-grid">
        {loading ? (
          <>
            <div className="concept-card concept-skeleton"><div className="skeleton-line sh-sm" /><div className="skeleton-line sh-lg" /><div className="skeleton-line sh-md" /><div className="skeleton-line sh-sm" /></div>
            <div className="concept-card concept-skeleton"><div className="skeleton-line sh-sm" /><div className="skeleton-line sh-lg" /><div className="skeleton-line sh-md" /><div className="skeleton-line sh-sm" /></div>
            <div className="concept-card concept-skeleton"><div className="skeleton-line sh-sm" /><div className="skeleton-line sh-lg" /><div className="skeleton-line sh-md" /><div className="skeleton-line sh-sm" /></div>
          </>
        ) : concepts.length ? concepts.map((concept) => (
          <button className={`concept-card ${selected === concept.id ? 'selected' : ''}`} key={concept.id} onClick={() => setSelected(concept.id)}>
            <div className="concept-top"><span className="concept-check">{selected === concept.id && <Check size={16} />}</span><span className="fit-score">Kecocokan <b>{concept.score}%</b></span></div>
            <small>{concept.eyebrow}</small>
            <h2>{concept.title}</h2>
            <p>{concept.description}</p>
            <div className="concept-facts">
              <span><Users size={16} /><i>Target</i><b>{concept.target}</b></span>
              {concept.suggestedPrice != null && (
                <span><CircleDollarSign size={16} /><i>Harga jual</i><b>{rupiah.format(concept.suggestedPrice)}{concept.unitContent && <small className="concept-price-content"> · {concept.unitContent}</small>}</b></span>
              )}
            </div>
            <div className="concept-edge"><Sparkles size={15} /> {concept.edge}</div>
          </button>
        )) : (
          <div className="concept-empty-state">
            <Info size={22} />
            <p><b>Belum ada konsep</b><small>{conceptError || 'AI belum menghasilkan konsep untuk produk ini.'}</small></p>
            <button className="concept-random-btn" onClick={() => fetchConcepts({ bust: true })}><RefreshCw size={14} /> Coba lagi</button>
          </div>
        )}
      </div>

      <div className="concept-reroll-row">
        <button
          className="concept-random-btn"
          onClick={() => fetchConcepts({ bust: true })}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? 'spin' : ''} /> Generate ulang ide
        </button>
      </div>

      <div className="concept-plain-row">
        <span>Ide kurang cocok sama kreativitas kamu?</span>
        <button
          className="concept-plain-btn"
          onClick={() => fetchConcepts({ userPrompt: 'jualan biasa, langsung ke pelanggan, tanpa konsep khusus', bust: true })}
          disabled={loading}
        >
          Jualan biasa aja
        </button>
      </div>

      {!loading && topConcept && (
        <div className="recommendation-banner">
          <span><BadgeCheck size={21} /></span>
          <p><b>Kenapa {topConcept.title}?</b><small>{topConcept.description}</small></p>
        </div>
      )}
      <div className="action-row">
        <button className="secondary-button" onClick={onBack}><ArrowLeft size={17} /> Kembali</button>
        <button className="primary-button" onClick={onNext} disabled={!selected || loading}>Susun kebutuhan usaha <ArrowRight size={17} /></button>
      </div>
    </section>
  )
}

function Quantity({ value, whole }) {
  if (whole) return <>{Math.ceil(value)}</>
  const formatted = Number.isInteger(value) ? value : value.toFixed(1).replace('.', ',')
  return <>{formatted}</>
}

function SupplierSection({ suppliers, ingredients, form, aiReady }) {
  const [tab, setTab] = useState('local')
  const center = Number.isFinite(form.latitude) ? { latitude: form.latitude, longitude: form.longitude } : null

  // --- Local tab state ---
  const [localGroups, setLocalGroups] = useState(null)
  const [localLoading, setLocalLoading] = useState(false)
  const [localError, setLocalError] = useState(null)
  const localFetchedRef = useRef(false)
  const [replacedStores, setReplacedStores] = useState({})
  const [reSearching, setReSearching] = useState({})
  const [selectedLocalStore, setSelectedLocalStore] = useState(null)
  const [localFocusRequest, setLocalFocusRequest] = useState(null)

  // --- Online tab state ---
  const [onlineResults, setOnlineResults] = useState(null)
  const [onlineLoading, setOnlineLoading] = useState(false)
  const onlineFetchedRef = useRef(false)
  const [manualLinks, setManualLinks] = useState({})
  const [draftUrls, setDraftUrls] = useState({})

  async function fetchLocal() {
    if (!center || !ingredients.length) return
    setLocalLoading(true)
    setLocalError(null)
    try {
      const res = await fetch('/api/suppliers/local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredients, lat: center.latitude, lng: center.longitude, product: form.product }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setLocalGroups(data.groups || [])
    } catch (error) {
      setLocalError(error.message || 'Pencarian toko gagal.')
    } finally {
      setLocalLoading(false)
    }
  }

  async function reSearchCategory(category, currentStoreName) {
    setReSearching((prev) => ({ ...prev, [category]: true }))
    try {
      const res = await fetch('/api/suppliers/local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredients, lat: center.latitude, lng: center.longitude, product: form.product }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const group = (data.groups || []).find((g) => g.category === category)
      const alt = group?.stores?.find((s) => s.name !== currentStoreName)
      if (alt) setReplacedStores((prev) => ({ ...prev, [category]: alt }))
    } catch { /* silently fail */ } finally {
      setReSearching((prev) => ({ ...prev, [category]: false }))
    }
  }

  async function fetchOnline() {
    setOnlineLoading(true)
    try {
      const res = await fetch('/api/suppliers/online', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredients }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setOnlineResults(data.results || [])
    } catch { setOnlineResults([]) } finally {
      setOnlineLoading(false)
    }
  }

  useEffect(() => {
    if (tab === 'local' && !localFetchedRef.current && aiReady) {
      localFetchedRef.current = true
      fetchLocal()
    }
    if (tab === 'online' && !onlineFetchedRef.current && aiReady) {
      onlineFetchedRef.current = true
      fetchOnline()
    }
  }, [tab, aiReady])

  // Stable identity — a new array each render would remount the Leaflet map
  const allStores = useMemo(
    () => (localGroups || []).map((g) => replacedStores[g.category] || g.stores?.[0]).filter(Boolean),
    [localGroups, replacedStores],
  )

  return (
    <div className="panel supplier-panel">
      <div className="panel-heading">
        <div><small>PEMASOK</small><h3>Cari bahan terbaik</h3></div>
        <div className="supplier-tab-toggle">
          <button className={tab === 'local' ? 'active' : ''} onClick={() => setTab('local')}><MapPin size={13} /> Lokal</button>
          <button className={tab === 'online' ? 'active' : ''} onClick={() => setTab('online')}><Globe2 size={13} /> Online</button>
        </div>
      </div>

      {tab === 'local' && (
        <div className="supplier-local-tab">
          {localLoading && <div className="supplier-searching"><RefreshCw size={16} className="spin" /><span>Mencari toko terdekat…</span></div>}
          {localError && <div className="supplier-empty"><Info size={18} /><p><b>Gagal memuat toko</b><small>{localError}</small></p></div>}
          {!localLoading && !localError && !localGroups && <div className="supplier-empty"><Search size={20} /><p><b>Belum ada data bahan</b><small>Generate bahan AI terlebih dahulu.</small></p></div>}
          {!localLoading && !localError && localGroups && (() => {
            const selectedGroup = selectedLocalStore
              ? localGroups.find((g) => (replacedStores[g.category] || g.stores?.[0])?.name === selectedLocalStore.name)
              : null
            return (
              <div className="supplier-split-layout">
                <div className="supplier-split-map">
                  {center && allStores.length > 0 && (
                    <CompetitorMapCanvas
                      center={center}
                      places={allStores}
                      onSelect={(store) => setSelectedLocalStore(store)}
                      focusRequest={localFocusRequest}
                    />
                  )}
                  {selectedLocalStore && (() => {
                    const storeDistance = center ? distanceFrom(center, selectedLocalStore) : null
                    const storeIngredients = selectedGroup?.ingredients || []
                    // SerpApi often omits a maps link — fall back to a name+address search
                    const mapsUrl = selectedLocalStore.googleMapsUrl
                      || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([selectedLocalStore.name, selectedLocalStore.address].filter(Boolean).join(', '))}`
                    return (
                      <aside className="place-detail-card compact supplier-store-detail" aria-label={`Detail ${selectedLocalStore.name}`}>
                        <div className="place-detail-heading">
                          <span className="place-detail-avatar">{selectedLocalStore.name?.[0] || '?'}</span>
                          <div><small>{selectedLocalStore.type || 'Pemasok lokal'}</small><h3>{selectedLocalStore.name}</h3></div>
                          <button type="button" onClick={() => setSelectedLocalStore(null)} aria-label="Tutup detail"><X size={17} /></button>
                        </div>
                        <p className="place-address"><MapPin size={15} /><span>{selectedLocalStore.address || 'Alamat belum tersedia'}{storeDistance != null && <b>{storeDistance < 1 ? `${Math.round(storeDistance * 1000)} m` : `${storeDistance.toFixed(1).replace('.', ',')} km`} dari lokasi jualan</b>}</span></p>
                        <div className="place-detail-grid">
                          <div><Star size={15} /><span><small>Rating</small><b>{selectedLocalStore.rating ? `${selectedLocalStore.rating} / 5${selectedLocalStore.reviewCount ? ` · ${selectedLocalStore.reviewCount} ulasan` : ''}` : 'Belum tersedia'}</b></span></div>
                        </div>
                        {storeIngredients.length > 0 && (
                          <div className="sgc-buy-list" style={{ margin: '10px 0 4px' }}>
                            <small>Beli di sini:</small>
                            <div className="sgc-tags">
                              {storeIngredients.map((ing) => <span key={ing.name || ing.id} className="ing-tag">{ing.name}</span>)}
                            </div>
                          </div>
                        )}
                        <div className="place-detail-actions">
                          <span>Sumber: Google Maps via SerpApi</span>
                          <a href={mapsUrl} target="_blank" rel="noreferrer"><Navigation size={15} /> Buka listing Google Maps</a>
                        </div>
                      </aside>
                    )
                  })()}
                </div>
                <div className="supplier-groups">
                  {localGroups.map((group) => {
                    const store = replacedStores[group.category] || group.stores?.[0]
                    const isReSearching = reSearching[group.category]
                    const distance = center && store ? distanceFrom(center, store) : null
                    const isActive = selectedLocalStore?.name === store?.name
                    return (
                      <div
                        key={group.category}
                        className={`supplier-group-card ${isActive ? 'active' : ''}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          if (store) {
                            const next = isActive ? null : store
                            setSelectedLocalStore(next)
                            if (next) setLocalFocusRequest({ place: store, requestId: window.performance.now() })
                          }
                        }}
                      >
                        <div className="sgc-header">
                          <span className="sgc-category"><Store size={13} /> {group.category}</span>
                          {store && (
                            <button
                              className="sgc-resarch-btn"
                              onClick={(e) => { e.stopPropagation(); reSearchCategory(group.category, store.name) }}
                              disabled={isReSearching}
                            >
                              {isReSearching ? <RefreshCw size={11} className="spin" /> : <RefreshCw size={11} />}
                              Cari alternatif
                            </button>
                          )}
                        </div>
                        {store ? (
                          <>
                            <div className="sgc-store">
                              <div className="sgc-store-info">
                                <b>{store.name}</b>
                                <small>{store.address}</small>
                              </div>
                              <div className="sgc-store-meta">
                                {distance != null && <span className="s-distance">{distance < 1 ? `${Math.round(distance * 1000)}m` : `${distance.toFixed(1)}km`}</span>}
                                {store.rating && <span className="s-rating"><Star size={11} fill="currentColor" /> {store.rating}</span>}
                              </div>
                            </div>
                            {group.ingredients?.length > 0 && (
                              <div className="sgc-buy-list">
                                <small>Beli di sini:</small>
                                <div className="sgc-tags">
                                  {group.ingredients.map((ing) => <span key={ing.name || ing.id} className="ing-tag">{ing.name}</span>)}
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="sgc-no-store"><small>Toko tidak ditemukan di area ini.</small></div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {tab === 'online' && (
        <div className="supplier-online-tab">
          <div className="online-header">
            <p className="online-note"><Globe2 size={14} /> <b>3 bahan termahal</b> dicocokkan ke daftar harga yang sudah diverifikasi manual.</p>
          </div>
          {onlineLoading && (
            <div className="supplier-searching">
              <RefreshCw size={16} className="spin" />
              <span>Mencocokkan harga…</span>
            </div>
          )}
          {!onlineLoading && onlineResults && (
            <div className="online-ingredient-list">
              {onlineResults.map(({ ingredient: ing, items, error }) => {
                const best = items?.[0]
                const manual = manualLinks[ing.id]
                const notFound = !error && !best && !manual
                return (
                  <div key={ing.id} className="online-ingredient-row">
                    <span className="online-ing-name">{ing.name}</span>
                    <div className="online-result">
                      {error && <span className="market-error">Gagal</span>}
                      {best && (
                        <a href={best.link} target="_blank" rel="noreferrer" className={`market-best-link ${best.source}-link`}>
                          <div className="market-best-content">
                            <span className="market-best-title">{best.title.length > 50 ? best.title.slice(0, 50) + '…' : best.title}</span>
                            {best.price != null && <span className="market-best-price">Rp {best.price.toLocaleString('id')}{best.checkedAt && <small className="market-checked-at"> · dicek {best.checkedAt}</small>}</span>}
                          </div>
                          <span className={`market-source-badge ${best.source}-badge`}>{best.source === 'shopee' ? 'Shopee' : 'Tokopedia'}</span>
                          <ExternalLink size={10} />
                        </a>
                      )}
                      {manual && (
                        <a href={manual.url} target="_blank" rel="noreferrer" className={`market-best-link ${manual.source}-link`}>
                          <div className="market-best-content">
                            <span className="market-best-title">Link manual kamu</span>
                          </div>
                          <span className={`market-source-badge ${manual.source}-badge`}>{manual.source === 'shopee' ? 'Shopee' : manual.source === 'tokopedia' ? 'Tokopedia' : 'Link'}</span>
                          <ExternalLink size={10} />
                        </a>
                      )}
                      {notFound && (
                        <div className="market-not-found-wrap">
                          <span className="market-empty">Tidak ditemukan otomatis</span>
                          <div className="market-manual-search">
                            <a
                              href={`https://shopee.co.id/search?keyword=${encodeURIComponent(ing.name)}`}
                              target="_blank" rel="noreferrer"
                              className="manual-search-btn shopee-btn"
                            ><Search size={11} /> Cari di Shopee</a>
                            <a
                              href={`https://www.tokopedia.com/search?st=product&q=${encodeURIComponent(ing.name)}`}
                              target="_blank" rel="noreferrer"
                              className="manual-search-btn tokopedia-btn"
                            ><Search size={11} /> Cari di Tokopedia</a>
                          </div>
                          <div className="manual-link-row">
                            <input
                              className="manual-link-input"
                              placeholder="Paste link produk yang kamu temukan…"
                              value={draftUrls[ing.id] || ''}
                              onChange={(e) => setDraftUrls((prev) => ({ ...prev, [ing.id]: e.target.value }))}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const url = draftUrls[ing.id]?.trim()
                                  if (!url) return
                                  const src = url.includes('shopee') ? 'shopee' : url.includes('tokopedia') ? 'tokopedia' : 'other'
                                  setManualLinks((prev) => ({ ...prev, [ing.id]: { url, source: src } }))
                                }
                              }}
                            />
                            <button
                              className="manual-link-save"
                              onClick={() => {
                                const url = draftUrls[ing.id]?.trim()
                                if (!url) return
                                const src = url.includes('shopee') ? 'shopee' : url.includes('tokopedia') ? 'tokopedia' : 'other'
                                setManualLinks((prev) => ({ ...prev, [ing.id]: { url, source: src } }))
                              }}
                            ><Check size={13} /></button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Plan({ form, conceptId, aiConcepts, marketData, batch, setBatch, hasEquipment, setHasEquipment, onBack }) {
  const allConcepts = aiConcepts || []
  const concept = allConcepts.find((item) => item.id === conceptId) || allConcepts[0] || null
  const supplierRows = marketData?.suppliers?.slice(0, 8) || []

  const [aiPlan, setAiPlan] = useState(null)
  const [aiLoading, setAiLoading] = useState(true)
  const [aiError, setAiError] = useState(null)

  useEffect(() => {
    if (!concept) { setAiLoading(false); return undefined }
    let cancelled = false
    setAiLoading(true)
    setAiError(null)
    fetch('/api/business/ingredients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product: form.product, conceptTitle: concept.title, suggestedPrice: concept.suggestedPrice, unit: concept.unit, unitContent: concept.unitContent, piecesPerUnit: concept.piecesPerUnit }),
    })
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Gagal memuat bahan.')
        return result
      })
      .then((result) => { if (!cancelled) setAiPlan(result) })
      .catch((error) => { if (!cancelled) setAiError(error.message) })
      .finally(() => { if (!cancelled) setAiLoading(false) })
    return () => { cancelled = true }
  }, [form.product, concept?.title, concept?.suggestedPrice, concept?.unit, concept?.unitContent, concept?.piecesPerUnit])

  // The AI's price is a starting point, not a mandate — the slider lets the user
  // explore around it without re-calling the AI (HPP/ingredients don't change).
  // Resets whenever the underlying concept changes so a stale price from a
  // previous concept never lingers.
  const [sellingPrice, setSellingPrice] = useState(concept?.suggestedPrice ?? null)
  useEffect(() => {
    setSellingPrice(concept?.suggestedPrice ?? null)
  }, [concept?.id, concept?.suggestedPrice])

  const ingredients = aiPlan?.ingredients || []
  const equipment = aiPlan?.equipment || []
  // The concept defines the unit the customer actually buys, so it wins over the
  // ingredients call, which only echoes it back.
  const productUnit = concept?.unit || aiPlan?.unit || 'produk'
  const launchSteps = aiPlan?.launchSteps || []
  const equipmentSummary = equipment.map((item) => item.name).join(', ')

  const [userPrices, setUserPrices] = useState({})
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState('')

  const savePrice = (itemId, rawValue) => {
    const price = parseFloat(String(rawValue).replace(/[^0-9.]/g, ''))
    if (Number.isFinite(price) && price > 0) setUserPrices((prev) => ({ ...prev, [itemId]: price }))
    setEditingId(null)
  }

  const factor = batch / 50
  const ingredientRows = useMemo(() => {
    return ingredients.map((item) => {
      const rawQty = item.baseQty * factor
      const qty = item.whole ? Math.ceil(rawQty) : rawQty
      const estimatedCost = Math.max(1000, Math.round((item.baseCost * factor) / 1000) * 1000)
      const unitPrice = userPrices[item.id]
      const userCost = unitPrice ? Math.max(1000, Math.ceil((qty * unitPrice) / 1000) * 1000) : null
      return { ...item, qty, cost: userCost ?? estimatedCost, hasUserPrice: !!unitPrice }
    })
  }, [factor, userPrices, ingredients])

  const ingredientTotal = ingredientRows.reduce((sum, item) => sum + item.cost, 0)
  // Both come from the AI alongside the ingredients (costed per 50 units, same as
  // baseCost). No estimate is invented locally — if the AI omits one, it is left out.
  const scaleCost = (value) => (Number.isFinite(value) && value > 0 ? Math.round((value * factor) / 1000) * 1000 : null)
  // Packaging goes through the same real-price matching as food ingredients (see
  // aiService.generateIngredients), but is kept out of `ingredients` itself so it
  // never leaks into the local/online supplier search, which is food-store specific.
  const packagingRow = useMemo(() => {
    const pkg = aiPlan?.packaging
    if (!pkg || !Number.isFinite(pkg.cost) || pkg.cost <= 0) return null
    const qty = Math.ceil((pkg.baseQty || 1) * factor)
    const cost = Math.max(1000, Math.round((pkg.cost * factor) / 1000) * 1000)
    return { ...pkg, qty, cost }
  }, [aiPlan?.packaging, factor])
  const packaging = packagingRow?.cost ?? null
  const productionOverhead = scaleCost(aiPlan?.overheadCost)
  const operatingTotal = ingredientTotal + (packaging || 0) + (productionOverhead || 0)
  const equipmentTotal = hasEquipment ? 0 : equipment.reduce((sum, item) => sum + item.cost, 0)
  const initialCapital = operatingTotal + equipmentTotal
  const hpp = Math.ceil(operatingTotal / batch / 100) * 100
  const suggestedPrice = concept?.suggestedPrice ?? null
  // Keeps exploration anchored to a price the AI already vetted against realistic
  // street-food ranges, instead of letting the slider wander to nonsense values.
  const priceStep = suggestedPrice && suggestedPrice < 5000 ? 100 : 500
  const priceMin = suggestedPrice ? Math.max(priceStep, Math.round((suggestedPrice * 0.5) / priceStep) * priceStep) : null
  const priceMax = suggestedPrice ? Math.round((suggestedPrice * 1.5) / priceStep) * priceStep : null
  const effectivePrice = sellingPrice ?? suggestedPrice
  const profit = effectivePrice != null ? effectivePrice - hpp : null
  const margin = effectivePrice ? Math.round((profit / effectivePrice) * 100) : null
  const breakEven = effectivePrice ? Math.ceil((operatingTotal / effectivePrice) + (equipmentTotal / Math.max(profit, 1))) : null
  const [copied, setCopied] = useState(false)
  const userEditedCount = Object.keys(userPrices).length

  const copySummary = async () => {
    const lines = [
      'MULAIUSAHA — RENCANA AWAL',
      `Usaha: ${concept?.title || form.product}`,
      `Lokasi: ${[form.village, form.district, form.city].filter(Boolean).join(', ') || '-'}`,
      `Target produksi: ${batch} ${productUnit}`,
      `Modal awal: ${rupiah.format(initialCapital)}`,
      `HPP: ${rupiah.format(hpp)}/${productUnit}`,
      effectivePrice != null && `Harga jual: ${rupiah.format(effectivePrice)}/${productUnit}`,
      profit != null && `Estimasi laba: ${rupiah.format(profit)}/${productUnit}`,
      breakEven != null && `BEP: ${breakEven} ${productUnit}`,
    ].filter(Boolean)
    await navigator.clipboard.writeText(lines.join('\n'))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  if (!concept) {
    return (
      <section className="content-page plan-page">
        <button className="back-link" onClick={onBack}><ArrowLeft size={17} /> Ganti konsep</button>
        <div className="concept-empty-state">
          <Info size={22} />
          <p><b>Belum ada konsep terpilih</b><small>Kembali ke langkah sebelumnya dan pilih satu konsep usaha.</small></p>
          <button className="concept-random-btn" onClick={onBack}><ArrowLeft size={14} /> Pilih konsep</button>
        </div>
      </section>
    )
  }

  return (
    <section className="content-page plan-page">
      <button className="back-link" onClick={onBack}><ArrowLeft size={17} /> Ganti konsep</button>
      <div className="page-title split-title plan-title">
        <div><div className="eyebrow"><ClipboardCheck size={15} /> Rencana usaha awal</div><h1>{concept.title} <span>siap diuji</span></h1><p>Angka akan menyesuaikan target produksi dan alat yang sudah kamu miliki.</p></div>
        <div className="plan-actions"><button className="secondary-button compact" onClick={copySummary}>{copied ? <><Check size={16} /> Tersalin</> : <><FileText size={16} /> Salin ringkasan</>}</button><button className="primary-button compact" onClick={() => window.print()}><ExternalLink size={16} /> Cetak</button></div>
      </div>

      <div className="batch-selector panel">
        <div><small>SKALA PRODUKSI PERTAMA</small><h3>Mulai dari berapa {productUnit}?</h3><p>Untuk pasar baru, kami sarankan mulai kecil dan kumpulkan masukan.</p></div>
        <div className="batch-options">
          {[20, 50, 100].map((amount) => <button key={amount} className={batch === amount ? 'selected' : ''} onClick={() => setBatch(amount)}><b>{amount}</b><span>{amount === 20 ? 'Uji pasar' : amount === 50 ? 'Rumahan' : 'Usaha kecil'}</span></button>)}
        </div>
      </div>

      <div className="plan-grid">
        <div className="plan-main">
          <div className="panel needs-panel">
            <div className="panel-heading"><div><small>DAFTAR KEBUTUHAN</small><h3>Bahan untuk {batch} {productUnit}</h3></div><span className="count-pill">{aiLoading ? <RefreshCw className="spin" size={13} /> : `${ingredientRows.length} bahan`}</span></div>
            <div className="needs-table">
              <div className="table-head"><span>Bahan</span><span>Jumlah</span><span>Harga</span></div>
              {aiLoading && <div className="ai-loading-row"><RefreshCw className="spin" size={15} /><span>AI sedang menyiapkan daftar bahan untuk <b>{form.product}</b>…</span></div>}
              {aiError && <div className="ai-error-row"><Info size={14} /><span>Daftar bahan belum bisa dibuat — {aiError}</span></div>}
              {!aiLoading && !aiError && !ingredientRows.length && <div className="ai-error-row"><Info size={14} /><span>AI belum menghasilkan daftar bahan untuk produk ini.</span></div>}
              {ingredientRows.map((item) => {
                // Three price tiers, most trustworthy first: what the user typed in
                // themselves, a hand-verified market price from the local database,
                // then the AI's own guess.
                const priceBadge = item.hasUserPrice ? 'SENDIRI' : item.priceSource === 'local-db' ? 'PASAR' : 'ESTIMASI'
                const sourceLabel = item.hasUserPrice
                  ? 'Harga kamu sendiri'
                  : item.priceSource === 'local-db'
                    ? `Harga pasar${item.priceCheckedAt ? ` · dicek ${item.priceCheckedAt}` : ''}`
                    : `${item.source} · estimasi AI`
                return (
                <div className="table-row" key={item.id || item.name}>
                  <span>
                    <i className={`item-check ${item.hasUserPrice ? 'verified' : item.priceSource === 'local-db' ? 'market' : ''}`}>{item.hasUserPrice ? <BadgeCheck size={13} /> : item.priceSource === 'local-db' ? <BadgeCheck size={13} /> : <Check size={12} />}</i>
                    <p>
                      <b>{item.name}</b>
                      <small>
                        {sourceLabel}
                        {!item.hasUserPrice && item.priceSource === 'local-db' && item.priceLink && (
                          <a href={item.priceLink} target="_blank" rel="noreferrer" className="price-source-link" onClick={(e) => e.stopPropagation()}> · lihat produk</a>
                        )}
                      </small>
                    </p>
                  </span>
                  <span><Quantity value={item.qty} whole={item.whole} /> {item.unit}</span>
                  <strong className="price-cell">
                    {editingId === item.id ? (
                      <span className="price-edit-wrap">
                        <input
                          type="number"
                          className="price-edit-input"
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') savePrice(item.id, editDraft); if (e.key === 'Escape') setEditingId(null) }}
                          placeholder={`per ${item.unit}`}
                          autoFocus
                          min="1"
                        />
                        <button className="price-confirm-btn" onClick={() => savePrice(item.id, editDraft)} title="Simpan"><Check size={13} /></button>
                        <button className="price-cancel-btn" onClick={() => setEditingId(null)} title="Batal"><X size={13} /></button>
                      </span>
                    ) : (
                      <span className="price-display">
                        <span>{rupiah.format(item.cost)}<small className={item.hasUserPrice || item.priceSource === 'local-db' ? 'verified-price' : ''}>{priceBadge}</small></span>
                        <button className="price-edit-btn" onClick={() => { setEditingId(item.id); setEditDraft(userPrices[item.id] ? String(userPrices[item.id]) : '') }} title={`Edit harga per ${item.unit}`}><Pencil size={12} /></button>
                      </span>
                    )}
                  </strong>
                </div>
                )
              })}
              {packagingRow && (() => {
                const badge = packagingRow.priceSource === 'local-db' ? 'PASAR' : 'ESTIMASI'
                const label = packagingRow.priceSource === 'local-db'
                  ? `Harga pasar${packagingRow.priceCheckedAt ? ` · dicek ${packagingRow.priceCheckedAt}` : ''}`
                  : 'Estimasi AI'
                return (
                  <div className="table-row add-ons">
                    <span>
                      <i className={`item-check ${packagingRow.priceSource === 'local-db' ? 'market' : ''}`}><PackageCheck size={12} /></i>
                      <p>
                        <b>Kemasan & label — {packagingRow.matchedName || packagingRow.name}</b>
                        <small>
                          {label}
                          {packagingRow.priceSource === 'local-db' && packagingRow.priceLink && (
                            <a href={packagingRow.priceLink} target="_blank" rel="noreferrer" className="price-source-link" onClick={(e) => e.stopPropagation()}> · lihat produk</a>
                          )}
                        </small>
                      </p>
                    </span>
                    <span>{packagingRow.qty} {packagingRow.unit}</span>
                    <strong className="price-cell"><span className="price-display"><span>{rupiah.format(packagingRow.cost)}<small className={packagingRow.priceSource === 'local-db' ? 'verified-price' : ''}>{badge}</small></span></span></strong>
                  </div>
                )
              })()}
              {productionOverhead != null && <div className="table-row add-ons"><span><i className="item-check"><Sparkles size={12} /></i><p><b>Gas, listrik & cadangan</b><small>Biaya produksi</small></p></span><span>1 batch</span><strong>{rupiah.format(productionOverhead)}</strong></div>}
            </div>
            {userEditedCount > 0 ? (
              <div className="price-user-summary">
                <BadgeCheck size={16} />
                <span><b>{userEditedCount} dari {ingredients.length} harga sudah kamu isi.</b><small>HPP dihitung dari harga yang kamu masukkan.</small></span>
                <button className="reset-prices-btn" onClick={() => setUserPrices({})}>Reset semua</button>
              </div>
            ) : (
              <div className="price-edit-hint"><Pencil size={13} /><span>Klik ikon pensil untuk memasukkan harga per satuan yang sebenarnya kamu dapat.</span></div>
            )}
          </div>

          <SupplierSection suppliers={supplierRows} ingredients={ingredients} form={form} aiReady={!aiLoading} />
        </div>

        <aside className="finance-card">
          <div className="finance-heading"><span><WalletCards size={21} /></span><div><small>ESTIMASI KEUANGAN</small><h3>Modal yang dibutuhkan</h3></div></div>
          <label className="toggle-row"><span><b>Saya sudah punya alat</b><small>{equipmentSummary || 'Daftar alat menunggu data AI'}</small></span><input type="checkbox" checked={hasEquipment} onChange={(e) => setHasEquipment(e.target.checked)} /><i /></label>

          <div className="cost-list">
            <span><p>Bahan produksi</p><b>{rupiah.format(ingredientTotal)}</b></span>
            {packaging != null && <span><p>Kemasan & label</p><b>{rupiah.format(packaging)}</b></span>}
            {productionOverhead != null && <span><p>Gas, listrik, cadangan</p><b>{rupiah.format(productionOverhead)}</b></span>}
            <span className={hasEquipment ? 'disabled-cost' : ''}><p>Peralatan awal</p><b>{hasEquipment ? 'Sudah ada' : rupiah.format(equipmentTotal)}</b></span>
          </div>
          <div className="capital-total"><span>Total modal awal</span><strong>{rupiah.format(initialCapital)}</strong><small>Untuk memproduksi {batch} {productUnit}</small></div>
          <div className="unit-economics">
            <div><span>HPP / {productUnit}</span><b>{rupiah.format(hpp)}</b></div>
            {profit != null && <div className={profit >= 0 ? 'profit' : 'profit loss'}><span>{profit >= 0 ? 'Potensi laba' : 'Potensi rugi'} / {productUnit}</span><b>{profit >= 0 ? '+' : ''}{rupiah.format(profit)}</b></div>}
          </div>
          {effectivePrice != null && priceMin != null && priceMax != null && (
            <div className="price-slider-block">
              <div className="price-slider-heading">
                <span>
                  Harga jual / {productUnit}
                  {concept?.unitContent && <small className="price-slider-content"> ({concept.unitContent})</small>}
                </span>
                <b className="price-slider-value">{rupiah.format(effectivePrice)}</b>
              </div>
              <input
                type="range"
                className="price-slider"
                min={priceMin}
                max={priceMax}
                step={priceStep}
                value={effectivePrice}
                onChange={(e) => setSellingPrice(Number(e.target.value))}
              />
              <div className="price-slider-range"><span>{rupiah.format(priceMin)}</span><span>{rupiah.format(priceMax)}</span></div>
              {suggestedPrice != null && effectivePrice !== suggestedPrice && (
                <button className="price-slider-reset" onClick={() => setSellingPrice(suggestedPrice)}>
                  Kembalikan ke saran AI ({rupiah.format(suggestedPrice)})
                </button>
              )}
            </div>
          )}
          {margin != null && <div className="margin-row"><span>Margin kotor</span><div><i style={{ width: `${Math.max(0, Math.min(100, margin))}%` }} /></div><b>{margin}%</b></div>}
          {profit != null && profit <= 0
            ? <div className="bep-box warning"><Info size={19} /><p><span>Belum balik modal</span><b>Harga jual di bawah biaya produksi</b></p></div>
            : breakEven != null && <div className="bep-box"><Target size={19} /><p><span>Perkiraan balik modal</span><b>{breakEven} {productUnit} terjual</b></p></div>}
          <p className="finance-disclaimer">Estimasi awal, bukan jaminan keuntungan. Harga bahan perlu diverifikasi.</p>
        </aside>
      </div>

      {launchSteps.length > 0 && (
        <div className="launch-panel">
          <div><small>7 HARI PERTAMA</small><h2>Jangan langsung besar. Mulai dengan bukti.</h2><p>Target pertama bukan untung maksimal, tetapi menemukan produk yang benar-benar ingin dibeli orang.</p></div>
          <ol>
            {launchSteps.map(([title, detail], index) => <li key={title}><span>{index + 1}</span><p><b>{title}</b><small>{detail}</small></p></li>)}
          </ol>
        </div>
      )}
    </section>
  )
}

function ResetWarningDialog({ onConfirm, onCancel }) {
  return (
    <div className="reset-overlay">
      <div className="reset-dialog">
        <div className="reset-dialog-icon"><RefreshCw size={22} /></div>
        <h3>Mulai ulang analisis?</h3>
        <p>Produk atau lokasi kamu sudah berubah. Konsep dan rencana usaha yang sudah dibuat tidak lagi cocok, jadi keduanya akan direset dan kamu perlu memilih konsep lagi dari awal.</p>
        <div className="reset-dialog-actions">
          <button className="secondary-button" onClick={onCancel}>Batal</button>
          <button className="primary-button" onClick={onConfirm}>Ya, mulai ulang</button>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [hasStarted, setHasStarted] = useState(false)
// The four steps are open to everyone; an account is only needed to keep the work.
  // 'canSave' is the server telling us whether saving is configured at all — with no
  // Supabase credentials the buttons stay hidden rather than failing when pressed.
  const [auth, setAuth] = useState({ status: 'checking', enabled: false, canSave: false, user: null })
  const [dialog, setDialog] = useState(null)
  const [openProjectId, setOpenProjectId] = useState(null)
  const [openProjectName, setOpenProjectName] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/session', { credentials: 'same-origin' })
      .then((response) => response.json())
      .then((session) => {
        if (cancelled) return
        setAuth({
          status: 'ready',
          enabled: Boolean(session.authEnabled),
          canSave: Boolean(session.authEnabled && session.canSave),
          user: session.user || null,
        })
      })
      // A failed check must not block the four steps — they never needed an account.
      .catch(() => { if (!cancelled) setAuth({ status: 'ready', enabled: false, canSave: false, user: null }) })
    return () => { cancelled = true }
  }, [])

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {})
    setAuth((prev) => ({ ...prev, user: null }))
    setOpenProjectId(null)
    setOpenProjectName('')
    setDialog(null)
  }, [])

  const enterApp = useCallback(() => {
    setHasStarted(true)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])
  const [step, setStep] = useState(0)
  const [maxStep, setMaxStep] = useState(0)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState('')
  const [marketData, setMarketData] = useState(null)
  const [selectedConcept, setSelectedConcept] = useState(null)
  const [aiConcepts, setAiConcepts] = useState(null)
  const [batch, setBatch] = useState(20)
  const [hasEquipment, setHasEquipment] = useState(true)
  const [resetPending, setResetPending] = useState(null) // { newForm }
  const [form, setForm] = useState({
    product: '',
    village: '',
    district: '',
    city: '',
    latitude: null,
    longitude: null,
  })

  // What the current marketData was actually built from. If the form has drifted
  // from it, every downstream step (konsep, rencana) is describing a different business.
  const analyzedQuery = marketData?.query || null
  const normalized = (value) => String(value ?? '').trim().toLowerCase()
  const isStale = Boolean(analyzedQuery) && (
    normalized(form.product) !== normalized(analyzedQuery.product)
    || form.latitude !== analyzedQuery.latitude
    || form.longitude !== analyzedQuery.longitude
  )
  // NOTE: a stale form must not change anything on screen yet — locking the progress
  // bar here would read as an un-warned reset while the user is still typing.
  // Nothing resets until they confirm; `go` and `analyze` are the gates.

  const runAnalysis = async () => {
    setResetPending(null)
    setIsAnalyzing(true)
    setAnalysisError('')
    try {
      const response = await fetch('/api/market/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Analisis pasar gagal dimuat.')
      setMarketData(result)
      setAiConcepts(null)
      setSelectedConcept(null)
      setBatch(20)
      setHasEquipment(true)
      setIsAnalyzing(false)
      setStep(1)
      setMaxStep(1)
      window.scrollTo({ top: 0, behavior: 'instant' })
    } catch (error) {
      setAnalysisError(error.message)
      setIsAnalyzing(false)
    }
  }

  const analyze = () => {
    if (!Number.isFinite(form.latitude) || !Number.isFinite(form.longitude)) {
      setAnalysisError('Geser pin ke lokasi jualan, lalu tekan “Pilih lokasi” sebelum mengecek pasar.')
      return
    }
    if (isStale) {
      setResetPending(true)
      return
    }
    runAnalysis()
  }

  // Cancelling means "undo my edit", so put the form back to whatever the current
  // analysis was actually built from — otherwise the user has to retype it by hand.
  const cancelReset = () => {
    setResetPending(null)
    if (!analyzedQuery) return
    setForm((current) => ({
      ...current,
      product: analyzedQuery.product ?? current.product,
      village: analyzedQuery.village ?? '',
      district: analyzedQuery.district ?? '',
      city: analyzedQuery.city ?? '',
      latitude: analyzedQuery.latitude,
      longitude: analyzedQuery.longitude,
    }))
  }

  // What a saved plan actually is: the whole four-step state, so reopening one puts
  // the user back exactly where they left off rather than at a blank first step.
  const buildSnapshot = () => ({
    version: 1,
    form,
    marketData,
    aiConcepts,
    selectedConcept,
    batch,
    hasEquipment,
    step,
    maxStep,
  })

  const restoreSnapshot = (project) => {
    const data = project?.data || {}
    if (data.form) setForm(data.form)
    setMarketData(data.marketData ?? null)
    setAiConcepts(data.aiConcepts ?? null)
    setSelectedConcept(data.selectedConcept ?? null)
    if (typeof data.batch === 'number') setBatch(data.batch)
    if (typeof data.hasEquipment === 'boolean') setHasEquipment(data.hasEquipment)
    setMaxStep(typeof data.maxStep === 'number' ? data.maxStep : 0)
    setStep(typeof data.step === 'number' ? data.step : 0)
    setOpenProjectId(project.id)
    setOpenProjectName(project.name || '')
    setHasStarted(true)
    setDialog(null)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  const saveProject = async (name) => {
    const body = { name, data: buildSnapshot() }
    // Reopened projects update in place; a fresh one is created the first time.
    const url = openProjectId ? `/api/projects/${openProjectId}` : '/api/projects'
    const response = await fetch(url, {
      method: openProjectId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result.error || 'Gagal menyimpan projek.')
    setOpenProjectId(result.project?.id || openProjectId)
    setOpenProjectName(name)
  }

  // Pressing Save while signed out shows the sign-in form first, then comes back.
  const requestSave = () => setDialog(auth.user ? 'save' : 'auth-then-save')

  const go = (next) => {
    // Moving forward onto results built from a product/location the user has since
    // edited would show them a plan for a different business — warn first.
    if (next >= 1 && isStale) {
      setResetPending(true)
      return
    }
    setStep(next)
    setMaxStep((prev) => Math.max(prev, next))
    // 'instant', not 'auto': html { scroll-behavior: smooth } makes 'auto' animate,
    // and useStepReveal would then measure panel positions part-way through that
    // animation — marking panels that look above the fold but will not be.
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  const dialogs = (
    <>
      {(dialog === 'auth' || dialog === 'auth-then-save') && (
        <AuthDialog
          onClose={() => setDialog(null)}
          onSignedIn={(user) => {
            setAuth((prev) => ({ ...prev, user }))
            setDialog(dialog === 'auth-then-save' ? 'save' : null)
          }}
        />
      )}
      {dialog === 'save' && (
        <SaveDialog
          defaultName={openProjectName || form.product || ''}
          onClose={() => setDialog(null)}
          onSave={saveProject}
        />
      )}
      {dialog === 'projects' && (
        <ProjectsDialog onClose={() => setDialog(null)} onOpen={restoreSnapshot} />
      )}
    </>
  )

  if (!hasStarted) {
    return <>
      <Landing onStart={enterApp} />
      {dialogs}
    </>
  }

  return (
    <Shell
      step={step}
      maxStep={maxStep}
      setStep={go}
      user={auth.user}
      canSave={auth.canSave}
      onLogout={logout}
      onLogin={() => setDialog('auth')}
      onSave={requestSave}
      onProjects={() => setDialog('projects')}
    >
      {step === 0 && <Intro form={form} setForm={setForm} onAnalyze={analyze} isAnalyzing={isAnalyzing} error={analysisError} />}
      {step === 1 && <MarketAnalysis form={form} data={marketData} onBack={() => go(0)} onNext={() => go(2)} />}
      {step === 2 && <ConceptChoice form={form} selected={selectedConcept} setSelected={setSelectedConcept} onBack={() => go(1)} onNext={() => go(3)} aiConcepts={aiConcepts} setAiConcepts={setAiConcepts} />}
      {step === 3 && <Plan form={form} conceptId={selectedConcept} aiConcepts={aiConcepts} marketData={marketData} batch={batch} setBatch={setBatch} hasEquipment={hasEquipment} setHasEquipment={setHasEquipment} onBack={() => go(2)} />}
      {resetPending && <ResetWarningDialog onConfirm={runAnalysis} onCancel={cancelReset} />}
      {dialogs}
    </Shell>
  )
}
