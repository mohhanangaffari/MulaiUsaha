import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Info, ShieldCheck } from 'lucide-react'

const GIS_SRC = 'https://accounts.google.com/gsi/client'

/**
 * Loads Google Identity Services once and resolves when the global is ready.
 * Reused across mounts — the script tag stays in the document after the first load,
 * and a second <script> for the same src would re-run the library.
 */
let gisPromise = null
function loadGoogleIdentity() {
  if (window.google?.accounts?.id) return Promise.resolve()
  if (gisPromise) return gisPromise
  gisPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = GIS_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => {
      // Let a later attempt retry rather than caching the failure forever.
      gisPromise = null
      reject(new Error('Skrip Google tidak bisa dimuat. Periksa koneksi internet.'))
    }
    document.head.appendChild(script)
  })
  return gisPromise
}

export default function SignIn({ googleClientId, onSignedIn, onBack }) {
  const buttonRef = useRef(null)
  const [status, setStatus] = useState({ type: 'loading', message: 'Menyiapkan tombol masuk…' })

  useEffect(() => {
    let cancelled = false

    const submit = async (credential) => {
      setStatus({ type: 'loading', message: 'Memverifikasi akunmu…' })
      try {
        const response = await fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // The session comes back as an httpOnly cookie, so the request has to be
          // allowed to carry and receive credentials.
          credentials: 'same-origin',
          body: JSON.stringify({ credential }),
        })
        const result = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(result.error || 'Gagal masuk. Coba lagi.')
        if (!cancelled) onSignedIn(result.user)
      } catch (error) {
        if (!cancelled) setStatus({ type: 'error', message: error.message })
      }
    }

    loadGoogleIdentity()
      .then(() => {
        if (cancelled || !buttonRef.current) return
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: (response) => submit(response.credential),
        })
        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text: 'signin_with',
          locale: 'id',
          width: 280,
        })
        setStatus({ type: 'ready', message: '' })
      })
      .catch((error) => { if (!cancelled) setStatus({ type: 'error', message: error.message }) })

    return () => { cancelled = true }
  }, [googleClientId, onSignedIn])

  return (
    <div className="signin-page">
      <div className="signin-card">
        <span className="signin-mark"><ShieldCheck size={22} /></span>
        <small>MASUK DULU</small>
        <h1>Simpan progres rencana usahamu</h1>
        <p>
          Masuk dengan akun Google supaya ide, lokasi, dan rencana yang sudah kamu susun
          tetap ada saat kamu kembali.
        </p>

        <div className="signin-button-slot">
          <div ref={buttonRef} />
          {status.type === 'loading' && <span className="signin-status">{status.message}</span>}
        </div>

        {status.type === 'error' && (
          <p className="signin-error"><Info size={15} /><span>{status.message}</span></p>
        )}

        <ul className="signin-promises">
          <li>Kami hanya menyimpan nama, email, dan foto profil Google-mu.</li>
          <li>Tidak ada kata sandi yang dibuat atau disimpan di sini.</li>
        </ul>

        <button type="button" className="signin-back" onClick={onBack}>
          <ArrowLeft size={15} /> Kembali ke beranda
        </button>
      </div>
    </div>
  )
}
