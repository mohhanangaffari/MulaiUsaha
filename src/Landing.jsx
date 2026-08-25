import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  BadgeCheck,
  Compass,
  ExternalLink,
  Lightbulb,
  MapPin,
  Search,
  Star,
  Store,
  TrendingUp,
  WalletCards,
  X,
} from 'lucide-react'
import './landing.css'

const NAV_LINKS = [
  { label: 'Cara kerja', href: '#cara-kerja' },
  { label: 'Fitur', href: '#fitur' },
  { label: 'Untuk siapa', href: '#untuk-siapa' },
]

const STEPS = [
  { icon: Compass, title: 'Sebut ide & tunjuk lokasi', body: 'Tulis mau jualan apa, geser pin ke titik jualanmu. Wilayahnya kebaca otomatis.' },
  { icon: Search, title: 'Lihat siapa pesaingmu', body: 'Semua usaha sejenis dalam radius 3 km, lengkap rating, jarak, jam buka, dan kontak.' },
  { icon: Lightbulb, title: 'Pilih cara masuk pasar', body: 'Tiga konsep yang beda strategi — bukan sekadar versi murah, sedang, dan mahal.' },
  { icon: WalletCards, title: 'Bawa pulang hitungannya', body: 'Bahan, modal awal, HPP, harga jual, sampai berapa porsi untuk balik modal.' },
]

const FEATURES = [
  { icon: Store, title: 'Pesaing nyata', body: 'Diambil langsung dari Google Places. Bisa kamu klik dan cek sendiri listing tokonya.' },
  { icon: BadgeCheck, title: 'Harga bahan dicek manual', body: '51 bahan pokok diperiksa satu per satu ke toko online — ada link produk dan tanggal ceknya.' },
  { icon: MapPin, title: 'Pemasok di sekitarmu', body: 'Toko bahan terdekat dikelompokkan per kategori belanja, langsung tersambung ke Google Maps.' },
]

const AUDIENCE = [
  { tag: 'Baru mau mulai', body: 'Punya ide jualan tapi belum tahu pasarnya ada atau tidak, dan berapa modal yang perlu disiapkan.' },
  { tag: 'Sudah jualan', body: 'Warung sudah jalan tapi belum pernah hitung HPP, jadi belum yakin untungnya datang dari mana.' },
  { tag: 'Mau berkembang', body: 'Berencana tambah menu atau pindah lokasi, dan ingin mengecek dulu sebelum keluar modal lagi.' },
]

const STATS = [
  { value: '3 km', label: 'Radius pemetaan pesaing di sekitar lokasi jualanmu' },
  { value: '51', label: 'Bahan pokok dengan harga yang diverifikasi manual' },
  { value: '4', label: 'Langkah dari ide mentah sampai rencana usaha jadi' },
  { value: 'Rp0', label: 'Biaya untuk mencoba dan melihat hasilnya sendiri' },
]

const HONESTY = [
  { badge: 'PASAR', tone: 'blue', body: 'Harga nyata dari toko online, sudah kami cek manual. Ada link produk dan tanggal pengecekannya.' },
  { badge: 'ESTIMASI', tone: 'grey', body: 'Perkiraan AI untuk bahan di luar daftar terverifikasi. Ditandai jelas supaya kamu tahu ini tebakan.' },
  { badge: 'SENDIRI', tone: 'green', body: 'Harga yang kamu isi sendiri. Begitu diisi, semua hitungan langsung ikut menyesuaikan.' },
]

const TOKPED = {
  minyak: 'https://www.tokopedia.com/tobakingmurahonline/sunco-minyak-goreng-2-liter-pouch',
  tapioka: 'https://www.tokopedia.com/tobakingmurahonline/tepung-tapioka-kanji-rose-brand-rosebrand-500gr',
}

