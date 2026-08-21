// Stage K — the moderator review workspace. Reuses the same authenticated identities from
// global-setup.js as every prior stage's own suite, plus one new fixed identity: moderatorStable
// (see global-setup.js's own comment) — a real, permanent, pre-promoted moderator account, since
// platform_role has no client write grant and no throwaway per-run identity could ever become a
// moderator through the normal signup path.
import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const identities = JSON.parse(readFileSync(path.join(__dirname, '.auth', 'identities.json'), 'utf8'))

if (!identities.moderatorStable) {
  throw new Error(
    'moderatorStable identity is missing from e2e/.auth/identities.json — global-setup.js skips ' +
      'building it when GAFFLO_E2E_MODERATOR_PASSWORD is not set. Run with ' +
      'GAFFLO_E2E_MODERATOR_PASSWORD=... npx playwright test e2e/moderator-workspace.spec.js',
  )
}

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

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

async function createDraftViaRest(identityName, fields = {}) {
  const { accessToken, userId } = sessionFor(identityName)
  const { status, json } = await rest('listings?select=id', {
    method: 'POST',
    accessToken,
    prefer: 'return=representation',
    body: { owner_id: userId, listing_category: 'entire_property', ...fields },
  })
  if (status !== 201 || !json?.[0]?.id) throw new Error(`createDraftViaRest(${identityName}) failed: HTTP ${status} ${JSON.stringify(json)}`)
  return { id: json[0].id, accessToken, userId }
}

// Builds one real, genuinely pending_verification listing end to end: draft -> real Storage
// photo -> Fair Housing acknowledgement (Stage J1's own server gate on request_listing_review())
// -> request review. Mirrors e2e/listings.spec.js's own proven fixture sequence.
async function createPendingListingViaRest(identityName) {
  const title = `E2E moderator queue listing ${Date.now()}`
  const draft = await createDraftViaRest(identityName, {
    title,
    area: 'Rathmines',
    city: 'Dublin',
    rent: 1500,
    deposit: 1500,
    available_from: '2030-01-01',
    min_stay_months: 6,
    property_type: 'apartment',
    bedrooms: 1,
    bathrooms: 1,
    max_occupants: 1,
    description: 'A genuinely complete description, long enough to satisfy request_listing_review readiness for this e2e fixture.',
  })
  const photoPath = `${draft.id}/cover.png`
  await fetch(`${SUPABASE_URL}/storage/v1/object/listing-photos/${photoPath}`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${draft.accessToken}`, 'Content-Type': 'image/png' },
    body: TINY_PNG,
  })
  await rpc('register_listing_image', { p_listing_id: draft.id, p_storage_path: photoPath, p_label: 'cover', p_is_cover: true }, { accessToken: draft.accessToken })
  await rpc('acknowledge_fair_housing_policy', {}, { accessToken: draft.accessToken })
  const review = await rpc('request_listing_review', { p_listing_id: draft.id }, { accessToken: draft.accessToken })
  if (review.status !== 204) throw new Error(`request_listing_review failed: HTTP ${review.status} ${JSON.stringify(review.json)}`)
  return { ...draft, title }
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

test.describe('Stage K — signed out and non-moderator access', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('a genuinely signed-out visitor cannot open /moderator', async ({ page }) => {
    await page.goto('/moderator')
    await expect(page.getByRole('heading', { name: /welcome to gafflo/i })).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('heading', { name: 'Review workspace' })).toHaveCount(0)
  })
})

test.describe('Stage K — moderator workspace', () => {
  test('a non-moderator authenticated account cannot open /moderator', async ({ page }) => {
    await seedSession(page, 'tenantWaterford')
    await page.goto('/moderator')
    await expect(page.getByRole('heading', { name: 'Review workspace' })).toHaveCount(0)
    // Redirected to their real home route, not left on a blocked/blank /moderator screen.
    await expect(page).not.toHaveURL(/\/moderator$/, { timeout: 10000 })
  })

  test('a real moderator can open /moderator and see the real workspace', async ({ page }) => {
    await seedSession(page, 'moderatorStable')
    await page.goto('/moderator')
    await expect(page.getByRole('heading', { name: 'Review workspace' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('button', { name: 'Reports' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Pending listings' })).toBeVisible()
  })

  test('a moderator sees and resolves a real open report, never seeing reporter identity', async ({ page }) => {
    const { accessToken: reporterToken, userId: reporterId } = sessionFor('tenantCompleteFacts')
    const listing = await pickListing(reporterId, reporterToken)
    const uniqueDescription = `E2E moderator report ${Date.now()}`
    const submitted = await rpc('report_listing', { p_listing_id: listing.id, p_reason: 'other', p_description: uniqueDescription }, { accessToken: reporterToken })
    expect(submitted.status).toBe(200)

    await seedSession(page, 'moderatorStable')
    await page.goto('/moderator')
    await expect(page.getByText(uniqueDescription)).toBeVisible({ timeout: 10000 })
    // The reporter's real email/id is never rendered anywhere on this page.
    await expect(page.getByText(reporterId)).toHaveCount(0)

    const reportCard = page.locator('article', { hasText: uniqueDescription })
    await reportCard.getByRole('button', { name: 'Dismiss' }).click()
    await expect(page.getByText(uniqueDescription)).toHaveCount(0, { timeout: 10000 })

    const { accessToken: modToken } = sessionFor('moderatorStable')
    const stillOpen = await rpc('list_listing_reports', { p_status: 'open' }, { accessToken: modToken })
    expect((stillOpen.json || []).some((row) => row.description === uniqueDescription)).toBe(false)
  })

  test('a moderator approves a real pending listing end to end', async ({ page }) => {
    const pending = await createPendingListingViaRest('landlordListingOwnerB')

    const { accessToken: modToken } = sessionFor('moderatorStable')
    const beforeStatus = await rest(`listings?id=eq.${pending.id}&select=status`, { accessToken: pending.accessToken })
    expect(beforeStatus.json[0].status).toBe('pending_verification')

    await seedSession(page, 'moderatorStable')
    await page.goto('/moderator')
    await page.getByRole('button', { name: 'Pending listings' }).click()

    const card = page.locator('article', { hasText: pending.title })
    await expect(card).toBeVisible({ timeout: 10000 })
    await card.getByRole('button', { name: 'Approve' }).click()
    await expect(page.getByText(pending.title)).toHaveCount(0, { timeout: 10000 })

    const afterStatus = await rest(`listings?id=eq.${pending.id}&select=status`, { accessToken: modToken })
    expect(afterStatus.json[0].status).toBe('published')
  })
})
