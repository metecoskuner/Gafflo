// Stage D — real Supabase applications/application_status_events. Reuses existing authenticated
// identities from global-setup.js, exactly like e2e/listings.spec.js — never signs up a new user,
// never triggers an OTP/magic-link email.
//
// A real constraint discovered while writing this suite: no frontend-controlled identity
// (landlordDefault/landlordListingOwnerA/landlordListingOwnerB) owns any of the handful of real
// published listings currently in gafflo-dev — those were published via direct backend/dashboard
// moderation during earlier backend validation phases, by accounts this frontend test suite has
// no credentials for (there is still no moderator-capable frontend identity — see the Stage C
// final report). That means:
//   - The full TENANT-side apply/withdraw/status/snapshot/Rental-Fit flow can be exercised for
//     real, end to end, against one of those pre-existing published listings — done below.
//   - The full LANDLORD-side UI flow (Applicants.jsx rendering a real applicant, mark-viewed,
///    status transitions, dashboard "new applicant" count) cannot be driven through the browser
//     as the real owner of one of those listings, because we cannot authenticate as that owner.
//     What CAN be verified for real without that credential: (a) a landlord identity we do
//     control correctly sees the honest empty state when they own zero applications, and
//     (b) the landlord-only RPCs (mark_application_viewed/landlord_set_application_status)
//     really do reject a landlord identity we control when called against an application on a
//     listing they don't own — the same cross-landlord privacy guarantee, exercised directly
//     against the real RPC rather than through UI we cannot reach. See the Stage D final report.
//
// A known, accepted side effect, same trade-off class as e2e/listings.spec.js's draft
// accumulation: applications are never hard-deleted (by design — see the Stage D migration), so
// the "apply/withdraw" tests below permanently consume one of the shared published listings per
// run for tenantDefault. There are currently 6; this is bounded and accepted, not an oversight.
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

// Poisons gafflo.enquiries with a fake, more-favorable-looking status for the same listing —
// ApplicationsProvider never reads this key at all (see config/devAuthBypass.js's sibling
// comment style elsewhere in this codebase on why: applications is 100% Supabase-backed), so
// this must have zero effect on what the real application status card shows.
async function seedStaleEnquiryOverride(page, listingId) {
  await page.addInitScript((id) => {
    window.localStorage.setItem('gafflo.enquiries', JSON.stringify([
      {
        id: `enquiry-${id}-forged`,
        propertyId: id,
        tenantId: 'tenant-local',
        ownerId: 'owner-private-1',
        status: 'landlord interested',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        message: 'Forged local status.',
        viewing: { status: 'none', proposedSlots: [], selectedSlot: '' },
      },
    ]))
  }, listingId)
}

// Confirmed live during Stage D validation: this owner's account (its listings are titled
// "Phase 4 listing N") is not platform_status = 'active', so create_application() correctly and
// realistically rejects every application to any of its listings with "This listing is not
// currently accepting applications" (see the Stage D migration's create_application(), the
// v_owner_status check) — a real, correct backend rejection, not a bug. Excluded here rather than
// worked around, since there is no way to discover this in advance without attempting an apply
// (profiles.platform_status is not readable cross-user) and this suite must not spend a real
// application attempt just to probe listing viability.
const KNOWN_INACTIVE_OWNER_ID = '8c76e949-7825-4c3d-9f81-78f8b3dcb09a'

// Any currently-published real listing the tenant hasn't already applied to, doesn't own, and
// isn't owned by a known-inactive account — see the file header for why these can only come from
// the pre-existing shared pool, never self-published by this suite.
async function pickApplicableListing(tenantUserId, accessToken) {
  const { json: publicListings } = await rest('public_listings?select=id,owner_id,title', { accessToken })
  const { json: existing } = await rest('applications?select=listing_id', { accessToken })
  const appliedIds = new Set((existing || []).map((row) => row.listing_id))
  const candidate = (publicListings || []).find(
    (row) => row.owner_id !== tenantUserId && row.owner_id !== KNOWN_INACTIVE_OWNER_ID && !appliedIds.has(row.id),
  )
  if (!candidate) throw new Error('No applicable published listing left in the shared pool for this identity — see the file header comment.')
  return { id: candidate.id, title: candidate.title }
}

