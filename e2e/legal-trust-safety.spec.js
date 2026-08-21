// Stage J1 — legal pages, report-listing, and the Fair Housing acknowledgement gate. Reuses the
// same authenticated identities from global-setup.js as every prior stage's own suite.
//
// The Fair Housing acknowledgement RPC is exercised directly (not through a full multi-step
// listing-creation-and-review round trip via the browser): landlordListingOwnerA is a fresh real
// identity on every run, so its fair_housing_acknowledged_at genuinely starts null here, and the
// exact request_listing_review() gate behavior around it is already proven exhaustively live in
// supabase/tests/legal_trust_safety_test.sql. This file focuses on what only the browser layer
// can prove: the pages render, the checkbox is real and reachable, and the RPC really persists
// through to a re-render — mirroring Stage I's own documented choice to keep pgTAP as the source
// of truth for backend state-machine correctness and E2E scoped to the real client boundary.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const identities = JSON.parse(readFileSync(path.join(__dirname, '.auth', 'identities.json'), 'utf8'))

function loadEnvLocal() {
  const raw = readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8')
  const values = {}
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    values[trimmed.slice(0, idx)] = trimmed.slice(idx + 1)
  }
  return values
}

const env = { ...loadEnvLocal(), ...process.env }
const SUPABASE_URL = env.VITE_SUPABASE_URL
const ANON_KEY = env.VITE_SUPABASE_ANON_KEY

function sessionFor(identityName) {
  const session = JSON.parse(identities[identityName].storageValue)
  return { accessToken: session.access_token, userId: session.user.id }
}

async function rest(pathAndQuery, { method = 'GET', accessToken, body, prefer } = {}) {
  const headers = { apikey: ANON_KEY, Authorization: `Bearer ${accessToken || ANON_KEY}` }
  if (body) headers['Content-Type'] = 'application/json'
  if (prefer) headers.Prefer = prefer
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  let json = null
  try {
    json = await res.json()
  } catch {
    // no JSON body
  }
  return { status: res.status, ok: res.ok, json }
}

async function rpc(name, args, { accessToken } = {}) {
  return rest(`rpc/${name}`, { method: 'POST', accessToken, body: args })
}

async function seedSession(page, identityName) {
  const session = identities[identityName]
  await page.addInitScript((state) => {
    window.localStorage.clear()
    window.localStorage.setItem(state.storageKey, state.storageValue)
  }, session)
}

const KNOWN_INACTIVE_OWNER_ID = '8c76e949-7825-4c3d-9f81-78f8b3dcb09a'

async function pickListing(viewerUserId, accessToken) {
  const { json: publicListings } = await rest('public_listings?select=id,owner_id,title', { accessToken })
  const candidate = (publicListings || []).find(
    (row) => row.owner_id !== viewerUserId && row.owner_id !== KNOWN_INACTIVE_OWNER_ID,
  )
  if (!candidate) throw new Error('No applicable published listing left in the shared pool for this identity.')
  return candidate
}

test.describe('Stage J1 — signed out', () => {
  // playwright.config.js seeds a real authenticated session into every test by default (see its
  // own comment) — this override is what actually makes "signed out" true here, exactly like
  // e2e/auth.spec.js's own "signed out" describe block already does.
  test.use({ storageState: { cookies: [], origins: [] } })

  test('a genuinely logged-out visitor can reach all four legal pages directly', async ({ page }) => {
    await page.goto('/terms')
    await expect(page.getByRole('heading', { name: 'Terms of Service' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('heading', { name: /welcome to gafflo/i })).toHaveCount(0)

    await page.goto('/privacy')
    await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible({ timeout: 10000 })

    await page.goto('/fair-housing')
    await expect(page.getByRole('heading', { name: 'Fair Housing Policy' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Traveller community')).toBeVisible()

    await page.goto('/acceptable-use')
    await expect(page.getByRole('heading', { name: 'Acceptable Use / Listing Rules' })).toBeVisible({ timeout: 10000 })
  })

  test('protected app routes still require real authentication', async ({ page }) => {
    // Confirms this fix did not widen the gate beyond the four legal paths — each of these must
    // still show the real sign-in screen, never the app itself, for a truly signed-out visitor.
    for (const path of ['/dashboard', '/discover', '/profile', '/messages']) {
      await page.goto(path)
      await expect(page.getByRole('heading', { name: /welcome to gafflo/i })).toBeVisible({ timeout: 10000 })
      await expect(page.getByLabel('Email')).toBeVisible()
    }
  })
})

test.describe('Stage J1 — legal, trust, and safety', () => {
  test('a real authenticated session can still reach the same legal pages', async ({ page }) => {
    await seedSession(page, 'tenantWaterford')
    await page.goto('/fair-housing')
    await expect(page.getByRole('heading', { name: 'Fair Housing Policy' })).toBeVisible({ timeout: 10000 })
  })

  test('reporting a listing through the UI creates a real, idempotent backend report', async ({ page }) => {
    const { accessToken, userId } = sessionFor('tenantCompleteFacts')
    const listing = await pickListing(userId, accessToken)

    await seedSession(page, 'tenantCompleteFacts')
    await page.goto(`/properties/${listing.id}`)
    await page.getByText('Safety and reporting').click()
    await page.getByRole('combobox').selectOption('inappropriate_content')
    await page.getByRole('button', { name: 'Submit report' }).click()
    await expect(page.getByText('Thanks — this listing has been reported.')).toBeVisible({ timeout: 10000 })

    // listing_reports has no client SELECT grant at all, by design — so the real, honest way to
    // confirm a row now exists is the same idempotency the RPC itself guarantees: a second,
    // direct call with the same reporter/listing must report no new row was created.
    const duplicate = await rpc('report_listing', { p_listing_id: listing.id, p_reason: 'other' }, { accessToken })
    expect(duplicate.status).toBe(200)
    expect(duplicate.json).toBe(false)
  })

  test('a fresh landlord sees the Fair Housing checkbox, and acknowledging it is real, live, and idempotent', async ({ page }) => {
    const { accessToken, userId } = sessionFor('landlordListingOwnerA')

    const { json: beforeRows } = await rest(
      `landlord_profiles?profile_id=eq.${userId}&select=fair_housing_acknowledged_at`,
      { accessToken },
    )
    expect(beforeRows[0].fair_housing_acknowledged_at).toBeNull()

    await seedSession(page, 'landlordListingOwnerA')
    await page.goto('/listings/new')
    await expect(page.getByText("I have read and agree to Gafflo's Fair Housing Policy")).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('button', { name: 'Request review' })).toBeDisabled()

    const ack = await rpc('acknowledge_fair_housing_policy', {}, { accessToken })
    expect(ack.status).toBe(204)

    const { json: afterRows } = await rest(
      `landlord_profiles?profile_id=eq.${userId}&select=fair_housing_acknowledged_at`,
      { accessToken },
    )
    expect(afterRows[0].fair_housing_acknowledged_at).not.toBeNull()

    const repeatAck = await rpc('acknowledge_fair_housing_policy', {}, { accessToken })
    expect(repeatAck.status).toBe(204)
    const { json: afterRepeatRows } = await rest(
      `landlord_profiles?profile_id=eq.${userId}&select=fair_housing_acknowledged_at`,
      { accessToken },
    )
    expect(afterRepeatRows[0].fair_housing_acknowledged_at).toBe(afterRows[0].fair_housing_acknowledged_at)

    await page.reload()
    await expect(page.getByText("I have read and agree to Gafflo's Fair Housing Policy")).toHaveCount(0)
  })
})
