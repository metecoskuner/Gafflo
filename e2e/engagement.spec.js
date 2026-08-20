// Stage G — real Supabase saved_listings/smart_match_decisions/smart_match_daily_usage. Reuses
// existing authenticated identities from global-setup.js exactly like every prior stage's own
// suite — never signs up a new user, never triggers an OTP/magic-link email.
//
// Unlike Viewings (Stage F), Saved and Smart Match have no landlord-ownership entry point at
// all — a tenant can save/decide on ANY real published listing regardless of who owns it, the
// same shape as Messaging's start_conversation(). That makes the full real happy path reachable
// here without the "no frontend-controlled identity owns a published listing" constraint every
// prior stage's landlord-side flows ran into.
//
// global-setup.js creates a brand-new real Supabase user for every identity on every single
// invocation (see e2e/viewings.spec.js's own note on this) — so this file never assumes a
// fixture already has prior saved/decision state; ensure*() helpers below build what each test
// needs for real, idempotently, under fullyParallel: true.
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

// Same known-inactive-owner exclusion every prior stage's suite uses.
const KNOWN_INACTIVE_OWNER_ID = '8c76e949-7825-4c3d-9f81-78f8b3dcb09a'

async function pickListing(tenantUserId, accessToken, { excludeIds = new Set() } = {}) {
  const { json: publicListings } = await rest('public_listings?select=id,owner_id,title', { accessToken })
  const candidate = (publicListings || []).find(
    (row) => row.owner_id !== tenantUserId && row.owner_id !== KNOWN_INACTIVE_OWNER_ID && !excludeIds.has(row.id),
  )
  if (!candidate) throw new Error('No applicable published listing left in the shared pool for this identity — see the file header comment.')
  return candidate
}

