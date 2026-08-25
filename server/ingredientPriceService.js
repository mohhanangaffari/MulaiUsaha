import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = resolve(__dirname, 'data/ingredientPrices.json')

// Mass/volume units convert freely (kg<->gram, liter<->ml). Count-style units
// ("pcs", "papan", "pack"...) only match themselves — a price per "papan" tells
// us nothing about a price per "pcs", so those are left for the AI to estimate.
const UNIT_TYPES = {
  kg: { type: 'mass', factor: 1000 },
  kilogram: { type: 'mass', factor: 1000 },
  gram: { type: 'mass', factor: 1 },
  gr: { type: 'mass', factor: 1 },
  g: { type: 'mass', factor: 1 },
  liter: { type: 'volume', factor: 1000 },
  l: { type: 'volume', factor: 1000 },
  ml: { type: 'volume', factor: 1 },
  mililiter: { type: 'volume', factor: 1 },
}

let cachedDb = null
let cachedMtimeMs = 0

export function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Generic "one of something" words that Indonesian recipes use interchangeably.
// Without folding these together, a database entry priced in "pcs" silently fails
// to match an AI ingredient measured in "buah" and falls back to a guessed price.
const COUNT_SYNONYMS = new Set(['pcs', 'buah', 'biji', 'butir', 'bungkus', 'potong', 'lembar', 'batang'])

function unitInfo(unit) {
  const key = normalize(unit)
  if (UNIT_TYPES[key]) return UNIT_TYPES[key]
  return { type: 'count', factor: 1, raw: COUNT_SYNONYMS.has(key) ? 'piece' : key }
}

// Converts `amount unit` into its smallest base unit (grams or ml), so quantities
// in different units of the same kind can be compared. Returns null for count-style
// units (pcs, papan...), which have no common base to convert into.
export function toBaseUnit(amount, unit) {
  const info = unitInfo(unit)
  if (info.type === 'count') return null
  return { value: amount * info.factor, type: info.type }
}

// Reloads from disk when the file changes so a weekly edit takes effect without
// restarting the server — this file is meant to be hand-edited routinely.
function loadDb() {
  let stat
  try {
    stat = statSync(DB_PATH)
  } catch {
    return []
  }
  if (cachedDb && stat.mtimeMs === cachedMtimeMs) return cachedDb

  const raw = JSON.parse(readFileSync(DB_PATH, 'utf-8'))
  const items = (raw.items || [])
    .filter((item) => Number.isFinite(item.harga) && item.harga > 0 && item.isi > 0)
    .map((item) => ({
      ...item,
      _searchTerms: [item.nama, ...(item.alias || [])].map(normalize).filter(Boolean),
    }))
  cachedDb = items
  cachedMtimeMs = stat.mtimeMs
  return items
}

// Canonical names to hand the AI so it reuses them verbatim instead of inventing
// slightly different wording that then fails to match against the price database.
export function listIngredientNames() {
  return loadDb().map((item) => item.nama)
}

// Lets callers key their own caches to the price file's last edit, so a weekly
// price update takes effect immediately instead of waiting out a stale TTL.
export function getDbVersion() {
  loadDb()
  return cachedMtimeMs
}

export function matchIngredient(aiName) {
  const db = loadDb()
  const needle = normalize(aiName)
  if (!needle) return null

  const exact = db.find((item) => item._searchTerms.includes(needle))
  if (exact) return exact

  // Substring match: the AI's often-verbose name contains one of our terms.
  // Keep the longest matching term so "gula pasir" doesn't lose to "gula" when
  // an AI name like "Gula Pasir Kristal Putih Lokal" contains both.
  let best = null
  let bestTermLength = 0
  for (const item of db) {
    for (const term of item._searchTerms) {
      if (term.length < 4) continue
      if (needle.includes(term) && term.length > bestTermLength) {
        bestTermLength = term.length
        best = item
      }
    }
  }
  return best
}

function priceForQuantity(dbItem, qty, unit) {
  const dbUnit = unitInfo(dbItem.satuan)
  const aiUnit = unitInfo(unit)
  if (dbUnit.type !== aiUnit.type) return null
  if (dbUnit.type === 'count' && dbUnit.raw !== aiUnit.raw) return null

  const pricePerBaseUnit = dbItem.harga / (dbItem.isi * dbUnit.factor)
  const cost = Math.round(pricePerBaseUnit * qty * aiUnit.factor)
  return Number.isFinite(cost) && cost > 0 ? cost : null
}

// Looks up a real, user-verified price for an AI ingredient (name + quantity needed
// for 50 portions, in the AI's own unit). Returns null on no match or unit mismatch —
// callers should keep the AI's own estimate in that case.
export function priceLookup(aiName, qty, unit) {
  const item = matchIngredient(aiName)
  if (!item) return null
  const cost = priceForQuantity(item, qty, unit)
  if (cost == null) return null
  return {
    cost,
    matchedName: item.nama,
    link: item.link || null,
    checkedAt: item.dicekTanggal || null,
  }
}
