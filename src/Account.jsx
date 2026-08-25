import { useEffect, useState } from 'react'
import { Check, FolderOpen, Info, Loader2, LogIn, Trash2, X } from 'lucide-react'

const post = async (url, body) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // The session is an httpOnly cookie, so every call has to carry credentials.
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'Terjadi kesalahan. Coba lagi.')
  return result
}

/** Sign in or register. One form, because the fields are identical. */
export function AuthDialog({ mode: initialMode = 'login', onClose, onSignedIn }) {
  const [mode, setMode] = useState(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const close = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose])

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = await post(`/api/auth/${mode === 'login' ? 'login' : 'register'}`, { email, password })
      onSignedIn(result.user)
    } catch (failure) {
      setError(failure.message)
      setBusy(false)
    }
  }

  const registering = mode === 'register'

  return (
    <div className="account-overlay" role="dialog" aria-modal="true" aria-label={registering ? 'Buat akun' : 'Masuk'}>
      <form className="account-dialog" onSubmit={submit}>
        <button type="button" className="account-dialog-close" onClick={onClose} aria-label="Tutup"><X size={18} /></button>
        <span className="account-dialog-mark"><LogIn size={20} /></span>
        <small>{registering ? 'BUAT AKUN' : 'MASUK'}</small>
        <h2>{registering ? 'Simpan rencana usahamu' : 'Lanjutkan rencana usahamu'}</h2>
        <p>{registering
          ? 'Dengan akun, rencana yang sudah kamu susun bisa dibuka lagi kapan saja.'
          : 'Masuk untuk membuka kembali projek yang sudah kamu simpan.'}</p>

        <label>
          <span>Email</span>
          <input
            type="email" value={email} required autoComplete="email" autoFocus
            onChange={(event) => setEmail(event.target.value)} placeholder="nama@email.com"
          />
        </label>
        <label>
          <span>Kata sandi</span>
          <input
            type="password" value={password} required minLength={8}
            autoComplete={registering ? 'new-password' : 'current-password'}
            onChange={(event) => setPassword(event.target.value)} placeholder="Minimal 8 karakter"
          />
        </label>

        {error && <p className="account-error"><Info size={15} /><span>{error}</span></p>}

        <button type="submit" className="primary-button large" disabled={busy}>
          {busy ? <><Loader2 size={16} className="spin" /> Memproses…</> : (registering ? 'Buat akun' : 'Masuk')}
        </button>

        <button
          type="button" className="account-switch"
          onClick={() => { setMode(registering ? 'login' : 'register'); setError('') }}
        >
          {registering ? 'Sudah punya akun? Masuk' : 'Belum punya akun? Buat akun'}
        </button>
      </form>
    </div>
  )
}

/** The list of saved plans, and the place to open or delete one. */
export function ProjectsDialog({ onClose, onOpen }) {
  const [state, setState] = useState({ status: 'loading', projects: [], error: '' })
  const [busyId, setBusyId] = useState(null)

  const load = async () => {
    setState((prev) => ({ ...prev, status: 'loading' }))
    try {
      const response = await fetch('/api/projects', { credentials: 'same-origin' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Gagal memuat projek.')
      setState({ status: 'ready', projects: result.projects || [], error: '' })
    } catch (failure) {
      setState({ status: 'error', projects: [], error: failure.message })
    }
  }

  useEffect(() => { load() }, [])
  useEffect(() => {
    const close = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose])

  const open = async (id) => {
    setBusyId(id)
    try {
      const response = await fetch(`/api/projects/${id}`, { credentials: 'same-origin' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Gagal membuka projek.')
      onOpen(result.project)
    } catch (failure) {
      setState((prev) => ({ ...prev, error: failure.message }))
      setBusyId(null)
    }
  }

  const remove = async (id) => {
    setBusyId(id)
    try {
      const response = await fetch(`/api/projects/${id}`, { method: 'DELETE', credentials: 'same-origin' })
      if (!response.ok) throw new Error('Gagal menghapus projek.')
      setState((prev) => ({ ...prev, projects: prev.projects.filter((p) => p.id !== id) }))
    } catch (failure) {
      setState((prev) => ({ ...prev, error: failure.message }))
    }
    setBusyId(null)
  }

  const when = (row) => new Date(row.updated_at || row.created_at)
    .toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="account-overlay" role="dialog" aria-modal="true" aria-label="Projek tersimpan">
      <div className="account-dialog projects-dialog">
        <button type="button" className="account-dialog-close" onClick={onClose} aria-label="Tutup"><X size={18} /></button>
        <span className="account-dialog-mark"><FolderOpen size={20} /></span>
        <small>PROJEK SAYA</small>
        <h2>Rencana yang sudah kamu simpan</h2>

        {state.status === 'loading' && <p className="projects-note"><Loader2 size={15} className="spin" /> Memuat…</p>}
        {state.error && <p className="account-error"><Info size={15} /><span>{state.error}</span></p>}

        {state.status === 'ready' && state.projects.length === 0 && (
          <p className="projects-note">Belum ada projek tersimpan. Susun rencanamu, lalu tekan “Simpan projek”.</p>
        )}

        {state.projects.length > 0 && (
          <ul className="projects-list">
            {state.projects.map((project) => (
              <li key={project.id}>
                <button type="button" className="projects-open" onClick={() => open(project.id)} disabled={busyId === project.id}>
                  <b>{project.name}</b>
                  <small>Diperbarui {when(project)}</small>
                </button>
                <button
                  type="button" className="projects-delete" onClick={() => remove(project.id)}
                  disabled={busyId === project.id} aria-label={`Hapus ${project.name}`}
                ><Trash2 size={15} /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/** Asks for a name, then hands it back. Used by the Save button. */
export function SaveDialog({ defaultName, onClose, onSave }) {
  const [name, setName] = useState(defaultName || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    const close = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose])

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await onSave(name.trim())
      setDone(true)
      window.setTimeout(onClose, 900)
    } catch (failure) {
      setError(failure.message)
      setBusy(false)
    }
  }

  return (
    <div className="account-overlay" role="dialog" aria-modal="true" aria-label="Simpan projek">
      <form className="account-dialog" onSubmit={submit}>
        <button type="button" className="account-dialog-close" onClick={onClose} aria-label="Tutup"><X size={18} /></button>
        <span className="account-dialog-mark">{done ? <Check size={20} /> : <FolderOpen size={20} />}</span>
        <small>SIMPAN PROJEK</small>
        <h2>{done ? 'Tersimpan' : 'Beri nama rencana ini'}</h2>
        {!done && (
          <>
            <p>Nama ini yang akan kamu lihat di daftar projek nanti.</p>
            <label>
              <span>Nama projek</span>
              <input
                value={name} required autoFocus maxLength={120}
                onChange={(event) => setName(event.target.value)} placeholder="Contoh: Ayam geprek Rajabasa"
              />
            </label>
            {error && <p className="account-error"><Info size={15} /><span>{error}</span></p>}
            <button type="submit" className="primary-button large" disabled={busy || !name.trim()}>
              {busy ? <><Loader2 size={16} className="spin" /> Menyimpan…</> : 'Simpan'}
            </button>
          </>
        )}
      </form>
    </div>
  )
}
