// Stage F — real Supabase viewing_proposals/viewing_slots. Reuses existing authenticated
// identities from global-setup.js exactly like e2e/applications.spec.js/e2e/messaging.spec.js —
// never signs up a new user, never triggers an OTP/magic-link email.
//
// A STRONGER version of the same constraint already documented in applications.spec.js/
// messaging.spec.js's own file headers: propose_viewing() requires the caller to own the
// listing the target application belongs to, and the target application must already be
// 'shortlisted'. Live investigation for Stage F (direct REST checks against every controlled
// landlord identity — landlordDefault/landlordListingOwnerA/landlordListingOwnerB — immediately
// before writing this file) confirmed all three own zero listings of any status, and every
// controlled tenant identity's real applications are all still 'sent' (none have ever been
// viewed/landlord_interested/shortlisted by anyone). Unlike Messaging (where a tenant can start a
// real conversation on ANY published listing regardless of who owns it) or Applications (where a
// tenant can apply to any published listing), Viewings has NO entry point that doesn't require a
// controlled identity to already own a listing with a shortlisted applicant — and nothing in this
// shared environment can reach that state without moderator/service-role privilege, which this
// suite deliberately does not use (see the Stage F final report's real-Supabase-validation
// section for the exact investigation and why self-publishing was not attempted).
//
// What this file CAN and does verify for real: every rejection path that does NOT require a real
// shortlisted application to exist — anonymous access, forged/foreign proposal ids, an
// unauthorized caller attempting propose/accept/decline/cancel, and a poisoned local viewing
// override having zero effect on real Dashboard/Applicants rendering. The full propose -> accept
// -> confirm happy path, the terminal-application auto-cancel, and the block/platform-status
// interactions are proven instead by the pre-existing 85-test pgTAP suite in
// supabase/tests/viewings_pipeline_test.sql (parts 1-12), which this suite's header cites rather
// than re-implements.
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

// global-setup.js creates a brand-new real Supabase user for every identity on every single
// `npx playwright test` invocation (fresh email/user id each run — see its own buildIdentity()) —
// so a fresh run of just this file cannot assume any identity already has a real application from
// some earlier run. This creates one for real via create_application() if none exists yet,
// mirroring applications.spec.js/messaging.spec.js's own ensure*() idempotent helper pattern
// (self-contained on purpose: playwright.config.js runs with fullyParallel: true).
const KNOWN_INACTIVE_OWNER_ID = '8c76e949-7825-4c3d-9f81-78f8b3dcb09a'

async function ensureApplication(identityName) {
  const { accessToken, userId } = sessionFor(identityName)
  const { json: existing } = await rest('applications?select=id&limit=1', { accessToken })
  if (existing?.length) return { applicationId: existing[0].id, accessToken, userId }
  const { json: publicListings } = await rest('public_listings?select=id,owner_id', { accessToken })
  const candidate = (publicListings || []).find((row) => row.owner_id !== userId && row.owner_id !== KNOWN_INACTIVE_OWNER_ID)
  if (!candidate) throw new Error('No applicable published listing left in the shared pool for this identity — see the file header comment.')
  const created = await rpc('create_application', { p_listing_id: candidate.id }, { accessToken })
  if (created.ok) return { applicationId: created.json, accessToken, userId }
  const { json: after } = await rest('applications?select=id&limit=1', { accessToken })
  if (!after?.length) throw new Error(`ensureApplication(${identityName}) failed: ${JSON.stringify(created.json)}`)
  return { applicationId: after[0].id, accessToken, userId }
}

