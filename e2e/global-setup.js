import { createClient } from '@supabase/supabase-js'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const authDir = path.join(__dirname, '.auth')
const statePath = path.join(authDir, 'state.json')
const sessionPath = path.join(authDir, 'session.json')
const identitiesPath = path.join(authDir, 'identities.json')

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

// The tenant_profiles row backing e2e/frontend-integrity.spec.js's `tenantProfile` fixture
// constant — kept in exact sync with it by hand, since this file (plain Node, no app imports)
// cannot import that spec file's JS object directly.
const TENANT_BASE_ROW = {
  target_city: 'Dublin',
  preferred_areas: ['Rathmines'],
  budget_min: 1200,
  budget_max: 2400,
  move_in_date: null,
  household_size: 1,
  lease_length_months: 12,
  looking_for: 'any',
  applying_as_couple: false,
  pets: 'none',
  smoking: 'no',
  furnished_preference: 'any',
  parking_needed: false,
}

// Every distinct tenant_profiles/landlord_profiles shape e2e/frontend-integrity.spec.js needs.
// Each is a small, fixed, purpose-built fixture created once per full test run (never mutated
// during the run itself) — not a "batch" of disposable users, and never sent any OTP/magic-link
// email (signup with email+password on this project, same as Stage A, does not trigger one).
const IDENTITIES = {
  tenantDefault: { role: 'tenant', tenant: TENANT_BASE_ROW },
  landlordDefault: { role: 'landlord', landlord: { display_name: 'Test Landlord Co' } },
  // Exclusively for e2e/auth.spec.js's "signed in" describe block — never read by
  // frontend-integrity.spec.js. freshForAuthTest is read-only there (just checks RoleSelection
  // renders); landlordForSignOutTest is dedicated because signOut() revokes the identity's
  // refresh token for real, which would break any other test concurrently relying on the same
  // session still being valid.
  freshForAuthTest: {},
  landlordForSignOutTest: { role: 'landlord', landlord: { display_name: 'Sign Out Test Co' } },
  // Four separate "fresh" (no role, no profile) identities, not one shared — clicking through
  // RoleSelection is a real, non-idempotent mutation (it persists last_active_role for good),
  // so any two tests sharing one fresh identity would race: whichever ran second would no
  // longer see RoleSelection at all. Each of the four onboarding-flow tests that needs a
  // genuinely fresh account gets its own.
  freshForTenantOnboarding: {},
  freshForOnboardingValidation: {},
  freshForOnboardingViewport: {},
  freshForLandlordOnboarding: {},
  tenantNoAreas: { role: 'tenant', tenant: { ...TENANT_BASE_ROW, preferred_areas: [] } },
  tenantHousehold2Room: { role: 'tenant', tenant: { ...TENANT_BASE_ROW, household_size: 2, looking_for: 'room', applying_as_couple: false } },
  tenantHousehold1Room: { role: 'tenant', tenant: { ...TENANT_BASE_ROW, household_size: 1, looking_for: 'room', applying_as_couple: false } },
  tenantHousehold3Room: { role: 'tenant', tenant: { ...TENANT_BASE_ROW, household_size: 3, looking_for: 'room', applying_as_couple: false } },
  tenantHousehold4Any: { role: 'tenant', tenant: { ...TENANT_BASE_ROW, household_size: 4, looking_for: 'any' } },
  tenantBudgetMinZero: { role: 'tenant', tenant: { ...TENANT_BASE_ROW, budget_min: 0 } },
  tenantNoFacts: { role: 'tenant', tenant: { ...TENANT_BASE_ROW, budget_min: null, budget_max: null, move_in_date: null, household_size: null } },
  tenantCompleteFacts: { role: 'tenant', tenant: { ...TENANT_BASE_ROW, budget_min: 1200, budget_max: 1800, move_in_date: '2030-01-01', household_size: 1 } },
  tenantWaterford: { role: 'tenant', tenant: { ...TENANT_BASE_ROW, target_city: 'Waterford', preferred_areas: [], budget_min: 1400, budget_max: 1600, move_in_date: '2030-01-01' } },
  // Dedicated because this is the one "default-shaped" identity a test actually saves a change
  // to (Dublin -> Cork) — reusing tenantDefault here would corrupt every other test that reads
  // it expecting Dublin to stay Dublin.
  tenantSelectSaveTest: { role: 'tenant', tenant: { ...TENANT_BASE_ROW } },
  // Stage C — real listings/Storage ownership-isolation coverage (e2e/listings.spec.js) needs
  // two distinct real landlord identities, neither of which can be landlordDefault/
  // landlordForSignOutTest: the isolation tests read each other's auth.uid() at test time and
  // must never race with unrelated tests mutating those shared identities' own listing state.
  landlordListingOwnerA: { role: 'landlord', landlord: { display_name: 'Listing Owner A' } },
  landlordListingOwnerB: { role: 'landlord', landlord: { display_name: 'Listing Owner B' } },
}