// Idempotent and self-contained on purpose: playwright.config.js runs with fullyParallel: true,
// so tests must never assume another specific test already ran first. This checks for any
// existing real application before creating one, so the handful of tests below that only need
// "some real application belonging to this tenant" (not a specific one) converge on reusing
// whichever already exists rather than each consuming a fresh listing from the shared pool.
async function ensureApplication(identityName) {
  const { accessToken, userId } = sessionFor(identityName)
  const { json: existing } = await rest('applications?select=id,listing_id&limit=1', { accessToken })
  if (existing?.length) return { applicationId: existing[0].id, listingId: existing[0].listing_id, accessToken, userId }
  const { id: listingId } = await pickApplicableListing(userId, accessToken)
  const created = await rpc('create_application', { p_listing_id: listingId }, { accessToken })
  if (created.ok) return { applicationId: created.json, listingId, accessToken, userId }
  // Lost a race against another concurrent test also using this identity (fullyParallel: true) —
  // the row now exists for real regardless of which call actually created it, so fetch it rather
  // than trusting this call's own (error) response.
  const { json: after } = await rest('applications?select=id,listing_id&limit=1', { accessToken })
  if (!after?.length) throw new Error(`ensureApplication(${identityName}) failed: ${JSON.stringify(created.json)}`)
  return { applicationId: after[0].id, listingId: after[0].listing_id, accessToken, userId }
}

async function createDraftViaRest(identityName, fields = {}) {
  const { accessToken, userId } = sessionFor(identityName)
  const { status, json } = await rest('listings?select=id', {
    method: 'POST',
    accessToken,
    prefer: 'return=representation',
    body: { owner_id: userId, listing_category: 'entire_property', ...fields },
  })
  if (status !== 201 || !json?.[0]?.id) throw new Error(`createDraftViaRest(${identityName}) failed: HTTP ${status} ${JSON.stringify(json)}`)
  return json[0].id
}