test.describe('Stage F — real viewings', () => {
  test('anonymous cannot read or write any viewing surface', async () => {
    const readProposals = await rest('viewing_proposals?select=id&limit=1')
    expect(readProposals.status).toBe(401)
    expect(readProposals.json.code).toBe('42501')

    const readSlots = await rest('viewing_slots?select=id&limit=1')
    expect(readSlots.status).toBe(401)
    expect(readSlots.json.code).toBe('42501')

    const { applicationId } = await ensureApplication('tenantDefault')
    const proposeResult = await rpc('propose_viewing', { p_application_id: applicationId, p_slots: [] })
    expect(proposeResult.status).toBe(401)
    expect(proposeResult.json.code).toBe('42501')
  })

  test('a real tenant cannot propose a viewing for someone else\'s application (not the listing owner)', async () => {
    const { applicationId, accessToken } = await ensureApplication('tenantDefault')

    const result = await rpc(
      'propose_viewing',
      { p_application_id: applicationId, p_slots: [{ starts_at: new Date(Date.now() + 86400000).toISOString(), ends_at: new Date(Date.now() + 90000000).toISOString() }] },
      { accessToken },
    )
    // propose_viewing() requires the caller to own the listing the application belongs to
    // (`l.owner_id = auth.uid()`) — a tenant identity never owns any listing at all, so this must
    // fail with the same "Not authorized" guard a foreign landlord would also hit.
    expect(result.status).toBe(403)
    expect(result.json.code).toBe('42501')
  })

  test('a real (but foreign) application id is rejected for every controlled landlord identity, since none owns it', async () => {
    const { applicationId } = await ensureApplication('tenantDefault')

    for (const landlordName of ['landlordDefault', 'landlordListingOwnerA', 'landlordListingOwnerB']) {
      const { accessToken } = sessionFor(landlordName)
      const result = await rpc(
        'propose_viewing',
        { p_application_id: applicationId, p_slots: [{ starts_at: new Date(Date.now() + 86400000).toISOString(), ends_at: new Date(Date.now() + 90000000).toISOString() }] },
        { accessToken },
      )
      expect(result.status).toBe(403)
      expect(result.json.code).toBe('42501')
    }
  })

  test('accept/decline/cancel all reject a forged/nonexistent proposal id the same way as a real foreign one', async () => {
    const { accessToken } = sessionFor('tenantDefault')
    const forgedId = '00000000-0000-0000-0000-000000000000'

    const accept = await rpc('accept_viewing_slot', { p_proposal_id: forgedId, p_slot_id: forgedId }, { accessToken })
    expect(accept.status).toBe(403)
    expect(accept.json.code).toBe('42501')

    const decline = await rpc('decline_viewing', { p_proposal_id: forgedId }, { accessToken })
    expect(decline.status).toBe(403)
    expect(decline.json.code).toBe('42501')

    const cancel = await rpc('cancel_viewing', { p_proposal_id: forgedId }, { accessToken })
    expect(cancel.status).toBe(403)
    expect(cancel.json.code).toBe('42501')
  })

  test('a forged direct insert into viewing_proposals is blocked — no client INSERT grant exists at all', async () => {
    const { applicationId, accessToken, userId } = await ensureApplication('tenantDefault')

    const directInsert = await rest('viewing_proposals', {
      method: 'POST',
      accessToken,
      prefer: 'return=representation',
      body: { application_id: applicationId, landlord_id: userId, tenant_id: userId, status: 'confirmed' },
    })
    expect([401, 403]).toContain(directInsert.status)
    expect(directInsert.json.code).toBe('42501')
  })

  // cancel_viewing_for_terminal_application is internal-only by design (no grant to anon or
  // authenticated at all — see the Stage F migration part 10) — confirms the client genuinely
  // cannot call it directly, only through withdraw_application()/landlord_set_application_status().
  test('the internal terminal-auto-cancel helper has no client execute grant', async () => {
    const { accessToken } = sessionFor('tenantDefault')
    const result = await rpc('cancel_viewing_for_terminal_application', { p_application_id: '00000000-0000-0000-0000-000000000000' }, { accessToken })
    expect([401, 403, 404]).toContain(result.status)
  })

  test('a real controlled landlord with zero owned listings sees the honest empty Applicants page, never a fake viewing', async ({ page }) => {
    await seedSession(page, 'landlordDefault')
    await page.addInitScript(() => {
      // Poisons any legacy-shaped local viewing key that might exist from an old mock build —
      // real Applicants.jsx/Dashboard.jsx never read any such key (100% Supabase-backed), so this
      // must have zero effect on what actually renders.
      window.localStorage.setItem('gafflo.viewings', JSON.stringify([{ id: 'forged-viewing', status: 'confirmed', startsAt: new Date().toISOString() }]))
    })
    await page.goto('/applicants')
    await expect(page.getByText('No applicants yet')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Arrange viewing')).toHaveCount(0)
  })

  test('a real controlled tenant sees an honest dashboard with no fabricated upcoming viewing', async ({ page }) => {
    await seedSession(page, 'tenantDefault')
    await page.addInitScript(() => {
      window.localStorage.setItem('gafflo.viewings', JSON.stringify([{ id: 'forged-viewing', status: 'confirmed', startsAt: new Date().toISOString() }]))
    })
    await page.goto('/dashboard')
    await expect(page.getByText('Upcoming viewings')).toHaveCount(0)
  })
})
