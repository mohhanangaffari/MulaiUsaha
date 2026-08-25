import { listIngredientNames, priceLookup, getDbVersion } from './ingredientPriceService.js'

const cache = new Map()
const CACHE_TTL = 24 * 60 * 60 * 1000

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

const SYSTEM_PROMPT = `Kamu adalah konsultan usaha kecil Indonesia yang berpengalaman.
Tugasmu: menghasilkan daftar bahan, peralatan, dan langkah awal yang SPESIFIK dan REALISTIS untuk usaha kecil di Indonesia.
Selalu kembalikan HANYA JSON valid tanpa teks lain, tanpa markdown code block.`

const CONCEPTS_SYSTEM_PROMPT = `Kamu adalah konsultan bisnis Indonesia yang berpengalaman membantu UMKM menemukan posisi pasar unik mereka.
Tugasmu: menghasilkan konsep bisnis yang BENAR-BENAR BERBEDA SECARA STRATEGIS, bukan variasi dangkal dari produk yang sama.
PENTING: Analisis secara REALISTIS siapa yang benar-benar membeli produk ini di Indonesia berdasarkan pengamatan pasar nyata. Jangan suggest segmen yang tidak masuk akal — konsep harus mencerminkan perilaku konsumen nyata, bukan segmentasi teoritis.
Selalu kembalikan HANYA JSON valid tanpa teks lain, tanpa markdown code block.`

function buildConceptsPrompt(product) {
  return `User ingin memulai usaha "${product}" di Indonesia.

LANGKAH 1 — Pikirkan dulu: Siapa yang BENAR-BENAR membeli ${product} ini?
- Usia, kebiasaan, lokasi, daya beli, dan kapan mereka membelinya
- Sesuaikan semua konsep dengan profil pembeli yang realistis untuk produk ini
- Jangan suggest segmen yang tidak masuk akal untuk jenis produk ini

LANGKAH 2 — Buat TEPAT 3 konsep bisnis yang berbeda secara DIMENSI STRATEGIS.

LARANGAN KERAS — jangan jadikan ini perbedaan utama antar konsep:
- Ukuran/porsi (mini vs besar)
- Harga (murah vs premium)
- Timing produksi (pre-order vs ready stock)

Tiap konsep HARUS punya perbedaan di salah satu dari:
- Channel distribusi: GoFood/GrabFood, gerobak di pusat keramaian, titip kantin/toko, WhatsApp community, marketplace online
- Model bisnis: retail langsung ke pembeli, katering harian, bulk untuk event tertentu, reseller
- Segmen & konteks: siapa yang realistis membeli produk ini, di mana, dan kapan

Kembalikan JSON:
{
  "concepts": [
    {
      "id": "id-kebab-case-unik",
      "eyebrow": "Label singkat maks 4 kata",
      "title": "Nama konsep spesifik dan menarik (maks 6 kata)",
      "description": "1-2 kalimat. Fokus pada CARA bermain di pasar, bukan deskripsi produk.",
      "target": "Segmen target spesifik dan realistis (maks 4 kata)",
      "edge": "Keunggulan kompetitif unik (maks 8 kata)",
      "score": 70-90,
      "suggestedPrice": harga jual untuk SATU unit jual dalam rupiah (angka saja),
      "unit": "satuan jual SATU KATA yang dipakai pelanggan saat beli: bungkus, porsi, pcs, gelas, box, atau cup — WAJIB diisi",
      "piecesPerUnit": angka bulat berapa potong/buah dalam 1 unit jual (contoh 10 untuk sebungkus isi 10 butir, 1 kalau dijual satuan) — WAJIB angka, bukan teks,
      "unitContent": "deskripsi singkat isi 1 unit jual, misal \"isi 10 butir\" atau \"1 pcs\" — HARUS cocok dengan piecesPerUnit"
    }
  ]
}

ATURAN HARGA & SATUAN JUAL — WAJIB:
1. Untuk produk yang secara alami dijual dalam potongan kecil murah (harga wajar per potong di bawah ~Rp2.000 — contoh: tahu bulat, cilok, cireng, bakso tusuk), field "unit" WAJIB diisi "bungkus" atau "porsi" — DILARANG mengisi "pcs", "butir", atau "tusuk". Satu bungkus/porsi berisi BEBERAPA potong, sewajarnya seperti yang dijual pedagang kaki lima (misal 1 bungkus isi 10-15 butir).
2. WAJIB isi "unitContent" dengan deskripsi singkat isi 1 unit jual (misal "isi 10-15 butir", "isi 5 pcs", "1 porsi untuk 1 orang") — ini yang membuat harga bisa dinilai sendiri oleh user berdasarkan pengetahuan mereka soal harga per potong, jadi HARUS jujur dan realistis, bukan asal isi.
3. suggestedPrice = harga wajar untuk 1 unit jual (bungkus/porsi) itu SECARA KESELURUHAN — bukan harga per potong.
4. Untuk produk yang memang lazim dijual satuan individual dengan harga sudah wajar per pcs (donat, risol, roti isi — umumnya di atas Rp2.000/pcs), boleh isi "unit" dengan "pcs"; isi unitContent dengan "1 pcs".
5. "unit", "piecesPerUnit", dan "unitContent" HARUS konsisten satu sama lain: kalau unit="bungkus" dan piecesPerUnit=10 maka unitContent="isi 10 butir"; kalau unit="pcs" maka piecesPerUnit=1 dan unitContent="1 pcs". Angka di piecesPerUnit dipakai sistem untuk menghitung kebutuhan bahan, jadi HARUS akurat.
6. PENTING — INI YANG PALING SERING SALAH: unit yang dihargai HARUS unit ECERAN, yaitu yang dibeli SATU ORANG untuk langsung dimakan/dipakai. Walaupun konsepnya soal reseller, grosir, katering, frozen, atau titip warung, JANGAN mengubah unit yang dihargai jadi paket besar/karung/lusinan. piecesPerUnit WAJIB tetap di kisaran wajar untuk sekali beli perorangan (untuk jajanan biasanya 5-15 potong, JANGAN sampai 25, 50, atau 100). Bedakan konsep lewat channel/target/model bisnis, BUKAN dengan membesarkan isi kemasan.
7. Kalau produknya jajanan/street food, harga di atas Rp30.000 per unit jual hampir selalu SALAH.
8. Pikirkan daya beli target segmen: pelajar dan pembeli warung tidak akan bayar harga kelas restoran.

PENTING (baca ulang sebelum menjawab): apakah "unitContent" di ketiga konsep sudah jelas menyebutkan isi tiap unit? Kalau produk ini murah per potong (tahu bulat, cilok, dan sejenisnya), pastikan satuannya bungkus/porsi berisi beberapa potong — BUKAN harga per satu potong tunggal yang terlalu kecil untuk terasa seperti transaksi wajar.

Urutkan dari score tertinggi ke terendah. Pastikan 3 konsep benar-benar berbeda satu sama lain dan semua masuk akal untuk produk "${product}".`
}

