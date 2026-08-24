// Stage I — real listing views and aggregate landlord analytics. Reuses the same authenticated
// identities from global-setup.js as prior stages. The live shared environment still does not
// provide a frontend-controlled landlord identity that owns a published listing, so landlord
// aggregate correctness is covered in pgTAP; this E2E file focuses on the reachable live client
// boundary: full details record a passive view, duplicates are idempotent, raw table access is
// blocked, and views create no lead/notification side effects.
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

async function pickListing(viewerUserId, accessToken, { excludeIds = new Set() } = {}) {
  const { json: publicListings } = await rest('public_listings?select=id,owner_id,title', { accessToken })
  const candidate = (publicListings || []).find(
    (row) => row.owner_id !== viewerUserId && row.owner_id !== KNOWN_INACTIVE_OWNER_ID && !excludeIds.has(row.id),
  )
  if (!candidate) throw new Error('No applicable published listing left in the shared pool for this identity.')
  return candidate
}

test.describe('Stage I — listing views and analytics', () => {
  test('opening the full property details experience records a real passive listing view, idempotently', async ({ page }) => {
    const { accessToken, userId } = sessionFor('tenantWaterford')
    const listing = await pickListing(userId, accessToken)

    await seedSession(page, 'tenantWaterford')
    const viewRecorded = page.waitForResponse(
      (response) => response.url().includes('/rest/v1/rpc/record_listing_view') && response.request().method() === 'POST',
      { timeout: 10000 },
    )
    await page.goto(`/properties/${listing.id}`)
    await expect(page.getByRole('button', { name: 'Save' }).or(page.getByRole('button', { name: 'Saved' }))).toBeVisible({ timeout: 10000 })

    const response = await viewRecorded
    expect(response.status()).toBe(200)
    // Not asserting `true` here: tenantWaterford is a stable, reused fixture identity (Stage AG),
    // and listing_views_unique_listing_viewer is a lifetime constraint — an earlier run may have
    // already recorded this exact (viewer, listing) view, in which case this call is legitimately
    // a duplicate returning `false`. What actually needs proving is that the UI triggers the RPC
    // at all, and that the RPC's own idempotency contract holds — the duplicate call right below
    // proves the latter regardless of what this first call returned.
    expect(typeof (await response.json())).toBe('boolean')

    const duplicate = await rpc('record_listing_view', { p_listing_id: listing.id }, { accessToken })
    expect(duplicate.status).toBe(200)
    expect(duplicate.json).toBe(false)
  })

  test('recording a view is idempotent and passive: it creates no notification, application, conversation, save, or Smart Match row', async () => {
    const { accessToken, userId } = sessionFor('tenantNoFacts')
    const listing = await pickListing(userId, accessToken)

    const countOwn = async (path) => {
      const { json } = await rest(path, { accessToken })
      return json.length
    }

    const beforeNotifications = await countOwn(`notifications?listing_id=eq.${listing.id}&select=id`)
    const firstRecord = await rpc('record_listing_view', { p_listing_id: listing.id }, { accessToken })
    expect(firstRecord.status).toBe(200)
    // Same reasoning as the UI test above: tenantNoFacts is a stable, reused identity, so this
    // may legitimately be a repeat view (false) rather than the fixture's first-ever one (true).
    // The real contract to prove is idempotency, not "this happens to be the first execution" —
    // the immediate duplicate call below is guaranteed to be a repeat regardless of firstRecord's
    // own value, and is what actually proves the RPC is idempotent.
    expect(typeof firstRecord.json).toBe('boolean')
    const duplicateRecord = await rpc('record_listing_view', { p_listing_id: listing.id }, { accessToken })
    expect(duplicateRecord.status).toBe(200)
    expect(duplicateRecord.json).toBe(false)

    expect(await countOwn(`notifications?listing_id=eq.${listing.id}&select=id`)).toBe(beforeNotifications)
    expect(await countOwn(`applications?tenant_id=eq.${userId}&listing_id=eq.${listing.id}&select=id`)).toBe(0)
    expect(await countOwn(`conversations?tenant_id=eq.${userId}&listing_id=eq.${listing.id}&select=id`)).toBe(0)
    expect(await countOwn(`saved_listings?tenant_id=eq.${userId}&listing_id=eq.${listing.id}&select=id`)).toBe(0)
    expect(await countOwn(`smart_match_decisions?tenant_id=eq.${userId}&listing_id=eq.${listing.id}&select=id`)).toBe(0)
  })

  test('raw listing_views exposure and non-owner analytics reads are blocked', async () => {
    const { accessToken, userId } = sessionFor('tenantCompleteFacts')
    const listing = await pickListing(userId, accessToken)

    const rawRead = await rest('listing_views?select=id&limit=1', { accessToken })
    expect([401, 403]).toContain(rawRead.status)
    expect(rawRead.json.code).toBe('42501')

    const forgedInsert = await rest('listing_views', {
      method: 'POST',
      accessToken,
      prefer: 'return=representation',
      body: { listing_id: listing.id, viewer_id: userId },
    })
    expect([401, 403]).toContain(forgedInsert.status)
    expect(forgedInsert.json.code).toBe('42501')

    const analytics = await rpc('get_listing_analytics', { p_listing_id: listing.id }, { accessToken })
    expect(analytics.status).toBe(403)
    expect(analytics.json.code).toBe('42501')
  })

  test('anonymous cannot record views or read analytics RPCs', async () => {
    const { json: publicListings } = await rest('public_listings?select=id&limit=1')
    const listingId = publicListings[0].id

    const record = await rpc('record_listing_view', { p_listing_id: listingId })
    expect(record.status).toBe(401)
    expect(record.json.code).toBe('42501')

    const analytics = await rpc('get_listing_analytics', { p_listing_id: listingId })
    expect(analytics.status).toBe(401)
    expect(analytics.json.code).toBe('42501')

    const myAnalytics = await rpc('get_my_listing_analytics', {})
    expect(myAnalytics.status).toBe(401)
    expect(myAnalytics.json.code).toBe('42501')
  })
})
