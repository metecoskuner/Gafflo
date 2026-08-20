// Stage H — real Supabase notifications. Reuses existing authenticated identities from
// global-setup.js exactly like every prior stage's own suite — never signs up a new user, never
// triggers an OTP/magic-link email.
//
// Like Saved/Smart Match (Stage G) and unlike Viewings (Stage F), the reachable real event here
// (a tenant's own create_application()/start_conversation() call) needs no landlord ownership at
// all — a tenant can trigger both against any real published listing regardless of who owns it.
// That makes the tenant's OWN receipt notification (application_submitted) fully reachable live.
// The corresponding LANDLORD notification (new_application/new_enquiry) is real and proven at the
// backend level by the pgTAP suite (supabase/tests/notifications_test.sql), but — same constraint
// documented in every prior stage's own file header — no frontend-controlled landlord identity in
// this shared environment owns a published listing to read it as, so it cannot be observed live
// through the browser here.
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

async function pickListing(tenantUserId, accessToken, { excludeIds = new Set() } = {}) {
  const { json: publicListings } = await rest('public_listings?select=id,owner_id,title', { accessToken })
  const candidate = (publicListings || []).find(
    (row) => row.owner_id !== tenantUserId && row.owner_id !== KNOWN_INACTIVE_OWNER_ID && !excludeIds.has(row.id),
  )
  if (!candidate) throw new Error('No applicable published listing left in the shared pool for this identity — see the file header comment.')
  return candidate
}