function buildConceptsPromptGuided(product, userPrompt) {
  return `User ingin memulai usaha "${product}" di Indonesia.
Arahan dari user: "${userPrompt}"

Buat TEPAT 3 konsep bisnis yang MEMPERTIMBANGKAN arahan user di atas, tapi tetap berbeda satu sama lain.

LARANGAN KERAS — jangan jadikan ini perbedaan utama antar konsep:
- Ukuran/porsi (mini vs besar)
- Harga (murah vs premium)
- Timing produksi (pre-order vs ready stock)

Kembalikan JSON:
{
  "concepts": [
    {
      "id": "id-kebab-case-unik",
      "eyebrow": "Label singkat maks 4 kata",
      "title": "Nama konsep spesifik dan menarik (maks 6 kata)",
      "description": "1-2 kalimat. Fokus pada CARA bermain di pasar sesuai arahan user.",
      "target": "Segmen target spesifik (maks 4 kata)",
      "edge": "Keunggulan kompetitif unik (maks 8 kata)",
      "score": 70-90,
      "suggestedPrice": harga jual untuk SATU unit jual dalam rupiah (angka saja),
      "unit": "satuan jual SATU KATA yang dipakai pelanggan saat beli: bungkus, porsi, pcs, gelas, box, atau cup — WAJIB diisi",
      "piecesPerUnit": angka bulat berapa potong/buah dalam 1 unit jual (contoh 10 untuk sebungkus isi 10 butir, 1 kalau dijual satuan) — WAJIB angka, bukan teks,
      "unitContent": "deskripsi singkat isi 1 unit jual, misal \"isi 10 butir\" atau \"1 pcs\" — HARUS cocok dengan piecesPerUnit"
    }
  ]
}

ATURAN HARGA & SATUAN JUAL — WAJIB:
1. Untuk produk yang secara alami dijual dalam potongan kecil murah (harga wajar per potong di bawah ~Rp2.000 — contoh: tahu bulat, cilok, cireng, bakso tusuk), field "unit" WAJIB diisi "bungkus" atau "porsi" — DILARANG mengisi "pcs", "butir", atau "tusuk". Satu bungkus/porsi berisi BEBERAPA potong, sewajarnya seperti yang dijual pedagang kaki lima (misal 1 bungkus isi 10-15 butir).
2. WAJIB isi "unitContent" dengan deskripsi singkat isi 1 unit jual (misal "isi 10-15 butir", "isi 5 pcs", "1 porsi untuk 1 orang") — ini yang membuat harga bisa dinilai sendiri oleh user berdasarkan pengetahuan mereka soal harga per potong, jadi HARUS jujur dan realistis, bukan asal isi.
3. suggestedPrice = harga wajar untuk 1 unit jual (bungkus/porsi) itu SECARA KESELURUHAN — bukan harga per potong.
4. Untuk produk yang memang lazim dijual satuan individual dengan harga sudah wajar per pcs (donat, risol, roti isi — umumnya di atas Rp2.000/pcs), boleh isi "unit" dengan "pcs"; isi unitContent dengan "1 pcs".
5. "unit", "piecesPerUnit", dan "unitContent" HARUS konsisten satu sama lain: kalau unit="bungkus" dan piecesPerUnit=10 maka unitContent="isi 10 butir"; kalau unit="pcs" maka piecesPerUnit=1 dan unitContent="1 pcs". Angka di piecesPerUnit dipakai sistem untuk menghitung kebutuhan bahan, jadi HARUS akurat.
6. PENTING — INI YANG PALING SERING SALAH: unit yang dihargai HARUS unit ECERAN, yaitu yang dibeli SATU ORANG untuk langsung dimakan/dipakai. Walaupun konsepnya soal reseller, grosir, katering, frozen, atau titip warung, JANGAN mengubah unit yang dihargai jadi paket besar/karung/lusinan. piecesPerUnit WAJIB tetap di kisaran wajar untuk sekali beli perorangan (untuk jajanan biasanya 5-15 potong, JANGAN sampai 25, 50, atau 100). Bedakan konsep lewat channel/target/model bisnis, BUKAN dengan membesarkan isi kemasan.
7. Kalau produknya jajanan/street food, harga di atas Rp30.000 per unit jual hampir selalu SALAH.
8. Pikirkan daya beli target segmen: pelajar dan pembeli warung tidak akan bayar harga kelas restoran.

PENTING (baca ulang sebelum menjawab): apakah "unitContent" di ketiga konsep sudah jelas menyebutkan isi tiap unit? Kalau produk ini murah per potong (tahu bulat, cilok, dan sejenisnya), pastikan satuannya bungkus/porsi berisi beberapa potong — BUKAN harga per satu potong tunggal yang terlalu kecil untuk terasa seperti transaksi wajar.

Urutkan dari score tertinggi ke terendah. Pastikan 3 konsep benar-benar berbeda satu sama lain.`
}

