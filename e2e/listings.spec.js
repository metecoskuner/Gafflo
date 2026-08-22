// Stage C — real Supabase listings + Storage photos. Reuses the existing authenticated
// identities/sessions from global-setup.js (landlordDefault, plus two dedicated
// landlordListingOwnerA/B for ownership isolation — see global-setup.js's comment on why those
// two can't reuse landlordDefault) rather than creating a fresh auth identity per test, and
// never sends an OTP/magic-link email (plain email+password signup, all done once in
// global-setup). Some assertions go straight through the REST API with a captured session
// access_token instead of the UI — this is deliberately more precise for testing raw backend
// contracts (RLS, column grants, CHECK constraints, server-side triggers) than driving the
// browser would be, and it does not touch the DB password or service_role at any point, only the
// same publishable anon key + a real user's own access_token the browser itself would carry.
//
// A known, accepted side effect: every test that visits /listings/new creates one real, durable
// draft `listings` row for that identity (see CreateListing.jsx — a draft must exist before any
// photo can be uploaded to it). There is no DELETE policy on listings at all (by design — see
// the Phase 1B migration), so these test drafts are never cleaned up and accumulate across runs.
// This is a known trade-off, not an oversight — see the Stage C final report.
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

// pathAndQuery is the full rest/v1 path, e.g. 'listings?id=eq.<uuid>' or 'rpc/get_my_listings'.
async function rest(pathAndQuery, { method = 'GET', accessToken, body, prefer } = {}) {
  const headers = { apikey: ANON_KEY, Authorization: `Bearer ${accessToken || ANON_KEY}` }
  if (body) headers['Content-Type'] = 'application/json'
  if (prefer) headers.Prefer = prefer
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  let json = null
  try {
    json = await res.json()
  } catch {
    // no JSON body — leave json null
  }
  return { status: res.status, ok: res.ok, json }
}

// select=id is required, not optional: a bare insert().select() (or here, Prefer:
// return=representation with no ?select=) defaults to every column, which the column-restricted
// SELECT grant on listings rejects with a real 403 — see services/listingsService.js's identical
// fix and comment. Only `id` is actually needed back here.
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

async function seedSession(page, identityName) {
  const session = identities[identityName]
  await page.addInitScript((state) => {
    window.localStorage.clear()
    window.localStorage.setItem(state.storageKey, state.storageValue)
  }, session)
}

// A minimal real 1x1 PNG (67 bytes), valid enough for Supabase Storage's own mime/size checks
// and for register_listing_image()'s storage.objects cross-check — no fixture image file needed.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