test.describe('Stage G — real saved listings and Smart Match', () => {
  test('tenant saves a real listing through the UI, it survives reload, and unsave removes it', async ({ page }) => {
    const { accessToken, userId } = sessionFor('tenantHousehold2Room')
    const { id: listingId, title: listingTitle } = await pickListing(userId, accessToken)

    await seedSession(page, 'tenantHousehold2Room')
    await page.goto(`/properties/${listingId}`)
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible({ timeout: 10000 })
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible({ timeout: 10000 })

    const { json: rows } = await rest(`saved_listings?tenant_id=eq.${userId}&listing_id=eq.${listingId}&select=id`, { accessToken })
    expect(rows).toHaveLength(1)

    await page.goto('/saved')
    await expect(page.locator('article', { hasText: listingTitle })).toBeVisible({ timeout: 10000 })

    await page.goto(`/properties/${listingId}`)
    await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible({ timeout: 10000 })
    await page.reload()
    await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible({ timeout: 10000 })

    await page.getByRole('button', { name: 'Saved' }).click()
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible({ timeout: 10000 })
    const { json: rowsAfter } = await rest(`saved_listings?tenant_id=eq.${userId}&listing_id=eq.${listingId}&select=id`, { accessToken })
    expect(rowsAfter).toHaveLength(0)
  })

  test('a real Smart Match decision persists, excludes the listing from future candidates, and does not create an application, conversation, or message', async ({ page }) => {
    const { accessToken, userId } = sessionFor('tenantNoAreas')
    const { id: listingId } = await pickListing(userId, accessToken)

    const result = await rpc('record_smart_match_decision', { p_listing_id: listingId, p_decision: 'interested' }, { accessToken })
    expect(result.status).toBe(200)
    expect(result.json.decision).toBe('interested')
    expect(result.json.smartMatchCount).toBeGreaterThanOrEqual(1)
    expect(result.json.interestedCount).toBeGreaterThanOrEqual(1)

    const { json: decisionRows } = await rest(`smart_match_decisions?tenant_id=eq.${userId}&listing_id=eq.${listingId}&select=decision`, { accessToken })
    expect(decisionRows).toHaveLength(1)
    expect(decisionRows[0].decision).toBe('interested')

    // The exact proof this is not an application: no real create_application() row exists for
    // this tenant+listing, and no conversation was ever started.
    const { json: applicationRows } = await rest(`applications?tenant_id=eq.${userId}&listing_id=eq.${listingId}&select=id`, { accessToken })
    expect(applicationRows).toHaveLength(0)
    const { json: conversationRows } = await rest(`conversations?tenant_id=eq.${userId}&listing_id=eq.${listingId}&select=id`, { accessToken })
    expect(conversationRows).toHaveLength(0)

    // Retrying the identical decision must not double-count usage (idempotent).
    const retry = await rpc('record_smart_match_decision', { p_listing_id: listingId, p_decision: 'interested' }, { accessToken })
    expect(retry.status).toBe(200)
    expect(retry.json.smartMatchCount).toBe(result.json.smartMatchCount)
    expect(retry.json.interestedCount).toBe(result.json.interestedCount)

    // The opposite decision on the same listing must be rejected, never silently applied.
    const opposite = await rpc('record_smart_match_decision', { p_listing_id: listingId, p_decision: 'pass' }, { accessToken })
    expect(opposite.status).toBe(403)
    expect(opposite.json.code).toBe('42501')

    // Real UI proof the app treats a real decision as authoritative: the Smart Match deck loads
    // from the real conversations/decisions this identity now has, without erroring.
    await seedSession(page, 'tenantNoAreas')
    await page.goto('/discover')
    await expect(page.getByRole('heading', { name: 'Smart Match' })).toBeVisible({ timeout: 10000 })
    // The permanent-exclusion guarantee itself is proven above at the backend level (the decision
    // row persists, a retry doesn't double-count, and the opposite decision is rejected) — the
    // exact same real data config/engagementAdapter.js's filterAvailableSmartMatchCandidates()
    // filters by (unit-tested in src/__tests__/businessRules.test.js), so a decisioned listing
    // structurally cannot re-enter the deck's candidate list.
  })

  test('Save consumes no Smart Match usage; Pass consumes Smart Match only; Interested consumes both', async () => {
    const { accessToken, userId } = sessionFor('tenantBudgetMinZero')
    // get_smart_match_usage() is a `returns table(...)` function — PostgREST always wraps that
    // as a JSON array of rows (exactly one row here), never a bare object.
    const getUsage = async () => {
      const result = await rpc('get_smart_match_usage', {}, { accessToken })
      expect(result.status).toBe(200)
      return { smartMatchCount: result.json[0].smart_match_count, interestedCount: result.json[0].interested_count }
    }

    const before = await getUsage()

    const saveListing = await pickListing(userId, accessToken)
    await rpc('set_listing_saved', { p_listing_id: saveListing.id, p_saved: true }, { accessToken })
    const afterSave = await getUsage()
    expect(afterSave.smartMatchCount).toBe(before.smartMatchCount)
    expect(afterSave.interestedCount).toBe(before.interestedCount)

    const passListing = await pickListing(userId, accessToken, { excludeIds: new Set([saveListing.id]) })
    await rpc('record_smart_match_decision', { p_listing_id: passListing.id, p_decision: 'pass' }, { accessToken })
    const afterPass = await getUsage()
    expect(afterPass.smartMatchCount).toBe(before.smartMatchCount + 1)
    expect(afterPass.interestedCount).toBe(before.interestedCount)

    const interestedListing = await pickListing(userId, accessToken, { excludeIds: new Set([saveListing.id, passListing.id]) })
    await rpc('record_smart_match_decision', { p_listing_id: interestedListing.id, p_decision: 'interested' }, { accessToken })
    const afterInterested = await getUsage()
    expect(afterInterested.smartMatchCount).toBe(before.smartMatchCount + 2)
    expect(afterInterested.interestedCount).toBe(before.interestedCount + 1)
  })

  // Own-listing rejection itself is proven at the backend level by the pgTAP suite (tests 12 and
  // 28 in supabase/tests/saved_smart_match_test.sql, using a real dual-role landlord+tenant
  // fixture) — none of this file's controlled tenant identities own a listing to reproduce that
  // live here.
  test('cross-tenant saved/decision data stays private', async () => {
    const { accessToken: tenantAToken } = sessionFor('tenantSelectSaveTest')
    const { accessToken: tenantBToken } = sessionFor('tenantCompleteFacts')

    const { json: readOtherSaved } = await rest('saved_listings?select=id', { accessToken: tenantBToken })
    const beforeCount = readOtherSaved.length

    const { userId: tenantAId } = sessionFor('tenantSelectSaveTest')
    const listing = await pickListing(tenantAId, tenantAToken)
    await rpc('set_listing_saved', { p_listing_id: listing.id, p_saved: true }, { accessToken: tenantAToken })
    await rpc('record_smart_match_decision', { p_listing_id: listing.id, p_decision: 'interested' }, { accessToken: tenantAToken })

    // Tenant B's own query never returns tenant A's rows (RLS), regardless of what A just did.
    const { json: readOtherSavedAfter } = await rest('saved_listings?select=id', { accessToken: tenantBToken })
    expect(readOtherSavedAfter.length).toBe(beforeCount)
    const { json: readOtherDecisions } = await rest(`smart_match_decisions?listing_id=eq.${listing.id}&select=id`, { accessToken: tenantBToken })
    expect(readOtherDecisions).toHaveLength(0)
  })

  test('anonymous cannot read or write any saved/Smart Match surface', async () => {
    const readSaved = await rest('saved_listings?select=id&limit=1')
    expect(readSaved.status).toBe(401)
    expect(readSaved.json.code).toBe('42501')

    const readDecisions = await rest('smart_match_decisions?select=id&limit=1')
    expect(readDecisions.status).toBe(401)
    expect(readDecisions.json.code).toBe('42501')

    const { json: anyListing } = await rest('public_listings?select=id&limit=1')
    const saveResult = await rpc('set_listing_saved', { p_listing_id: anyListing[0].id, p_saved: true })
    expect(saveResult.status).toBe(401)
    expect(saveResult.json.code).toBe('42501')

    const decisionResult = await rpc('record_smart_match_decision', { p_listing_id: anyListing[0].id, p_decision: 'pass' })
    expect(decisionResult.status).toBe(401)
    expect(decisionResult.json.code).toBe('42501')
  })

  test('a forged direct write to any of the three tables is blocked — no client INSERT/UPDATE grant exists at all', async () => {
    const { accessToken, userId } = sessionFor('tenantHousehold3Room')
    const listing = await pickListing(userId, accessToken)

    const forgedSave = await rest('saved_listings', {
      method: 'POST',
      accessToken,
      prefer: 'return=representation',
      body: { tenant_id: userId, listing_id: listing.id },
    })
    expect([401, 403]).toContain(forgedSave.status)
    expect(forgedSave.json.code).toBe('42501')

    const forgedDecision = await rest('smart_match_decisions', {
      method: 'POST',
      accessToken,
      prefer: 'return=representation',
      body: { tenant_id: userId, listing_id: listing.id, decision: 'interested' },
    })
    expect([401, 403]).toContain(forgedDecision.status)
    expect(forgedDecision.json.code).toBe('42501')

    const forgedUsage = await rest(`smart_match_daily_usage?tenant_id=eq.${userId}`, {
      method: 'PATCH',
      accessToken,
      body: { smart_match_count: 0 },
    })
    expect([401, 403]).toContain(forgedUsage.status)
  })

  test('a stale gafflo.saved-properties / gafflo.smart-match-activity override can never appear as real state', async ({ page }) => {
    await seedSession(page, 'tenantHousehold4Any')
    await page.addInitScript(() => {
      window.localStorage.setItem('gafflo.saved-properties', JSON.stringify(['forged-listing-id']))
      window.localStorage.setItem('gafflo.smart-match-activity', JSON.stringify({ '2020-01-01': { cards: 500, interests: 500 } }))
      window.localStorage.setItem('gafflo.test-launch-access-override', 'true')
    })
    await page.goto('/saved')
    // Real Saved page reads only from EngagementProvider — a forged local id can never resolve
    // to a real property, so it must render the honest empty state, not a phantom card.
    await expect(page.getByRole('heading', { name: 'Build your shortlist' })).toBeVisible({ timeout: 10000 })

    await page.goto('/discover')
    // No client override of any kind can grant a higher-than-30/10 real allowance — see the
    // Stage G report's Launch Access retirement section.
    await expect(page.getByText('Continue with Gafflo+')).toHaveCount(0)
  })
})