// One sold unit can hold many pieces. Clamped because this number multiplies every
// ingredient quantity — a hallucinated 5000 would blow the whole plan up.
function normalizePiecesPerUnit(value) {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.min(n, 100)
}

function buildPrompt(product, conceptTitle, sellingPrice, unitInfo = {}) {
  // The concept defines what one sold unit actually is. Without passing that here,
  // this call would size ingredients for 50 individual pieces while the price refers
  // to 50 packs of ~10 pieces — a ~10x mismatch that silently understates HPP.
  const unitName = unitInfo.unit || 'unit'
  const unitContent = unitInfo.unitContent || ''
  const pieces = normalizePiecesPerUnit(unitInfo.piecesPerUnit)
  // Asking the model to multiply (50 packs x 10 pieces) is where it slipped before,
  // so it only sizes a single piece here and the caller scales deterministically.
  const totalPieces = 50 * pieces
  // The multiplication is done here so the model never has to do it, but the model
  // still sizes the batch as a whole — scaling its answer in code instead would
  // amplify any error by `pieces` and breaks for non-linear inputs like frying oil.
  const unitBrief = pieces > 1
    ? `

SATUAN JUAL: 1 ${unitName} = ${unitContent || `${pieces} potong`} (${pieces} potong per ${unitName}).

JUMLAH YANG HARUS DIHITUNG: 50 ${unitName} x ${pieces} potong = ${totalPieces} potong "${product}" total. Semua "ingredients" dan "overheadCost" WAJIB untuk memproduksi ${totalPieces} potong itu — angka ini sudah dihitungkan untukmu, jangan dikalikan atau dikecilkan lagi.
Perhatikan bahan yang TIDAK naik sebanding jumlah potong: minyak goreng dipakai berulang (cukup sesuai kapasitas wajan, bukan dikali jumlah potong), begitu juga bumbu dan penyedap yang porsinya kecil.`
    : `

SATUAN JUAL YANG SUDAH DITETAPKAN (WAJIB dipakai, jangan diubah): 1 ${unitName}${unitContent ? ` = ${unitContent}` : ''}.`
  const priceBrief = sellingPrice
    ? `

Harga jual yang sudah ditetapkan: Rp${sellingPrice.toLocaleString('id-ID')} per 1 ${unitName} "${product}".`
    : ''
  const knownNames = listIngredientNames()
  const knownNamesBrief = knownNames.length
    ? `

DAFTAR BAHAN YANG SUDAH PUNYA HARGA PASAR TERVERIFIKASI (pakai nama ini PERSIS APA ADANYA kalau bahan yang kamu maksud ada di sini — jangan diparafrase atau ditambah merek/keterangan, supaya sistem bisa mencocokkan harga aslinya):
${knownNames.join(', ')}

Untuk bahan yang TIDAK ada di daftar ini, buat nama spesifik seperti biasa.`
    : ''
  return `User ingin memulai usaha "${product}" dengan konsep "${conceptTitle || product}" di Indonesia.${unitBrief}${priceBrief}${knownNamesBrief}

Buat daftar kebutuhan yang SPESIFIK untuk usaha ini. Kembalikan JSON berikut:
{
  "unit": "WAJIB isi persis dengan satuan jual yang sudah ditetapkan di atas — jangan pakai satuan lain",
  "ingredients": [
    {
      "id": "id-kebab-case-unik",
      "name": "Nama Bahan Spesifik",
      "baseQty": 1.5,
      "unit": "kg",
      "baseCost": 15000,
      "source": "Toko bahan kue lokal",
      "whole": false
    }
  ],
  "equipment": [
    { "name": "Nama Alat Spesifik", "cost": 150000 }
  ],
  "packaging": {
    "name": "Nama kemasan — pakai PERSIS nama dari DAFTAR BAHAN kalau ada yang cocok",
    "baseQty": 1,
    "unit": "pack",
    "estimatedCost": 35000
  },
  "overheadCost": 12000,
  "launchSteps": [
    ["Judul Langkah 1", "Detail singkat langkah 1"],
    ["Judul Langkah 2", "Detail singkat langkah 2"],
    ["Judul Langkah 3", "Detail singkat langkah 3"]
  ]
}

WAJIB: field "packaging" HARUS berupa OBJECT persis seperti contoh di atas (name, baseQty, unit, estimatedCost). JANGAN PERNAH mengembalikan "packagingCost" sebagai angka tunggal — itu format lama yang sudah tidak dipakai.

Aturan:
- baseQty = jumlah bahan untuk memproduksi ${pieces > 1 ? `${totalPieces} potong (= 50 ${unitName})` : `TEPAT 50 ${unitName}`} "${product}"
- baseCost = estimasi harga beli di Indonesia dalam rupiah (realistis 2024-2025)
- whole: true HANYA jika satuan tidak bisa dipecah (butir telur, buah, pcs, lembar)
- Buat 6-8 bahan yang SPESIFIK dan RELEVAN dengan produk ini
- Buat 3-5 alat yang benar-benar dibutuhkan
- packaging.name = pilih jenis kemasan berdasarkan BENTUK JUAL ASLI produk ini di Indonesia, bukan tebakan bebas:
  * Jajanan/gorengan lepasan yang dijual langsung ke tangan pembeli atau ditaruh di kantong sederhana (tahu bulat, cilok, cireng, gorengan, dll) → kantong plastik kresek
  * Makanan porsi rapi dalam wadah (dimsum, nasi kotak, kue basah) → box makanan kertas atau mika bening
  * Minuman → cup plastik + tutup
  * Kalau ragu, pikirkan: kalau kamu beli produk ini langsung dari pedagangnya di pinggir jalan, wadah apa yang benar-benar dipakai?
  KALAU ada nama yang cocok di DAFTAR BAHAN, pakai PERSIS nama itu supaya harganya bisa dicocokkan ke harga pasar asli
- packaging.baseQty & unit = berapa "pack" kemasan dibutuhkan untuk 50 ${unitName} (kemasan dihitung per ${unitName} yang dijual, BUKAN per potong — dan bagian ini JANGAN dikecilkan ke 50 potong)
- packaging.estimatedCost = perkiraanmu sendiri untuk total biaya kemasan itu, dipakai HANYA kalau namanya tidak ditemukan di daftar harga pasar
- overheadCost = total biaya gas, listrik, air, dan cadangan untuk memproduksi ${pieces > 1 ? `${totalPieces} potong (= 50 ${unitName})` : `50 ${unitName}`}. Realistis untuk usaha rumahan — untuk skala segini biasanya puluhan ribu rupiah saja, jauh lebih kecil dari biaya bahan
- Tepat 3 langkah launch yang actionable untuk 7 hari pertama
- Harga harus realistis untuk pasar Indonesia${sellingPrice ? `

CEK KEWAJARAN BIAYA — WAJIB, hitung sebelum menjawab:
- Omzet 50 unit = 50 × Rp${sellingPrice.toLocaleString('id-ID')} = Rp${(sellingPrice * 50).toLocaleString('id-ID')}.
- Jumlahkan seluruh baseCost bahan. Totalnya HARUS berada di kisaran 30-50% dari Rp${(sellingPrice * 50).toLocaleString('id-ID')}, yaitu sekitar Rp${Math.round(sellingPrice * 50 * 0.3).toLocaleString('id-ID')} sampai Rp${Math.round(sellingPrice * 50 * 0.5).toLocaleString('id-ID')}.
- packaging.estimatedCost + overheadCost digabung TIDAK BOLEH lebih dari 15% dari Rp${(sellingPrice * 50).toLocaleString('id-ID')}.
- Kalau hasil hitunganmu melebihi batas itu, berarti porsi bahannya terlalu besar untuk produk seharga segini. Kecilkan baseQty atau pilih bahan yang lebih ekonomis, lalu hitung ulang sampai masuk akal.
- Usaha ini HARUS untung. Total semua biaya untuk 50 unit tidak boleh mendekati atau melebihi Rp${(sellingPrice * 50).toLocaleString('id-ID')}.

PENTING (baca ulang sebelum menjawab): field "packaging" WAJIB berupa OBJECT {name, baseQty, unit, estimatedCost} seperti contoh skema di atas — BUKAN angka tunggal. JANGAN gunakan key "packagingCost".` : ''}`
}

