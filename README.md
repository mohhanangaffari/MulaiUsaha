# MulaiUsaha

MulaiUsaha adalah prototype aplikasi mobile-first yang membantu calon pengusaha mengecek potensi pasar lokal sebelum menyusun kebutuhan, pemasok, modal, HPP, dan harga jual.

## Alur demo

1. Masukkan ide usaha dan lokasi.
2. Lihat Opportunity Score serta kompetitor lokal.
3. Pilih konsep usaha yang lebih spesifik.
4. Tentukan skala produksi.
5. Lihat kebutuhan bahan, estimasi modal, HPP, harga jual, dan rencana uji pasar.
6. Masukkan quote harga nyata dari pemasok agar estimasi bahan dan HPP dihitung ulang.

Skenario awal menggunakan donat di Kelurahan Surabaya, Kecamatan Kedaton, Bandar Lampung. Titik lokasi jualan dipilih pada peta OpenStreetMap, sedangkan kompetitor terverifikasi diambil dari Google Places.

## Menjalankan proyek

```bash
pnpm install
pnpm dev
```

Server frontend dan API berjalan bersama di `http://localhost:5173`.

Endpoint backend:

- `GET /api/health`
- `GET /api/locations/suggest?field=city&q=Bandar`
- `GET /api/locations/geocode?village=Surabaya&district=Kedaton&city=Bandar%20Lampung`
- `POST /api/locations/resolve-map`
- `GET /api/places/details?id=photon%2FN%2F9785881736`
- `POST /api/market/analyze`
- `GET /api/prices/quotes?village=Surabaya&district=Kedaton&city=Bandar%20Lampung`
- `POST /api/prices/quotes`

Contoh body analisis:

```json
{
  "product": "Donat",
  "village": "Surabaya",
  "district": "Kedaton",
  "city": "Bandar Lampung",
  "latitude": -5.3935182,
  "longitude": 105.258214
}
```

## Sumber data

- Wilayah.id untuk daftar administrasi Indonesia yang saling terhubung dari kota/kabupaten, kecamatan, hingga kelurahan/desa.
- OpenStreetMap dan Leaflet untuk peta interaktif, lokasi perangkat, pin yang dapat digeser, dan pemilihan titik pusat analisis tanpa API key.
- OpenStreetMap Nominatim untuk geocoding, dengan cache 24 jam dan maksimum satu permintaan per detik saat fallback lokasi diperlukan.
- Snapshot menu publik untuk rentang harga donat.
- Google Places Text Search (New) sebagai sumber wajib kompetitor untuk semua kategori usaha. Setiap kompetitor memiliki Place ID, listing Google Maps, alamat, rating, dan jumlah ulasan dari tempat yang sama.
- Google Place Details (New) untuk jam buka, telepon, dan website ketika pengguna membuka kartu kompetitor.

Salin `.env.example` menjadi `.env` untuk mengaktifkan pencarian kompetitor:

```env
GOOGLE_MAPS_API_KEY=your_server_side_key
SERPAPI_API_KEY=your_private_serpapi_key
APP_CONTACT_URL=https://your-project.example
PORT=5173
```

Kedua API key hanya dibaca oleh server dan tidak dikirim ke browser. SerpApi
dipakai sebagai fallback teks ulasan berdasarkan Google Place ID yang ditemukan
secara otomatis. Ulasan hanya diminta saat pengguna membuka salah satu dari
maksimal lima kartu pemain utama. Daftar kompetitor lainnya tidak meminta teks
ulasan. Hasil review disimpan dalam cache backend selama 24 jam untuk menghemat
kuota.

Tanpa `GOOGLE_MAPS_API_KEY`, backend tidak menggunakan hasil OpenStreetMap sebagai
listing kompetitor dan tidak membuat tautan koordinat mentah. Hanya listing demo
yang sudah memiliki Place ID terverifikasi yang dapat muncul, dan skor pasar tidak
dihitung sampai Google Places terhubung.

Quote harga pemasok disimpan oleh backend dalam database SQLite lokal di
`data/mulaiusaha.sqlite`. Lokasinya dapat diganti melalui `PRICE_DATABASE_PATH`.
Data yang belum dikonfirmasi tetap ditandai sebagai **estimasi**, sedangkan quote
yang dimasukkan pengguna ditandai sebagai **terverifikasi** dan langsung dipakai
untuk menghitung bahan, modal awal, HPP, margin, dan perkiraan balik modal.

Build produksi:

```bash
pnpm build
```

Hasil build berada di folder `dist`.

## Hosting di Emergent

Proyek menggunakan React, Vite, dan server Node/Express. Konfigurasi dasarnya:

- Build command: `pnpm build`
- Output directory: `dist`
- Development command: `pnpm dev`
- Production command: `pnpm start`

Hosting ditunda sampai backend dan sumber data dinyatakan final. Sebelum dibuka
untuk publik, pindahkan penyimpanan quote ke database persisten yang disediakan
hosting serta tambahkan autentikasi/rate limit pada endpoint penulisan. Jangan
memasukkan API key langsung ke source code.
