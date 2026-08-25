import 'dotenv/config'
import express from 'express'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import app, { configWarnings, isDev } from './app.js'
import { authConfigured } from './authService.js'
import { userStoreConfigured } from './userStore.js'

// Local entry point only. On Vercel the app is served by api/index.js as a Function,
// which never runs this file — there is no process to listen with there.
const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const port = Number(process.env.PORT || 5173)

// Running a local production server with sign-in half-configured is a mistake worth
// stopping for, and stopping is safe here: it is a process we own.
if (!isDev && configWarnings.length) {
  console.error('Tidak bisa start dalam mode produksi:')
  configWarnings.forEach((warning) => console.error('  - ' + warning))
  process.exit(1)
}

if (isDev) {
  const { createServer } = await import('vite')
  const vite = await createServer({ root, server: { middlewareMode: true }, appType: 'spa' })
  app.use(vite.middlewares)
} else {
  const dist = resolve(root, 'dist')
  app.use(express.static(dist))
  app.use((_request, response) => response.sendFile(resolve(dist, 'index.html')))
}

app.listen(port, '0.0.0.0', () => {
  console.log(`MulaiUsaha running at http://localhost:${port}`)
  console.log(`Competitor provider: ${process.env.GOOGLE_MAPS_API_KEY ? 'Google Places' : 'Google Places setup required'}`)
  console.log(`Review fallback: ${process.env.SERPAPI_API_KEY ? 'SerpApi' : 'not configured'}`)
  console.log(`Google sign-in: ${authConfigured() ? 'active' : 'not configured — app is open in dev'}`)
  console.log(`User store: ${userStoreConfigured() ? 'Supabase' : 'not configured'}`)
})