async function callGemini(systemPrompt, userPrompt) {
  const apiKey = process.env.GEMINI_API_KEY
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 1200 },
      }),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Gemini API ${response.status}: ${body.slice(0, 200)}`)
  }
  const data = await response.json()
  const text = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim()
  const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  return JSON.parse(clean)
}

// The model is asked to keep all 3 concepts anchored to the same real per-unit
// price, but a "lite" model doesn't reliably hold that across a long prompt —
// empirically it sometimes lets one concept drift to a "wholesale/bulk" price
// while the others stay grounded (verified: 3 of 5 trials on "tahu bulat" had
// exactly one concept jump 5-10x above the other two). Rather than keep chasing
// prompt wording, clamp the outlier deterministically: whatever the AI says, no
// concept's price may exceed 3x the cheapest concept in the same batch.
function clampConceptPrices(concepts) {
  const prices = concepts.map((c) => c.suggestedPrice).filter((p) => Number.isFinite(p) && p > 0)
  if (prices.length < 2) return concepts
  const floor = Math.min(...prices)
  const ceiling = floor * 3
  return concepts.map((c) => {
    if (!Number.isFinite(c.suggestedPrice) || c.suggestedPrice <= ceiling) return c
    const capped = floor * 2
    const rounded = capped < 5000 ? Math.round(capped / 100) * 100 : Math.round(capped / 500) * 500
    return { ...c, suggestedPrice: rounded }
  })
}

// A priced unit is meant to be what one person buys to eat. Reseller/grosir concepts
// tempt the model into pricing a bulk pack instead ("1 bungkus = 50 butir"), which
// makes the per-piece price look nothing like the street price the user knows.
// unitContent is rewritten alongside the number so the label never contradicts it.
const MAX_RETAIL_PIECES = 20

function clampRetailPackSize(concept) {
  const pieces = normalizePiecesPerUnit(concept.piecesPerUnit)
  if (pieces <= MAX_RETAIL_PIECES) return { piecesPerUnit: pieces }
  const unitContent = typeof concept.unitContent === 'string'
    ? concept.unitContent.replace(/\d+\s*[-–]\s*\d+|\d+/, String(MAX_RETAIL_PIECES))
    : concept.unitContent
  return { piecesPerUnit: MAX_RETAIL_PIECES, unitContent }
}

export async function generateConcepts(product, { userPrompt = '', bust = false } = {}) {
  if (!process.env.GEMINI_API_KEY) return null
  const baseKey = userPrompt
    ? `concepts:guided-v4:${product.toLowerCase().trim()}:${userPrompt.toLowerCase().trim()}`
    : `concepts:v4:${product.toLowerCase().trim()}`
  if (!bust) {
    const cached = cacheGet(baseKey)
    if (cached) return cached
  }
  const prompt = userPrompt
    ? buildConceptsPromptGuided(product, userPrompt)
    : buildConceptsPrompt(product)
  const parsed = await callGemini(CONCEPTS_SYSTEM_PROMPT, prompt)
  if (!Array.isArray(parsed.concepts) || parsed.concepts.length < 2) {
    throw new Error('AI returned invalid concepts')
  }
  parsed.concepts = clampConceptPrices(parsed.concepts).map((c) => ({
    ...c,
    ...clampRetailPackSize(c),
  }))
  return cacheSet(baseKey, parsed)
}

export async function generateIngredients(product, conceptTitle, sellingPrice = null, unitInfo = {}) {
  if (!process.env.GEMINI_API_KEY) return null
  const price = Number.isFinite(sellingPrice) && sellingPrice > 0 ? Math.round(sellingPrice) : null
  const unitKey = `${unitInfo.unit || ''}|${unitInfo.unitContent || ''}|${normalizePiecesPerUnit(unitInfo.piecesPerUnit)}`
  // Includes the price file's mtime so a weekly database edit isn't masked by a stale cache entry.
  const key = `ingredients:v7:${product.toLowerCase().trim()}:${(conceptTitle || '').toLowerCase().trim()}:${price ?? 'na'}:${unitKey}:${getDbVersion()}`
  const cached = cacheGet(key)
  if (cached) return cached
  const parsed = await callGemini(SYSTEM_PROMPT, buildPrompt(product, conceptTitle, price, unitInfo))
  if (!Array.isArray(parsed.ingredients) || !parsed.ingredients.length) {
    throw new Error('AI returned empty ingredients list')
  }
  parsed.piecesPerUnit = normalizePiecesPerUnit(unitInfo.piecesPerUnit)
  // Swap in a real, user-verified price wherever the AI's ingredient — or packaging
  // pick — matches the local database. This is the actual accuracy fix, not the AI's guess.
  parsed.ingredients = parsed.ingredients.map((ing) => {
    const match = priceLookup(ing.name, ing.baseQty, ing.unit)
    if (!match) return { ...ing, priceSource: 'ai' }
    return {
      ...ing,
      baseCost: match.cost,
      priceSource: 'local-db',
      priceLink: match.link,
      priceCheckedAt: match.checkedAt,
    }
  })
  if (parsed.packaging?.name) {
    const pkg = parsed.packaging
    const match = priceLookup(pkg.name, pkg.baseQty, pkg.unit)
    parsed.packaging = match
      ? { ...pkg, cost: match.cost, matchedName: match.matchedName, priceSource: 'local-db', priceLink: match.link, priceCheckedAt: match.checkedAt }
      : { ...pkg, cost: pkg.estimatedCost, priceSource: 'ai' }
  }
  return cacheSet(key, parsed)
}