test.describe('Stage H — real notifications', () => {
  test('a real event creates a real, persistent notification the tenant can see, read, and mark read through the UI', async ({ page }) => {
    const { accessToken, userId } = sessionFor('tenantHousehold1Room')
    const listing = await pickListing(userId, accessToken)

    const result = await rpc('create_application', { p_listing_id: listing.id }, { accessToken })
    expect(result.status).toBe(200)
    const applicationId = result.json

    const { json: rows } = await rest(
      `notifications?user_id=eq.${userId}&application_id=eq.${applicationId}&type=eq.application_submitted&select=id,title,read_at`,
      { accessToken },
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].read_at).toBeNull()

    await seedSession(page, 'tenantHousehold1Room')
    await page.goto('/discover')
    await expect(page.getByRole('button', { name: 'Notifications' })).toBeVisible({ timeout: 10000 })
    await page.getByRole('button', { name: 'Notifications' }).click()
    await expect(page.getByText('Application sent')).toBeVisible({ timeout: 10000 })

    await page.getByText('Application sent').click()
    // The click handler awaits the real mark-read RPC before navigating to the listing (this
    // notification carries a real listing_id) — waiting for that navigation is what actually
    // synchronizes with the async chain completing, rather than racing a REST check against an
    // in-flight fetch immediately after a synchronous .click() resolves.
    await expect(page).toHaveURL(/\/properties\//, { timeout: 10000 })

    const { json: rowsAfter } = await rest(
      `notifications?id=eq.${rows[0].id}&select=read_at`,
      { accessToken },
    )
    expect(rowsAfter[0].read_at).not.toBeNull()

    // Reload and re-open to confirm the read state is real and persisted, not local UI-only.
    await page.goto('/discover')
    await page.getByRole('button', { name: 'Notifications' }).click()
    const { json: rowsFinal } = await rest(`notifications?id=eq.${rows[0].id}&select=read_at`, { accessToken })
    expect(rowsFinal[0].read_at).not.toBeNull()
  })

  test('mark_all_notifications_read clears every real unread notification for that tenant', async () => {
    const { accessToken, userId } = sessionFor('tenantHousehold3Room')
    const listingA = await pickListing(userId, accessToken)
    await rpc('create_application', { p_listing_id: listingA.id }, { accessToken })
    const listingB = await pickListing(userId, accessToken, { excludeIds: new Set([listingA.id]) })
    // start_conversation() only notifies the LANDLORD (new_enquiry) by design — there is no
    // "you started a conversation" self-receipt for the tenant (see the Stage H migration's own
    // header comment), unlike create_application()'s deliberate both-sides notification. So this
    // second action does not add to the TENANT's own unread count; it only adds a second
    // create_application() to prove mark_all really clears more than a single row.
    const listingC = await pickListing(userId, accessToken, { excludeIds: new Set([listingA.id, listingB.id]) })
    await rpc('start_conversation', { p_listing_id: listingB.id, p_initial_message: 'Hi, is this still available?' }, { accessToken })
    await rpc('create_application', { p_listing_id: listingC.id }, { accessToken })

    const { json: beforeUnread } = await rest(`notifications?user_id=eq.${userId}&read_at=is.null&select=id`, { accessToken })
    expect(beforeUnread.length).toBeGreaterThanOrEqual(2)

    const markAll = await rpc('mark_all_notifications_read', {}, { accessToken })
    // mark_all_notifications_read() is `returns void` — PostgREST correctly responds 204 No
    // Content for a void RPC, not 200 (unlike create_application()/create_notification(), which
    // return a real uuid and get 200 with a JSON body).
    expect(markAll.status).toBe(204)

    const { json: afterUnread } = await rest(`notifications?user_id=eq.${userId}&read_at=is.null&select=id`, { accessToken })
    expect(afterUnread).toHaveLength(0)
  })

  test('cross-tenant notification data stays private', async () => {
    const { accessToken: tenantAToken, userId: tenantAId } = sessionFor('tenantHousehold4Any')
    const listing = await pickListing(tenantAId, tenantAToken)
    await rpc('create_application', { p_listing_id: listing.id }, { accessToken: tenantAToken });

    const { accessToken: tenantBToken } = sessionFor('tenantNoFacts')
    const { json: crossRead } = await rest(`notifications?user_id=eq.${tenantAId}&select=id`, { accessToken: tenantBToken })
    expect(crossRead).toHaveLength(0)
  })

  test('anonymous cannot read or write any notification surface', async () => {
    const readResult = await rest('notifications?select=id&limit=1')
    expect(readResult.status).toBe(401)
    expect(readResult.json.code).toBe('42501')

    const markResult = await rpc('mark_all_notifications_read', {})
    expect(markResult.status).toBe(401)
    expect(markResult.json.code).toBe('42501')
  })

  test('a forged direct insert into notifications is blocked — no client INSERT grant exists at all', async () => {
    const { accessToken, userId } = sessionFor('tenantCompleteFacts')
    const forged = await rest('notifications', {
      method: 'POST',
      accessToken,
      prefer: 'return=representation',
      body: { user_id: userId, type: 'application_submitted', title: 'Forged notification' },
    })
    expect([401, 403]).toContain(forged.status)
    expect(forged.json.code).toBe('42501')
  })

  test('a stale localStorage notification override can never appear as real state, and an honest empty state renders when there is nothing real yet', async ({ page }) => {
    await seedSession(page, 'tenantBudgetMinZero')
    await page.addInitScript(() => {
      window.localStorage.setItem('gafflo.notifications', JSON.stringify([
        { id: 'forged-notification', title: 'Welcome to Gafflo!', body: 'This should never render.', read: false, createdAt: new Date().toISOString() },
      ]))
    })
    await page.goto('/discover')
    await page.getByRole('button', { name: 'Notifications' }).click()
    await expect(page.getByText('This should never render.')).toHaveCount(0)
    await expect(page.getByText('Welcome to Gafflo!')).toHaveCount(0)
    // Whatever real notifications this identity genuinely has (or none) is what must render —
    // the honest empty state is an acceptable, expected real outcome here, not a failure. Either
    // the real empty-state heading or at least one real notification title must be visible; a
    // silently blank/broken panel is not acceptable either.
    await expect(page.getByText('all caught up').or(page.locator('ul li').first())).toBeVisible({ timeout: 10000 })
  })
})
