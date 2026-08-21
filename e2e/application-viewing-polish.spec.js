// Stage M — the tenant "My Applications" page and the landlord Applicants "Applied" date, both
// new/changed this stage. e2e/applications.spec.js's own header comment documents why the
// existing shared published listings can't be used for a real landlord-owned UI flow: no
// frontend-controlled identity owns any of them. This file closes that gap using the same fresh-
// listing-to-published pipeline Stage K's own moderator-workspace.spec.js already proved works —
// a real landlord identity creates a real listing, a real moderator approves it, so the resulting
// listing is genuinely owned by an identity this suite controls end to end.
//
// Needs GAFFLO_E2E_MODERATOR_PASSWORD set (see e2e/global-setup.js) for the same reason
// moderator-workspace.spec.js does — approving the fixture listing requires the real moderator
// identity. Skips itself cleanly if that identity was not built this run, rather than failing
// unrelated CI/local runs that don't supply it.
import { Buffer } from 'node:buffer'
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

async function createPublishedListingViaRest(identityName, moderatorAccessToken) {
  const title = `E2E application polish listing ${Date.now()}`
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
  const approve = await rpc('moderator_approve_listing', { p_listing_id: draft.id }, { accessToken: moderatorAccessToken })
  if (approve.status !== 204) throw new Error(`moderator_approve_listing failed: HTTP ${approve.status} ${JSON.stringify(approve.json)}`)
  return { ...draft, title }
}

test.describe('Stage M — application flow polish', () => {
  test.skip(!identities.moderatorStable, 'GAFFLO_E2E_MODERATOR_PASSWORD not set — see global-setup.js')

  test('a tenant sees a real submitted application on the new My Applications page, and a landlord sees the same real applicant with its applied date', async ({ page }) => {
    const { accessToken: modToken } = sessionFor('moderatorStable')
    const listing = await createPublishedListingViaRest('landlordListingOwnerA', modToken)

    const { accessToken: tenantToken } = sessionFor('tenantWaterford')
    const applyResult = await rpc('create_application', { p_listing_id: listing.id }, { accessToken: tenantToken })
    expect(applyResult.status).toBe(200)

    await seedSession(page, 'tenantWaterford')
    await page.goto('/applications')
    await expect(page.getByRole('heading', { name: 'Your applications' })).toBeVisible({ timeout: 10000 })
    // The status pill legitimately renders twice per card (the card-header overlay pill, plus
    // ApplicationStatus's own built-in pill) — scope to this one application's card rather than
    // asserting an unscoped, ambiguous "Sent" match.
    const applicationCard = page.locator('article', { hasText: listing.title })
    await expect(applicationCard).toBeVisible({ timeout: 10000 })
    await expect(applicationCard.getByText('Sent', { exact: true }).first()).toBeVisible()

    await seedSession(page, 'landlordListingOwnerA')
    await page.goto(`/applicants?property=${listing.id}`)
    await expect(page.getByText(`Showing applicants for ${listing.title}.`)).toBeVisible({ timeout: 10000 })
    const applicantCard = page.locator('article', { hasText: 'Tenant applicant' })
    await expect(applicantCard).toBeVisible({ timeout: 10000 })
    await expect(applicantCard.getByText('Applied')).toBeVisible()
  })

  test('an empty My Applications page shows a real, honest empty state', async ({ page }) => {
    await seedSession(page, 'tenantNoFacts')
    await page.goto('/applications')
    // tenantNoFacts is a fresh identity every run with no applications yet — the honest empty
    // state must render, never a blank screen or a stale/fake entry.
    await expect(page.getByText('No applications yet')).toBeVisible({ timeout: 10000 })
  })
})