test.describe('Stage D — real applications', () => {
  test('tenant applies to a real published listing through the UI: real status appears, survives reload, and is reflected in Browse/Dashboard', async ({ page }) => {
    const { accessToken, userId } = sessionFor('tenantDefault')
    const { id: listingId, title: listingTitle } = await pickApplicableListing(userId, accessToken)

    await seedSession(page, 'tenantDefault')
    await page.goto(`/properties/${listingId}`)
    await expect(page.getByRole('button', { name: 'Apply' })).toBeVisible({ timeout: 10000 })

    const { json: startingApplications } = await rest('applications?select=id', { accessToken })
    const startingCount = startingApplications.length

    await page.getByRole('button', { name: 'Apply' }).click()
    await expect(page.getByRole('button', { name: 'Withdraw application' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText("What's happening?")).toBeVisible()

    // Real, durable server truth — not client state.
    await expect.poll(async () => {
      const { json } = await rest('applications?select=id', { accessToken })
      return json.length
    }).toBe(startingCount + 1)

    const { json: created } = await rest(`applications?listing_id=eq.${listingId}&tenant_id=eq.${userId}&select=id,status,tenant_id,rental_fit_score,rental_fit_breakdown,rental_fit_algorithm_version,tenant_snapshot`, { accessToken })
    expect(created).toHaveLength(1)
    const application = created[0]
    // Server-derived only — the frontend never sent tenant_id/status/snapshot/fit.
    expect(application.tenant_id).toBe(userId)
    expect(application.status).toBe('sent')
    expect(application.rental_fit_score).toBeGreaterThanOrEqual(0)
    expect(application.rental_fit_score).toBeLessThanOrEqual(100)
    expect(application.rental_fit_algorithm_version).toBe('v1')
    expect(application.tenant_snapshot).toBeTruthy()
    expect(application.tenant_snapshot).not.toHaveProperty('score') // breakdown only, score is its own column

    await page.reload()
    await expect(page.getByRole('button', { name: 'Withdraw application' })).toBeVisible({ timeout: 10000 })

    await page.goto('/discover')
    await page.getByRole('button', { name: 'Browse' }).click()
    const listingTitleLocator = page.locator('article', { hasText: listingTitle })
    await expect(listingTitleLocator.getByText(/Application status:/)).toBeVisible()

    await page.goto('/dashboard')
    await expect(page.getByText('Applications')).toBeVisible()
  })

  test('a tenant cannot apply twice to the same listing: the UI recognizes the existing application and the server rejects a forced duplicate', async ({ page }) => {
    const { listingId, accessToken } = await ensureApplication('tenantDefault')

    await seedSession(page, 'tenantDefault')
    await page.goto(`/properties/${listingId}`)
    // Already applied — the UI must never offer a second "Apply", only Withdraw/terminal status.
    await expect(page.getByRole('button', { name: 'Apply' })).toHaveCount(0)

    // A forced direct duplicate call must still be rejected server-side (23505) — the real
    // authoritative guard, not just the UI's own "already applied" recognition.
    const { status, json } = await rpc('create_application', { p_listing_id: listingId }, { accessToken })
    expect(status).toBe(409)
    expect(json.code).toBe('23505')
  })

  test('cannot apply to a listing that is not published (draft), regardless of who owns it', async () => {
    const draftListingId = await createDraftViaRest('landlordListingOwnerA', { title: 'Stage D e2e draft — never published' })
    const { accessToken } = sessionFor('tenantDefault')

    const { status, json } = await rpc('create_application', { p_listing_id: draftListingId }, { accessToken })
    expect(status).toBe(400)
    expect(json.message).toMatch(/not currently open for applications/i)
  })

  test('anonymous cannot read or create applications — no grant at all, not just an RLS-empty result', async () => {
    // This gafflo-dev project's PostgREST maps a bare grant-level "permission denied" (42501,
    // with no explicit application-level RAISE behind it) to HTTP 401, not 403 — confirmed live;
    // see the cross-landlord test below for the contrasting case (an explicit `RAISE EXCEPTION
    // ... USING errcode = '42501'` from inside a SECURITY DEFINER function, called with a real
    // authenticated JWT, which does map to 403). The important thing here is denial + the real
    // 42501 code, not which specific 4xx status carries it.
    const readResult = await rest('applications?select=id&limit=1')
    expect(readResult.status).toBe(401)
    expect(readResult.json.code).toBe('42501')

    const { json: anyListing } = await rest('public_listings?select=id&limit=1')
    const createResult = await rpc('create_application', { p_listing_id: anyListing[0].id })
    expect(createResult.status).toBe(401)
    expect(createResult.json.code).toBe('42501')
  })

  test('a tenant cannot see another tenant\'s application', async () => {
    const { applicationId } = await ensureApplication('tenantDefault')

    const { accessToken: otherTenantToken } = sessionFor('tenantNoAreas')
    const { json: otherTenantView } = await rest(`applications?id=eq.${applicationId}&select=id`, { accessToken: otherTenantToken })
    expect(otherTenantView).toHaveLength(0)
  })

  test('a landlord who does not own the listing cannot mark it viewed or change its status — the real cross-landlord guard', async () => {
    const { applicationId } = await ensureApplication('tenantDefault')

    const { accessToken: unrelatedLandlordToken } = sessionFor('landlordListingOwnerA')
    const viewedResult = await rpc('mark_application_viewed', { p_application_id: applicationId }, { accessToken: unrelatedLandlordToken })
    expect(viewedResult.status).toBe(403)
    expect(viewedResult.json.code).toBe('42501')

    const statusResult = await rpc(
      'landlord_set_application_status',
      { p_application_id: applicationId, p_new_status: 'shortlisted' },
      { accessToken: unrelatedLandlordToken },
    )
    expect(statusResult.status).toBe(403)
    expect(statusResult.json.code).toBe('42501')
  })

  test('a landlord who owns zero real applications sees the honest empty state, not a crash or fixture data', async ({ page }) => {
    await seedSession(page, 'landlordDefault')
    await page.goto('/applicants')
    await expect(page.getByText('No applicants yet')).toBeVisible({ timeout: 10000 })
  })

  test('withdraw is real and durable, and a withdrawn application can never be reapplied to', async ({ page }) => {
    const { accessToken, userId } = sessionFor('tenantWaterford')
    const { id: listingId } = await pickApplicableListing(userId, accessToken)

    await seedSession(page, 'tenantWaterford')
    await page.goto(`/properties/${listingId}`)
    await page.getByRole('button', { name: 'Apply' }).click()
    await expect(page.getByRole('button', { name: 'Withdraw application' })).toBeVisible({ timeout: 10000 })

    await page.getByRole('button', { name: 'Withdraw application' }).click()
    await expect(page.getByText('Withdrawn', { exact: true }).first()).toBeVisible({ timeout: 10000 })
    // Terminal — no Apply, no Withdraw, ever again for this listing/tenant pair.
    await expect(page.getByRole('button', { name: 'Apply' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Withdraw application' })).toHaveCount(0)

    await expect.poll(async () => {
      const { json } = await rest(`applications?listing_id=eq.${listingId}&tenant_id=eq.${userId}&select=status`, { accessToken })
      return json[0]?.status
    }).toBe('withdrawn')

    const { status, json } = await rpc('create_application', { p_listing_id: listingId }, { accessToken })
    expect(status).toBe(409)
    expect(json.code).toBe('23505')
  })

  test('the frozen tenant snapshot never changes after the tenant later edits their real profile', async () => {
    const { accessToken, userId } = sessionFor('tenantHousehold2Room')
    const { id: listingId } = await pickApplicableListing(userId, accessToken)

    await rpc('create_application', { p_listing_id: listingId }, { accessToken }).catch(() => {})
    const { json: [before] } = await rest(`applications?listing_id=eq.${listingId}&tenant_id=eq.${userId}&select=tenant_snapshot`, { accessToken })
    expect(before.tenant_snapshot).toBeTruthy()
    const originalBudgetMax = before.tenant_snapshot.budget_max

    const { json: [profileRow] } = await rest(`tenant_profiles?profile_id=eq.${userId}&select=budget_max`, { accessToken })
    const originalLiveBudgetMax = profileRow.budget_max
    const changedBudgetMax = (originalLiveBudgetMax || 1000) + 777

    try {
      await rest(`tenant_profiles?profile_id=eq.${userId}`, { method: 'PATCH', accessToken, body: { budget_max: changedBudgetMax } })
      const { json: [after] } = await rest(`applications?listing_id=eq.${listingId}&tenant_id=eq.${userId}&select=tenant_snapshot`, { accessToken })
      expect(after.tenant_snapshot.budget_max).toBe(originalBudgetMax)
      expect(after.tenant_snapshot.budget_max).not.toBe(changedBudgetMax)
    } finally {
      // Leave the real profile exactly as found — this identity is shared with other tests.
      await rest(`tenant_profiles?profile_id=eq.${userId}`, { method: 'PATCH', accessToken, body: { budget_max: originalLiveBudgetMax } })
    }
  })

  test('a forged gafflo.enquiries entry can never override the real application status shown', async ({ page }) => {
    const { listingId } = await ensureApplication('tenantDefault')

    await seedSession(page, 'tenantDefault')
    await seedStaleEnquiryOverride(page, listingId)
    await page.goto(`/properties/${listingId}`)

    // The forged local status claims "landlord interested" — if it leaked through anywhere, it
    // would render here. Only the real, server-derived status pill/label may appear.
    await expect(page.getByText('Landlord interested')).toHaveCount(0)
    await expect(page.getByText("What's happening?")).toBeVisible()
  })
})