// Illustrative only — the mockup is a still of the product, not live data.
const RIVAL_REVIEWS = {
  somay: [
    { rating: '4,8', author: 'Rani P.', when: '2 minggu lalu', text: 'Bumbu kacangnya medok, nggak encer. Porsinya juga pas buat harga segini.' },
    { rating: '5,0', author: 'Bayu S.', when: '1 bulan lalu', text: 'Selalu ramai pas jam pulang sekolah, jadi somaynya nggak pernah basi.' },
    { rating: '4,0', author: 'Tika M.', when: '3 bulan lalu', text: 'Rasanya enak, cuma antrenya lumayan lama kalau datang di atas jam lima sore. Sebaiknya pesan lebih awal.' },
    { rating: '4,7', author: 'Joko H.', when: '3 minggu lalu', text: 'Kentang sama tahunya masih anget pas dibungkus. Sambelnya bisa minta pedes banget.' },
    { rating: '5,0', author: 'Nadia F.', when: '5 hari lalu', text: 'Murah, bersih, dan abangnya ramah.' },
    { rating: '4,4', author: 'Eko W.', when: '2 bulan lalu', text: 'Enak, tapi kadang kehabisan kalau datang kemalaman.' },
  ],
  mulia: [
    { rating: '4,6', author: 'Dimas A.', when: '1 bulan lalu', text: 'Langganan tiap pulang kerja. Siomay ikannya kerasa, kentangnya empuk.' },
    { rating: '4,5', author: 'Sari W.', when: '2 bulan lalu', text: 'Tempatnya bersih dan pelayanannya cepat.' },
    { rating: '4,8', author: 'Andre K.', when: '1 minggu lalu', text: 'Porsi paket isi lima paling worth it. Bumbunya nggak bikin eneg walau makan banyak.' },
    { rating: '4,2', author: 'Lina S.', when: '4 bulan lalu', text: 'Standar sih, tapi harganya masuk akal buat lokasi seramai ini.' },
    { rating: '5,0', author: 'Putra M.', when: '2 minggu lalu', text: 'Bisa pesan lewat WhatsApp dan dianter. Praktis banget buat kantor.' },
  ],
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4 10h10.2M10.4 5.6 15.2 10l-4.8 4.4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* A sketch of the real plan screen. It deliberately straddles the orange hero and
   the cream section below so the fold has something to bite into. */

// Mirrors the in-app competitor bubble: one review at a time, held for a spell
// that scales with how much there is to read, then swapped for the next.
function reviewDuration(text) {
  return Math.min(8000, Math.max(3000, 2600 + text.length * 34))
}

function randomIndex(length) {
  return Math.floor(Math.random() * length)
}

// Steps forward by a random amount that is never a whole lap, so the next review is
// always a different one — no fixed running order to notice.
function nextIndex(current, length) {
  if (length < 2) return current
  return (current + 1 + Math.floor(Math.random() * (length - 1))) % length
}

function ReviewBubble({ reviews, active }) {
  const [index, setIndex] = useState(() => randomIndex(reviews.length))

  // A fresh opening review on every hover, otherwise the same name greets the
  // visitor each time and the whole thing reads as canned.
  useEffect(() => {
    if (!active) return
    setIndex(randomIndex(reviews.length))
  }, [active, reviews])

  useEffect(() => {
    if (!active || reviews.length < 2) return undefined
    const current = reviews[index % reviews.length]
    const timer = window.setTimeout(
      () => setIndex((i) => nextIndex(i, reviews.length)),
      reviewDuration(current.text),
    )
    return () => window.clearTimeout(timer)
  }, [active, index, reviews])

  const review = reviews[index % reviews.length]
  return (
    <span
      className="lp-bubble"
      aria-hidden="true"
      key={index}
      style={{ '--dur': `${reviewDuration(review.text)}ms` }}
    >
      <span className="lp-bubble__meta">
        <span><Star size={9} fill="currentColor" /> {review.rating}</span>
        <small>{review.when}</small>
      </span>
      <blockquote>{'“'}{review.text}{'”'}</blockquote>
      <span className="lp-bubble__foot">
        <i>{review.author.charAt(0)}</i>
        <b>{review.author}</b>
      </span>
    </span>
  )
}

function RivalRow({ tone, initial, name, meta, rating, reviews, delay }) {
  const [hovering, setHovering] = useState(false)
  return (
    <div
      className={`lp-rival lp-pin ${hovering ? 'is-hover' : ''}`}
      style={{ '--d': delay }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <i className={tone ? `lp-av lp-av--${tone}` : 'lp-av'}>{initial}</i>
      <p><b>{name}</b><small>{meta}</small></p>
      <span className="lp-rival__rating"><Star size={10} fill="currentColor" /> {rating}</span>
      <ReviewBubble reviews={reviews} active={hovering} />
    </div>
  )
}

const SCORE = 78

function ProductPeek() {
  const scoreRef = useRef(null)

  // Counts the score up rather than snapping to it. Driven by rAF against elapsed
  // time so it stays correct if frames are dropped, and skipped entirely when the
  // visitor asked for reduced motion.
  useEffect(() => {
    const node = scoreRef.current
    if (!node) return undefined
    // Resting markup says 0, so anything that prevents the counter from running
    // would leave a permanent "0" on screen. Both escape hatches land on the real
    // figure instead.
    if (typeof requestAnimationFrame !== 'function'
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      node.textContent = String(SCORE)
      return undefined
    }
    const START = 1500
    const DURATION = 1100
    let frame = 0
    let began = 0
    const tick = (now) => {
      if (!began) began = now
      const elapsed = now - began - START
      if (elapsed < 0) { frame = requestAnimationFrame(tick); return }
      const progress = Math.min(1, elapsed / DURATION)
      const eased = 1 - Math.pow(1 - progress, 3)
      node.textContent = String(Math.round(eased * SCORE))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    node.textContent = '0'
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div className="lp-peek" role="group" aria-label="Contoh tampilan rencana usaha untuk produk somay">
      <div className="lp-peek__bar"><i aria-hidden="true" /><i aria-hidden="true" /><i aria-hidden="true" /><span>Rencana usaha · somay</span></div>
      <div className="lp-peek__body">
        <div className="lp-peek__left">
          <div className="lp-peek__head lp-pin" style={{ '--d': '1.15s' }}><small>POTENSI PASAR</small><span className="lp-tag lp-tag--green">Menjanjikan</span></div>
          <div className="lp-peek__score">
            <div className="lp-ring"><b ref={scoreRef}>0</b><i>/100</i></div>
            <ul className="lp-metrics">
              <li className="lp-pin" style={{ '--d': '1.45s' }}><span>Sinyal permintaan</span><em style={{ '--w': '82%', '--d': '1.55s' }} /></li>
              <li className="lp-pin" style={{ '--d': '1.55s' }}><span>Ruang bersaing</span><em style={{ '--w': '54%', '--d': '1.65s' }} /></li>
              <li className="lp-pin" style={{ '--d': '1.65s' }}><span>Peluang pembeda</span><em style={{ '--w': '71%', '--d': '1.75s' }} /></li>
            </ul>
          </div>
          <RivalRow initial="S" name="Somay Kota Gajah" meta="Kedai · 1,2 km" rating="4,8" reviews={RIVAL_REVIEWS.somay} delay="1.85s" />
          <RivalRow initial="M" tone="b" name="Mulia Siomay" meta="Restoran · 2,0 km" rating="4,6" reviews={RIVAL_REVIEWS.mulia} delay="1.95s" />
        </div>
        <div className="lp-peek__right">
          <div className="lp-peek__head lp-pin" style={{ '--d': '1.25s' }}><small>RENCANA USAHA</small></div>
          <a className="lp-line lp-line--link lp-pin" style={{ '--d': '1.5s' }} href={TOKPED.minyak} target="_blank" rel="noreferrer">
            <i className="lp-dot lp-dot--blue"><BadgeCheck size={11} /></i>
            <p><b>Minyak goreng <ExternalLink size={9} /></b><small>Harga pasar · dicek 24 Agu</small></p>
            <span>Rp29.250<em>PASAR</em></span>
          </a>
          <a className="lp-line lp-line--link lp-pin" style={{ '--d': '1.62s' }} href={TOKPED.tapioka} target="_blank" rel="noreferrer">
            <i className="lp-dot lp-dot--blue"><BadgeCheck size={11} /></i>
            <p><b>Tepung tapioka <ExternalLink size={9} /></b><small>Harga pasar · dicek 24 Agu</small></p>
            <span>Rp9.000<em>PASAR</em></span>
          </a>
          <div className="lp-line lp-pin" style={{ '--d': '1.74s' }}><i className="lp-dot"><X size={11} /></i><p><b>Bumbu kacang</b><small>Estimasi AI</small></p><span>Rp12.000<em className="lp-est">ESTIMASI</em></span></div>
          <div className="lp-peek__sum">
            <div className="lp-pin" style={{ '--d': '1.95s' }}><span>HPP / porsi</span><b>Rp3.320</b></div>
            <div className="lp-pin" style={{ '--d': '2.05s' }}><span>Harga jual</span><b className="lp-or">Rp12.000</b></div>
            <div className="lp-pin" style={{ '--d': '2.15s' }}><span>Laba / porsi</span><b className="lp-gr">+Rp8.680</b></div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Landing({ onStart }) {
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!menuOpen) return undefined
    const close = (event) => event.key === 'Escape' && setMenuOpen(false)
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [menuOpen])

  // Sections fade up as they scroll in. The resting state is invisible, so every
  // path that could stop the observer — no support, reduced motion, or an observer
  // that never reports — still ends with the content shown.
  useEffect(() => {
    const targets = Array.from(document.querySelectorAll('.lp-reveal'))
    if (!targets.length) return undefined
    const revealAll = () => targets.forEach((el) => el.classList.add('is-in'))

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || typeof IntersectionObserver === 'undefined') {
      revealAll()
      return undefined
    }

    // Every target starts below the fold, so "nothing has intersected yet" is the
    // normal state for a visitor sitting at the top — checking that would fire the
    // failsafe and dump the whole page in unanimated. What actually proves the
    // observer works is that it reports at all: it delivers an initial entry per
    // target on the first frame, off-screen ones included.
    let observerReported = false
    const observer = new IntersectionObserver(
      (entries) => {
        observerReported = true
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          entry.target.classList.add('is-in')
          observer.unobserve(entry.target)
        })
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.08 },
    )
    targets.forEach((el) => observer.observe(el))
    const failsafe = window.setTimeout(() => { if (!observerReported) revealAll() }, 2500)
    return () => { window.clearTimeout(failsafe); observer.disconnect() }
  }, [])

  return (
    <div className="landing">
      {/* ---------- HERO: full orange block ---------- */}
      <section className="lp-hero" id="top">
        <div className="lp-grain" aria-hidden="true"><i /></div>

        <header className="lp-nav">
          <a className="lp-logo lp-in" href="#top" aria-label="MulaiUsaha" style={{ '--d': '.05s' }}>
            <span className="lp-logo__mark"><TrendingUp size={17} strokeWidth={3} /></span>
            <span>Mulai<em>Usaha</em></span>
          </a>
          <nav className="lp-nav__links" aria-label="Utama">
            {NAV_LINKS.map((link, index) => (
              <a className="lp-in" key={link.label} href={link.href} style={{ '--d': `${0.12 + index * 0.06}s` }}>{link.label}</a>
            ))}
          </nav>
          <button className="lp-btn lp-btn--white lp-nav__cta lp-in" style={{ '--d': '.3s' }} onClick={onStart}>
            Coba gratis <span className="lp-btn__icon"><ArrowIcon /></span>
          </button>
          <button
            className="lp-burger"
            aria-label={menuOpen ? 'Tutup menu' : 'Buka menu'}
            aria-expanded={menuOpen}
            aria-controls="lp-mobile-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <i /><i /><i />
          </button>
        </header>

        <div className="lp-mobile-menu" id="lp-mobile-menu" hidden={!menuOpen}>
          {NAV_LINKS.map((link) => <a key={link.label} href={link.href} onClick={() => setMenuOpen(false)}>{link.label}</a>)}
          <button className="lp-btn lp-btn--white" onClick={onStart}>
            Coba gratis <span className="lp-btn__icon"><ArrowIcon /></span>
          </button>
        </div>

        <div className="lp-hero__inner">
          <span className="lp-kicker lp-in" style={{ '--d': '.3s' }}>Untuk pedagang makanan &amp; minuman</span>
          <h1 className="lp-h1">
            <span className="lp-mask"><span className="lp-rise" style={{ '--d': '.38s' }}>Jangan buka usaha makanan</span></span>
            <span className="lp-mask">
              <span className="lp-rise" style={{ '--d': '.5s' }}>
                <span className="lp-h1__u">modal nekat.</span>
              </span>
            </span>
          </h1>
          <p className="lp-sub lp-in" style={{ '--d': '.6s' }}>
            Cek dulu siapa pesaingmu, berapa modal yang benar-benar dibutuhkan, dan
            berapa harga jual yang masih laku di daerahmu — sebelum uangmu keluar.
          </p>
          <div className="lp-cta-row">
            <button className="lp-btn lp-btn--white lp-btn--lg lp-in" style={{ '--d': '.7s' }} onClick={onStart}>
              Coba gratis <span className="lp-btn__icon"><ArrowIcon /></span>
            </button>
            <a className="lp-btn lp-btn--outline lp-btn--lg lp-in" style={{ '--d': '.78s' }} href="#cara-kerja">Lihat cara kerjanya</a>
          </div>
          <p className="lp-note lp-in" style={{ '--d': '.88s' }}>Tanpa daftar dulu · Tanpa biaya · Hasilnya bisa kamu bawa pulang</p>
        </div>

        <ProductPeek />
      </section>

      {/* ---------- CREAM: how it works ---------- */}
      <section className="lp-cream" id="cara-kerja">
        <div className="lp-wrap">
          <div className="lp-head lp-reveal">
            <span className="lp-eyebrow">Cara kerja</span>
            <h2>Empat langkah, tidak pakai istilah ribet</h2>
          </div>
          <ol className="lp-steps">
            {STEPS.map((step, index) => (
              <li className="lp-step lp-reveal" key={step.title} style={{ '--i': index }}>
                <span className="lp-step__n">{String(index + 1).padStart(2, '0')}</span>
                <span className="lp-step__ic"><step.icon size={20} /></span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------- CREAM: features ---------- */}
      <section className="lp-cream lp-cream--tight" id="fitur">
        <div className="lp-wrap">
          <div className="lp-head lp-reveal">
            <span className="lp-eyebrow">Fitur</span>
            <h2>Angka yang ada sumbernya</h2>
          </div>
          <div className="lp-feat-grid">
            {FEATURES.map((feature, index) => (
              <article className="lp-feat lp-reveal" key={feature.title} style={{ '--i': index }}>
                <span className="lp-feat__ic"><feature.icon size={19} /></span>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- DARK: numbers & honesty ---------- */}
      <section className="lp-dark">
        <div className="lp-wrap">
          <div className="lp-stats">
            {STATS.map((stat, index) => (
              <div className="lp-stat lp-reveal" key={stat.value} style={{ '--i': index }}>
                <b>{stat.value}</b>
                <span>{stat.label}</span>
              </div>
            ))}
          </div>

          <div className="lp-honesty">
            <div className="lp-head lp-head--dark lp-reveal">
              <span className="lp-eyebrow lp-eyebrow--dark">Transparansi</span>
              <h2>Kami bilang mana yang pasti, mana yang tebakan</h2>
              <p>Tiap harga di rencana usahamu diberi label, jadi kamu tahu persis mana yang bisa dipegang.</p>
            </div>
            <div className="lp-badges">
              {HONESTY.map((item, index) => (
                <article className="lp-badge-card lp-reveal" key={item.badge} style={{ '--i': index }}>
                  <span className={`lp-bdg lp-bdg--${item.tone}`}>{item.badge}</span>
                  <p>{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- CREAM: audience ---------- */}
      <section className="lp-cream" id="untuk-siapa">
        <div className="lp-wrap">
          <div className="lp-head lp-reveal">
            <span className="lp-eyebrow">Untuk siapa</span>
            <h2>Dibuat untuk yang jualan sendiri</h2>
          </div>
          <div className="lp-aud-grid">
            {AUDIENCE.map((item, index) => (
              <article className="lp-aud lp-reveal" key={item.tag} style={{ '--i': index }}>
                <span className="lp-aud__tag">{item.tag}</span>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- CLOSING ---------- */}
      <section className="lp-close">
        <div className="lp-close__panel lp-reveal">
          <div className="lp-grain" aria-hidden="true"><i /></div>
          <div className="lp-close__body">
            <h2>Cek dulu.<br />Baru keluar modal.</h2>
            <p>Dua menit untuk tahu apakah ide jualanmu punya pasar di sekitar lokasimu.</p>
            <button className="lp-btn lp-btn--white lp-btn--lg" onClick={onStart}>
              Coba gratis sekarang <span className="lp-btn__icon"><ArrowIcon /></span>
            </button>
          </div>
        </div>
      </section>

      <footer className="lp-footer">
        <span className="lp-logo lp-logo--sm">
          <span className="lp-logo__mark"><TrendingUp size={14} strokeWidth={3} /></span>
          <span>Mulai<em>Usaha</em></span>
        </span>
        <p>Keputusan lebih yakin, langkah usaha lebih nyata.</p>
        <small>Prototype Building Indonesia 2026</small>
      </footer>
    </div>
  )
}