async function signUp(url, anonKey, email, password) {
  const response = await fetch(`${url}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = await response.json()
  if (!response.ok || !body.access_token) {
    throw new Error(`signup failed (HTTP ${response.status}): ${JSON.stringify(body)}`)
  }
  return body
}

async function restInsert(url, anonKey, accessToken, table, row) {
  const response = await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  })
  if (!response.ok) {
    throw new Error(`insert into ${table} failed (HTTP ${response.status}): ${await response.text()}`)
  }
}

async function restSetActiveRole(url, anonKey, accessToken, userId, role) {
  const response = await fetch(`${url}/rest/v1/profiles?id=eq.${userId}`, {
    method: 'PATCH',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ last_active_role: role }),
  })
  if (!response.ok) {
    throw new Error(`setting last_active_role failed (HTTP ${response.status}): ${await response.text()}`)
  }
}

// Uses the real @supabase/supabase-js persistence code (via a captured in-memory storage
// adapter) to derive the exact localStorage key/value the browser client would persist for a
// session — correct by construction rather than a hand-guessed key/shape.
async function captureSessionStorage(url, anonKey, accessToken, refreshToken) {
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
  const { error } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
  if (error) throw new Error(`setSession failed: ${error.message}`)
  const entries = Object.entries(captured)
  if (entries.length !== 1) throw new Error(`expected exactly one persisted session entry, got ${entries.length}`)
  return entries[0]
}

async function buildIdentity(url, anonKey, runId, name, spec) {
  const email = `gafflo-e2e-${name}-${runId}@example.com`
  const password = `E2e-Test-Pass-${runId}!`
  const signup = await signUp(url, anonKey, email, password)
  const userId = signup.user.id
  const accessToken = signup.access_token

  if (spec.tenant) {
    await restInsert(url, anonKey, accessToken, 'tenant_profiles', { profile_id: userId, ...spec.tenant })
  }
  if (spec.landlord) {
    await restInsert(url, anonKey, accessToken, 'landlord_profiles', { profile_id: userId, ...spec.landlord })
  }
  if (spec.role) {
    await restSetActiveRole(url, anonKey, accessToken, userId, spec.role)
  }

  const [storageKey, storageValue] = await captureSessionStorage(url, anonKey, accessToken, signup.refresh_token)
  return { storageKey, storageValue }
}

// The existing marketplace e2e suite predates real auth and exercises the mock marketplace
// directly. Rather than weaken those tests to skip the new auth/profile boundary, this creates
// one fresh, real, throwaway Supabase session per test run for the default authenticated state
// (via the public signup endpoint, same publishable anon key the app itself uses — never
// service_role), plus a small fixed set of named identities pre-configured with exactly the
// real tenant_profiles/landlord_profiles shapes the marketplace suite's fixtures need (see
// IDENTITIES above) — created once here, read-only for the rest of the run, so no test-time
// mutation race is possible under fullyParallel.
export default async function globalSetup(config) {
  const env = { ...loadEnvLocal(), ...process.env }
  const url = env.VITE_SUPABASE_URL
  const anonKey = env.VITE_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error(
      'e2e tests need real Supabase credentials to seed authenticated sessions. Copy ' +
        '.env.example to .env.local and set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY to the ' +
        'gafflo-dev project values, then re-run.',
    )
  }

  const runId = Date.now()
  const baseURL = config.projects[0].use.baseURL

  // Default session (unconfigured role/profile) — playwright.config.js's global default
  // storageState, and e2e/auth.spec.js's "signed in" describe block.
  const defaultEmail = `gafflo-e2e-${runId}@example.com`
  const defaultPassword = `E2e-Test-Pass-${runId}!`
  const defaultSignup = await signUp(url, anonKey, defaultEmail, defaultPassword)
  const [defaultStorageKey, defaultStorageValue] = await captureSessionStorage(
    url,
    anonKey,
    defaultSignup.access_token,
    defaultSignup.refresh_token,
  )

  mkdirSync(authDir, { recursive: true })
  writeFileSync(sessionPath, JSON.stringify({ storageKey: defaultStorageKey, storageValue: defaultStorageValue }))
  writeFileSync(
    statePath,
    JSON.stringify({
      cookies: [],
      origins: [{ origin: baseURL, localStorage: [{ name: defaultStorageKey, value: defaultStorageValue }] }],
    }),
  )

  // Named marketplace-fixture identities, built sequentially — each does 2-3 real network
  // calls, and running them one at a time keeps failures easy to attribute to a specific
  // identity rather than an opaque Promise.all rejection.
  const identities = {}
  for (const [name, spec] of Object.entries(IDENTITIES)) {
    identities[name] = await buildIdentity(url, anonKey, runId, name, spec)
  }
  writeFileSync(identitiesPath, JSON.stringify(identities))
}
