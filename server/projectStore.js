import { dbRequest } from './supabase.js'

export { projectStoreConfigured } from './supabase.js'

/**
 * Saved business plans.
 *
 * Every function here takes the userId from the signed session cookie and puts it
 * in the query itself. That is not decoration: the service_role key bypasses row
 * level security, so this scoping is the ONLY thing standing between one user's
 * plans and another's. No function may be called with a userId that came from the
 * request body.
 */

const MAX_NAME = 120
// A saved plan is the app's own form state; 256KB is far above anything the four
// steps produce and well below the point where a row becomes a problem.
const MAX_DATA_BYTES = 256 * 1024

function cleanName(name) {
  const text = typeof name === 'string' ? name.trim() : ''
  if (!text) throw Object.assign(new Error('Nama projek tidak boleh kosong.'), { status: 400 })
  return text.slice(0, MAX_NAME)
}

function cleanData(data) {
  if (data === undefined || data === null) return {}
  if (typeof data !== 'object' || Array.isArray(data)) {
    throw Object.assign(new Error('Isi projek harus berupa objek.'), { status: 400 })
  }
  if (Buffer.byteLength(JSON.stringify(data), 'utf8') > MAX_DATA_BYTES) {
    throw Object.assign(new Error('Isi projek terlalu besar untuk disimpan.'), { status: 413 })
  }
  return data
}

export async function listProjects(userId) {
  const rows = await dbRequest(
    `projects?user_id=eq.${encodeURIComponent(userId)}&select=id,name,created_at,updated_at&order=updated_at.desc`,
  )
  return rows || []
}

export async function getProject(userId, id) {
  const rows = await dbRequest(
    `projects?user_id=eq.${encodeURIComponent(userId)}&id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
  )
  return rows?.[0] || null
}

export async function createProject(userId, { name, data }) {
  const rows = await dbRequest('projects', {
    method: 'POST',
    prefer: 'return=representation',
    body: [{ user_id: userId, name: cleanName(name), data: cleanData(data) }],
  })
  return rows?.[0] || null
}

export async function updateProject(userId, id, { name, data }) {
  const patch = { updated_at: new Date().toISOString() }
  if (name !== undefined) patch.name = cleanName(name)
  if (data !== undefined) patch.data = cleanData(data)

  // The user_id filter is what makes this safe: a request carrying someone else's
  // project id matches no rows rather than editing their plan.
  const rows = await dbRequest(
    `projects?user_id=eq.${encodeURIComponent(userId)}&id=eq.${encodeURIComponent(id)}`,
    { method: 'PATCH', prefer: 'return=representation', body: patch },
  )
  return rows?.[0] || null
}

export async function deleteProject(userId, id) {
  const rows = await dbRequest(
    `projects?user_id=eq.${encodeURIComponent(userId)}&id=eq.${encodeURIComponent(id)}`,
    { method: 'DELETE', prefer: 'return=representation' },
  )
  return Boolean(rows?.length)
}
