import { createClient } from '@supabase/supabase-js'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const authDir = path.join(__dirname, '.auth')
const statePath = path.join(authDir, 'state.json')
const sessionPath = path.join(authDir, 'session.json')

// .env.local isn't auto-loaded outside Vite — Playwright's config/setup runs as plain Node, so
// this reads the same file by hand. Only VITE_-prefixed (client-safe, non-secret) values live
// there; never read GAFFLO_DB_URL or any service-role key here.
function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local')
  let raw
  try {
    raw = readFileSync(envPath, 'utf8')
  } catch {
    return {}
  }
  const values = {}
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    values[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return values
}

// The existing marketplace e2e suite predates real auth and exercises the mock marketplace
// directly. Rather than weaken those tests to skip the new auth boundary, this creates one
// fresh, real, throwaway Supabase identity per test run (via the public signup endpoint, same
// publishable anon key the app itself uses — never service_role) and derives the exact
// localStorage session Supabase's own client library would persist for it, using the real
// @supabase/supabase-js persistence code rather than a hand-guessed key/shape. Every test then
// starts genuinely authenticated against real gafflo-dev, with the mock marketplace behind it
// untouched.
export default async function globalSetup(config) {
  const env = { ...loadEnvLocal(), ...process.env }
  const url = env.VITE_SUPABASE_URL
  const anonKey = env.VITE_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error(
      'e2e tests need real Supabase credentials to seed an authenticated session. Copy ' +
        '.env.example to .env.local and set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY to the ' +
        'gafflo-dev project values, then re-run.',
    )
  }

  const runId = Date.now()
  const email = `gafflo-e2e-${runId}@example.com`
  const password = `E2e-Test-Pass-${runId}!`

  const signupResponse = await fetch(`${url}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const signup = await signupResponse.json()
  if (!signupResponse.ok || !signup.access_token) {
    throw new Error(
      `e2e global setup: failed to create a throwaway Supabase test user (HTTP ${signupResponse.status}). ` +
        'Check VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env.local point at gafflo-dev.',
    )
  }

  const captured = {}
  const storage = {
    getItem: (key) => (key in captured ? captured[key] : null),
    setItem: (key, value) => {
      captured[key] = value
    },
    removeItem: (key) => {
      delete captured[key]
    },
  }
  const client = createClient(url, anonKey, {
    auth: { storage, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { error } = await client.auth.setSession({
    access_token: signup.access_token,
    refresh_token: signup.refresh_token,
  })
  if (error) {
    throw new Error(`e2e global setup: failed to establish a session for the throwaway test user: ${error.message}`)
  }

  const entries = Object.entries(captured)
  if (entries.length !== 1) {
    throw new Error(`e2e global setup: expected exactly one persisted session entry, got ${entries.length}.`)
  }
  const [storageKey, storageValue] = entries[0]
  const baseURL = config.projects[0].use.baseURL

  mkdirSync(authDir, { recursive: true })
  writeFileSync(sessionPath, JSON.stringify({ storageKey, storageValue }))
  writeFileSync(
    statePath,
    JSON.stringify({
      cookies: [],
      origins: [{ origin: baseURL, localStorage: [{ name: storageKey, value: storageValue }] }],
    }),
  )
}