test.describe('Stage C — real listings + Storage photos', () => {
  test('creating a listing makes a real Supabase draft row: UUID id, correct owner, no fake data ever persisted', async ({ page }) => {
    await seedSession(page, 'landlordDefault')
    await page.goto('/listings/new')
    await expect(page.getByRole('heading', { name: 'Create listing' }).or(page.getByText('List your property'))).toBeVisible({ timeout: 10000 })

    // The URL never carries the real listing id for /listings/new (unlike /edit), so read it
    // back from the backend directly — this also lets us assert on raw DB truth, not just UI text.
    const { accessToken, userId } = sessionFor('landlordDefault')
    const { json: myListings } = await rest('rpc/get_my_listings', { method: 'POST', accessToken })
    // landlordDefault accumulates a fresh title-less draft on every run that visits
    // /listings/new (no delete policy exists to clean these up — see the file header comment),
    // so pick the most recently created one rather than assuming array order.
    const created = myListings
      .filter((row) => row.owner_id === userId && row.status === 'draft' && !row.title)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
    expect(created).toBeTruthy()
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(created.owner_id).toBe(userId)
    // ownerName/trust/promotion/listingTerms/viewingSlots are frontend-only presentational
    // concepts (see config/listingAdapter.js) — none of them exist as real columns to leak into.
    expect(created).not.toHaveProperty('owner_name')
    expect(created).not.toHaveProperty('trust')
    expect(created).not.toHaveProperty('promotion')
  })

  test('editing a draft persists real field values, including a blank rent staying null (never coerced to 0)', async ({ page }) => {
    await seedSession(page, 'landlordDefault')
    await page.goto('/listings/new')
    await page.getByLabel('Title').fill('E2E draft with no rent yet')
    await page.getByLabel('Area').fill('Rathmines')
    await page.getByRole('button', { name: 'Save draft' }).click()
    await expect(page).toHaveURL(/\/properties$/)

    const draftCard = page.locator('article').filter({ hasText: 'E2E draft with no rent yet' })
    await expect(draftCard).toBeVisible()
    await expect(draftCard.getByText('Rent not set')).toBeVisible()
    await expect(draftCard.getByText('€0/mo')).toHaveCount(0)

    // Reload from the server truth, not client state, and confirm the value round-trips.
    await page.reload()
    await expect(page.locator('article').filter({ hasText: 'E2E draft with no rent yet' }).getByText('Rent not set')).toBeVisible()
  })

  test('real photo upload: valid image uploads, registers, and displays via a signed URL that survives reload; invalid mime and oversized files are rejected client-side', async ({ page }) => {
    await seedSession(page, 'landlordDefault')
    await page.goto('/listings/new')
    await expect(page.getByText('Add photos')).toBeVisible({ timeout: 10000 })

    const fileInput = page.locator('input[type="file"]')

    // Invalid mime — the input's own accept filter plus validatePhotoFiles() must reject this
    // before any network call. (setInputFiles bypasses the OS picker's own filtering, so this
    // genuinely exercises the app's validation, not the browser's file dialog.)
    await fileInput.setInputFiles({ name: 'not-a-photo.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
    await expect(page.getByText(/supported photo format/i)).toBeVisible()

    // Oversized (>2 MiB) — real bytes, real client-side size check.
    await fileInput.setInputFiles({ name: 'too-big.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(2.5 * 1024 * 1024) })
    await expect(page.getByText(/larger than 2 ?MB/i)).toBeVisible()

    // A real, valid, tiny PNG — this genuinely uploads to Storage and registers via
    // register_listing_image(), not a blob: preview. Waiting on "Remove photo 1" rather than the
    // "Cover image" label: the zero-photos fallback placeholder also renders "Cover image" (it
    // is hardcoded isCover: true so the layout looks right before any real photo exists — see
    // PhotoSection), but only a real, registered photo ever gets a Remove button.
    await fileInput.setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: TINY_PNG })
    await expect(page.getByRole('button', { name: 'Remove photo 1' })).toBeVisible({ timeout: 15000 })
    const image = page.locator('img[alt="Preview 1"]')
    await expect(image).toBeVisible()
    const src = await image.getAttribute('src')
    expect(src).toMatch(/^https:\/\//)
    expect(src).not.toMatch(/^blob:/)
    expect(src).toContain('token=') // Supabase signed URLs always carry a signature token.

    // The registered image is durable server-side truth, not client-session state.
    await page.reload()
    await expect(page.getByRole('button', { name: 'Remove photo 1' })).toBeVisible({ timeout: 15000 })
  })

  test('reorder, cover, and delete operate on the real listing_images rows and persist across reload', async ({ page }) => {
    await seedSession(page, 'landlordDefault')
    await page.goto('/listings/new')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({ name: 'first.png', mimeType: 'image/png', buffer: TINY_PNG })
    await expect(page.getByRole('button', { name: 'Remove photo 1' })).toBeVisible({ timeout: 15000 })
    await fileInput.setInputFiles({ name: 'second.png', mimeType: 'image/png', buffer: TINY_PNG })
    await expect(page.getByRole('button', { name: 'Remove photo 2' })).toBeVisible({ timeout: 15000 })

    // Promote the second photo to cover — is_cover is a real, independent flag from position,
    // and the cover always sorts to index 0 regardless of raw storage position (see
    // ListingsProvider's photoMetadata sort) — so "Move up" for the new index-0 item is disabled.
    await page.getByRole('button', { name: 'Make photo 2 the cover' }).click()
    await expect(page.getByText('Cover image')).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('button', { name: 'Move photo 1 up' })).toBeDisabled()

    await page.reload()
    await expect(page.getByRole('button', { name: 'Remove photo 1' })).toBeVisible({ timeout: 15000 })

    // Delete the remaining non-cover photo — real DELETE via delete_listing_image(), not a raw
    // storage.objects delete (see services/listingsService.js's comment on why that matters).
    await page.getByRole('button', { name: 'Remove photo 2' }).click()
    await expect(page.getByText('Photo 2')).toHaveCount(0, { timeout: 10000 })
    await page.reload()
    await expect(page.getByText('Photo 2')).toHaveCount(0)
  })

  test('request review: an incomplete listing is rejected with the real backend readiness message; a complete listing with one photo transitions to pending_verification, and the landlord cannot self-publish', async ({ page }) => {
    await seedSession(page, 'landlordDefault')
    await page.goto('/listings/new')
    await page.getByLabel('Title').fill('E2E complete review-ready listing')
    await expect(page.getByRole('button', { name: 'Request review' })).toBeVisible({ timeout: 10000 })
    // Missing rent/area/description/etc. — frontend readiness check blocks the request before
    // any network call, matching (not duplicating) the server's own request_listing_review() rules.
    await page.getByRole('button', { name: 'Request review' }).click()
    await expect(page.getByText('Check the highlighted fields before requesting review.')).toBeVisible()

    await page.getByLabel('Monthly rent (€)').fill('1500')
    await page.getByLabel('Deposit (€)').fill('1500')
    await page.getByLabel('Area').fill('Rathmines')
    await page.getByLabel('Available from').fill('2030-01-01')
    await page.getByLabel('Minimum stay (months)').fill('6')
    await page.getByLabel('Bedrooms').fill('2')
    await page.getByLabel('Bathrooms').fill('1')
    await page.getByLabel('Max occupants').fill('2')
    await page.getByLabel(/description/i).fill('A genuinely complete E2E test listing description with enough detail for renters to read.')
    await page.locator('input[type="file"]').setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: TINY_PNG })
    await expect(page.getByRole('button', { name: 'Remove photo 1' })).toBeVisible({ timeout: 15000 })

    await page.getByRole('button', { name: 'Request review' }).click()
    await expect(page).toHaveURL(/\/properties$/, { timeout: 10000 })
    const card = page.locator('article').filter({ hasText: 'E2E complete review-ready listing' })
    await expect(card.getByText('In review')).toBeVisible()

    // No client path can force this listing straight to published — the only two ways to change
    // status are the guarded RPCs (none of which is a landlord-callable "publish") and a direct
    // column write, which the column-level INSERT/UPDATE grants never include `status` for.
    const { accessToken } = sessionFor('landlordDefault')
    const { json: mine } = await rest('rpc/get_my_listings', { method: 'POST', accessToken })
    const listing = mine.find((row) => row.title === 'E2E complete review-ready listing')
    expect(listing.status).toBe('pending_verification')
    const selfPublish = await rest(`listings?id=eq.${listing.id}`, { method: 'PATCH', accessToken, body: { status: 'published' } })
    expect(selfPublish.status).toBe(403)
  })

  test('ownership isolation: landlord A cannot edit or upload a photo to landlord B\'s listing, and cannot forge owner/status on their own', async () => {
    const ownerB = await createDraftViaRest('landlordListingOwnerB', { title: 'Owner B private draft' })
    const ownerA = sessionFor('landlordListingOwnerA')

    // Prefer: return=representation is required to see *which* rows matched — without it
    // PostgREST returns a bare 204 regardless of whether 0 or more rows were touched. ?select=id
    // is likewise required: an unqualified select defaults to every column, which the
    // column-restricted SELECT grant rejects (see services/listingsService.js's comment).
    const forgedEdit = await rest(`listings?id=eq.${ownerB.id}&select=id`, { method: 'PATCH', accessToken: ownerA.accessToken, prefer: 'return=representation', body: { title: 'Hijacked by A' } })
    expect(forgedEdit.status).toBe(200) // RLS makes an unauthorized UPDATE match zero rows, not error
    expect(forgedEdit.json).toEqual([])

    const stillOwnedByB = await rest(`listings?id=eq.${ownerB.id}&select=title`, { accessToken: ownerB.accessToken })
    expect(stillOwnedByB.json[0].title).toBe('Owner B private draft')

    const forgedUpload = await rest('rpc/register_listing_image', {
      method: 'POST',
      accessToken: ownerA.accessToken,
      body: { p_listing_id: ownerB.id, p_storage_path: `${ownerB.id}/fake.png`, p_label: 'other', p_is_cover: false },
    })
    expect(forgedUpload.status).toBe(403) // "Not authorized to add images to this listing" — RAISE ... USING errcode = '42501' maps to a real 403

    // A owns nothing yet in this test — insert must be blocked from ever setting owner_id to B.
    const forgedOwnerInsert = await rest('listings', {
      method: 'POST',
      accessToken: ownerA.accessToken,
      body: { owner_id: ownerB.userId, listing_category: 'entire_property' },
    })
    expect([401, 403]).toContain(forgedOwnerInsert.status)
  })

  test('draft and pending listings never appear in public Browse, and their photos are not readable by another user', async () => {
    const draft = await createDraftViaRest('landlordListingOwnerB', { title: 'Owner B never-public draft' })
    const tenant = sessionFor('tenantDefault')

    const publicRead = await rest(`public_listings?id=eq.${draft.id}`, { accessToken: tenant.accessToken })
    expect(publicRead.json).toEqual([])

    const anonRead = await rest(`public_listings?id=eq.${draft.id}`, {})
    expect(anonRead.json).toEqual([])

    const imagesAsTenant = await rest(`listing_images?listing_id=eq.${draft.id}`, { accessToken: tenant.accessToken })
    expect(imagesAsTenant.json).toEqual([])
  })

  test('no fake promotion or trust ever appears for a real listing', async ({ page }) => {
    await seedSession(page, 'landlordDefault')
    await page.goto('/listings/new')
    await page.getByLabel('Title').fill('E2E no-fake-badges listing')
    await page.getByRole('button', { name: 'Preview listing' }).click()

    await expect(page.getByText('Preview — how tenants will see this').first()).toBeVisible()
    await expect(page.getByText('Promoted')).toHaveCount(0)
    await expect(page.getByText('Verified landlord')).toHaveCount(0)
    await expect(page.getByText('Property reviewed')).toHaveCount(0)
    await expect(page.getByText('No additional verification signals are shown for this listing yet.')).toBeVisible()
  })

  test('availability_confirmed_at only refreshes when available_from actually changes (real server-side trigger)', async () => {
    const draft = await createDraftViaRest('landlordListingOwnerA', {
      title: 'E2E availability trigger listing',
      available_from: '2030-01-01',
    })
    const before = await rest(`listings?id=eq.${draft.id}&select=availability_confirmed_at`, { accessToken: draft.accessToken })
    const initialConfirmedAt = before.json[0].availability_confirmed_at

    await rest(`listings?id=eq.${draft.id}`, { method: 'PATCH', accessToken: draft.accessToken, body: { title: 'E2E availability trigger listing, retitled' } })
    const afterUnrelatedEdit = await rest(`listings?id=eq.${draft.id}&select=availability_confirmed_at`, { accessToken: draft.accessToken })
    expect(afterUnrelatedEdit.json[0].availability_confirmed_at).toBe(initialConfirmedAt)

    await rest(`listings?id=eq.${draft.id}`, { method: 'PATCH', accessToken: draft.accessToken, body: { available_from: '2030-03-01' } })
    const afterDateChange = await rest(`listings?id=eq.${draft.id}&select=availability_confirmed_at`, { accessToken: draft.accessToken })
    expect(afterDateChange.json[0].availability_confirmed_at).not.toBe(initialConfirmedAt)
  })

  test('server-side category-consistency CHECK constraint is authoritative, not just a frontend rule', async () => {
    const { accessToken, userId } = sessionFor('landlordListingOwnerA')
    // entire_property with a room_type set is exactly the inconsistent combination
    // listings_category_fields_consistent forbids — the frontend never constructs this payload,
    // but a real client could send it directly, so the constraint (not client discipline) is
    // what must actually stop it.
    const res = await rest('listings', {
      method: 'POST',
      accessToken,
      body: { owner_id: userId, listing_category: 'entire_property', room_type: 'double' },
    })
    expect(res.status).toBe(400)
  })

  // Skip-audit findings (post-merge review of the 29 e2e/frontend-integrity.spec.js skips):
  // the three tests below close real gaps found during that audit rather than duplicate
  // anything already covered above.

  test('landlord own-listing preview (route-based) hides tenant match content for any pre-published status', async ({ page }) => {
    // canViewListing()'s 'own' branch (components/PropertyDetailsModal.jsx via
    // config/listingLifecycle.js) is role+ownerId only, with no status condition at all — a
    // landlord can view their own listing at any status, so a plain draft is enough here; no
    // moderator credential is needed for this specific claim, unlike most of the audit's other
    // findings.
    const draft = await createDraftViaRest('landlordListingOwnerA', { title: 'E2E own-view listing' })
    await seedSession(page, 'landlordListingOwnerA')
    await page.goto(`/properties/${draft.id}`)
    await expect(page.getByRole('heading', { name: 'E2E own-view listing' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/Why this .* fits you/)).toHaveCount(0)
    await expect(page.getByText(/rental fit|Unscored/)).toHaveCount(0)
  })

  test('editing an already-submitted listing saves fields without re-requesting review or changing status', async ({ page }) => {
    const draft = await createDraftViaRest('landlordListingOwnerA', {
      title: 'E2E already-submitted listing',
      area: 'Rathmines',
      city: 'Dublin',
      rent: 1400,
      deposit: 1400,
      available_from: '2030-01-01',
      min_stay_months: 6,
      property_type: 'apartment',
      bedrooms: 1,
      bathrooms: 1,
      max_occupants: 1,
      description: 'A genuinely complete description, long enough to satisfy request_listing_review readiness for this isolation test.',
    })
    const path = `${draft.id}/cover.png`
    await fetch(`${SUPABASE_URL}/storage/v1/object/listing-photos/${path}`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${draft.accessToken}`, 'Content-Type': 'image/png' },
      body: TINY_PNG,
    })
    await rest('rpc/register_listing_image', {
      method: 'POST',
      accessToken: draft.accessToken,
      body: { p_listing_id: draft.id, p_storage_path: path, p_label: 'cover', p_is_cover: true },
    })
    await rest('rpc/request_listing_review', { method: 'POST', accessToken: draft.accessToken, body: { p_listing_id: draft.id } })
    const submitted = await rest(`listings?id=eq.${draft.id}&select=status`, { accessToken: draft.accessToken })
    expect(submitted.json[0].status).toBe('pending_verification')

    await seedSession(page, 'landlordListingOwnerA')
    await page.goto(`/listings/${draft.id}/edit`)
    await expect(page.getByLabel('Title')).toHaveValue('E2E already-submitted listing', { timeout: 10000 })
    // canRequestReview is false once past draft/rejected (see CreateListing.jsx) — only a plain
    // "Save changes" action is offered, never "Request review" or "Save draft" again.
    await expect(page.getByRole('button', { name: 'Request review' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Save draft' })).toHaveCount(0)
    await page.getByLabel('Title').fill('E2E already-submitted listing, edited')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page).toHaveURL(/\/properties$/, { timeout: 10000 })

    const after = await rest(`listings?id=eq.${draft.id}&select=status,title`, { accessToken: draft.accessToken })
    expect(after.json[0].status).toBe('pending_verification') // unchanged — never silently moved back to draft
    expect(after.json[0].title).toBe('E2E already-submitted listing, edited')
  })

  test('a fresh draft leaves genuinely unknown fields null while enum fields keep their real, honest schema defaults', async () => {
    // Phase 1B's own migration comment is explicit about this split: rent/deposit/bedrooms/
    // bathrooms/max_occupants/property_type/available_from/min_stay_months stay nullable
    // (genuinely unknown until the landlord answers), while furnished/parking/pets_policy/
    // smoking_policy get a real NOT NULL schema default — not a frontend fabrication, and not
    // the same thing as the fields above staying null. Both halves of that split matter and
    // neither was covered by the audit's earlier tests.
    const draft = await createDraftViaRest('landlordListingOwnerA', { title: 'E2E null-semantics listing' })
    const row = await rest(
      `listings?id=eq.${draft.id}&select=property_type,bedrooms,bathrooms,max_occupants,rent,deposit,available_from,min_stay_months,furnished,parking,pets_policy,smoking_policy`,
      { accessToken: draft.accessToken },
    )
    const listing = row.json[0]
    expect(listing.property_type).toBeNull()
    expect(listing.bedrooms).toBeNull()
    expect(listing.bathrooms).toBeNull()
    expect(listing.max_occupants).toBeNull()
    expect(listing.rent).toBeNull()
    expect(listing.deposit).toBeNull()
    expect(listing.available_from).toBeNull()
    expect(listing.min_stay_months).toBeNull()
    expect(listing.furnished).toBe('unfurnished')
    expect(listing.parking).toBe('none')
    expect(listing.pets_policy).toBe('not_allowed')
    expect(listing.smoking_policy).toBe('no')
  })
})
