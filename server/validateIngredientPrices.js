// Run this after every weekly price update: `node server/validateIngredientPrices.js`
// Catches the mistakes that are easy to make by hand and hard to notice in the app —
// a stray "." turning 69000 into 69, a kemasan/isi that doesn't match the linked
// product, a dead link, or a price nobody has looked at in a month.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { toBaseUnit } from './ingredientPriceService.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = resolve(__dirname, 'data/ingredientPrices.json')
const STALE_DAYS = 30

function parseTanggal(value) {
  // Accepts M/D/YYYY (what Excel/Sheets produces) or YYYY-MM-DD.
  if (!value) return null
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3])
  const mdy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value)
  if (mdy) return new Date(+mdy[3], +mdy[1] - 1, +mdy[2])
  return null
}

let raw
try {
  raw = JSON.parse(readFileSync(DB_PATH, 'utf-8'))
} catch (error) {
  console.error(`✗ File JSON rusak: ${error.message}`)
  process.exit(1)
}

const items = raw.items || []
const errors = []
const warnings = []
const seenIds = new Set()

for (const item of items) {
  const tag = `[${item.id}]`

  if (seenIds.has(item.id)) errors.push(`${tag} id duplikat`)
  seenIds.add(item.id)

  const isFilled = item.harga != null || item.judul || item.link
  if (!isFilled) continue // untouched template row — fine, falls back to AI

  // Suspiciously non-round price: almost always a "." meant as a thousands
  // separator that JSON parsed as a decimal point instead (69.000 -> 69).
  if (item.harga != null) {
    if (!Number.isFinite(item.harga) || item.harga <= 0) {
      errors.push(`${tag} harga tidak valid: ${item.harga}`)
    } else if (item.harga < 500) {
      errors.push(`${tag} harga Rp${item.harga} kelihatan seperti salah ketik (mis. "69.000" ditulis dan terbaca sebagai 69) — tulis angka polos tanpa titik, contoh: 69000`)
    } else if (!Number.isInteger(item.harga)) {
      warnings.push(`${tag} harga ${item.harga} punya desimal — biasanya berarti titik ribuan ketlingsut, cek lagi`)
    }
  } else {
    warnings.push(`${tag} judul/link terisi tapi harga masih kosong`)
  }

  if (!item.isi || item.isi <= 0) {
    errors.push(`${tag} isi harus angka > 0 (sekarang: ${item.isi})`)
  }

  // isi vs judul: `isi` is what the price calculation actually uses, so check IT
  // against the package size the product title states — not the free-text `kemasan`
  // label, which may legitimately read like "12 x 65 ml" for a multi-pack.
  if (item.judul && item.isi && item.satuan) {
    const judulMatch = item.judul.match(/(\d[\d.,]*)\s*(kg|gram|gr|g|liter|l|ml)\b/i)
    if (judulMatch) {
      const judulAmount = parseFloat(judulMatch[1].replace(/\.(?=\d{3})/g, '').replace(',', '.'))
      const judulBase = toBaseUnit(judulAmount, judulMatch[2])
      const isiBase = toBaseUnit(item.isi, item.satuan)
      if (judulBase && isiBase && judulBase.type === isiBase.type && judulBase.value > 0) {
        const ratio = isiBase.value / judulBase.value
        // isi should equal one unit (ratio 1) or a whole multi-pack of it (ratio 2..48)
        const isCleanMultiple = Math.abs(ratio - Math.round(ratio)) < 0.01 && Math.round(ratio) >= 1 && Math.round(ratio) <= 48
        if (!isCleanMultiple) {
          warnings.push(`${tag} isi=${item.isi}${item.satuan} tidak cocok dengan ukuran di judul ("${judulMatch[0]}") — cek isi/harga cocok dengan produk yang dilink`)
        }
      }
    }
  }

  if (item.link && !/^https?:\/\/(www\.)?(tokopedia\.com|shopee\.co\.id)\//.test(item.link)) {
    warnings.push(`${tag} link bukan Tokopedia/Shopee, atau formatnya aneh: ${item.link.slice(0, 60)}`)
  }

  const checked = parseTanggal(item.dicekTanggal)
  if (!checked) {
    if (item.harga != null) warnings.push(`${tag} dicekTanggal kosong atau formatnya tidak dikenali`)
  } else {
    const ageDays = Math.round((Date.now() - checked.getTime()) / 86400000)
    if (ageDays > STALE_DAYS) warnings.push(`${tag} terakhir dicek ${ageDays} hari lalu — mungkin sudah waktunya update`)
  }
}

const filledCount = items.filter((i) => i.harga != null).length
console.log(`${items.length} bahan total, ${filledCount} sudah punya harga.\n`)

if (errors.length) {
  console.log(`✗ ${errors.length} ERROR (harus dibetulkan):`)
  errors.forEach((e) => console.log(`  - ${e}`))
  console.log()
}
if (warnings.length) {
  console.log(`⚠ ${warnings.length} PERINGATAN (cek dulu, tapi tidak fatal):`)
  warnings.forEach((w) => console.log(`  - ${w}`))
  console.log()
}
if (!errors.length && !warnings.length) {
  console.log('✓ Semua bersih.')
}

process.exit(errors.length ? 1 : 0)
