import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Written by e2e/global-setup.js: a small fixed set of real, pre-configured Supabase identities
// (real profiles/tenant_profiles/landlord_profiles rows, real last_active_role) — one per
// distinct tenant/landlord shape this suite's fixtures need. Stage B retired
// gafflo.account/gafflo.tenant-profile/gafflo.landlord-profile as authoritative for
// authenticated users, so "which account" is now selected by injecting the right real session,
// not by writing fake role/profile objects into localStorage.
const identities = JSON.parse(readFileSync(path.join(__dirname, '.auth', 'identities.json'), 'utf8'))

const viewport390 = { width: 390, height: 844 }

async function seedState(page, { identity = 'tenantDefault', properties, enquiries, conversations, saved, dismissed, tenantPlan, landlordPlan, smartMatchActivity, launchOverride } = {}) {
  const session = identities[identity]
  if (!session) throw new Error(`Unknown e2e identity "${identity}" — check e2e/global-setup.js's IDENTITIES map.`)
  await page.addInitScript((state) => {
    window.localStorage.clear()
    // Real auth + profile boundary (Stage A/B): this suite exercises the mock marketplace
    // behind the auth/profile gates, not those flows themselves (see e2e/auth.spec.js and
    // e2e/profiles.spec.js for that) — the clear() above would otherwise wipe the real Supabase
    // session global-setup seeded for this identity, booting every test back to the sign-in
    // screen (or the wrong role/onboarding step) before it ever reaches the marketplace.
    window.localStorage.setItem(state.session.storageKey, state.session.storageValue)
    if (state.properties) window.localStorage.setItem('gafflo.properties', JSON.stringify(state.properties))
    if (state.enquiries) window.localStorage.setItem('gafflo.enquiries', JSON.stringify(state.enquiries))
    if (state.conversations) window.localStorage.setItem('gafflo.conversations', JSON.stringify(state.conversations))
    if (state.saved) window.localStorage.setItem('gafflo.saved-properties', JSON.stringify(state.saved))
    if (state.dismissed) window.localStorage.setItem('gafflo.dismissed-properties', JSON.stringify(state.dismissed))
    if (state.tenantPlan) window.localStorage.setItem('gafflo.tenant-plan', JSON.stringify(state.tenantPlan))
    if (state.landlordPlan) window.localStorage.setItem('gafflo.landlord-plan', JSON.stringify(state.landlordPlan))
    if (state.smartMatchActivity) window.localStorage.setItem('gafflo.smart-match-activity', JSON.stringify(state.smartMatchActivity))
    // Test-only escape hatch: nothing in the shipped app ever writes this key. It lets E2E
    // deterministically exercise the post-launch (non-launch) limit UX without touching the
    // committed smartMatchAccess.launchAccessEnabled=true value real users get.
    if (state.launchOverride !== undefined) window.localStorage.setItem('gafflo.test-launch-access-override', String(state.launchOverride))
  }, { session, properties, enquiries, conversations, saved, dismissed, tenantPlan, landlordPlan, smartMatchActivity, launchOverride })
}

function todayDateKey() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

async function visibleSmartCardLabel(page) {
  return page.getByRole('button', { name: /^Open (?!filters)/ }).first().getAttribute('aria-label')
}

async function expectNoHorizontalOverflow(page) {
  const metrics = await page.evaluate(() => {
    const rootRect = document.querySelector('#root').getBoundingClientRect()
    return {
      htmlScrollWidth: document.documentElement.scrollWidth,
      htmlClientWidth: document.documentElement.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      bodyClientWidth: document.body.clientWidth,
      rootLeft: rootRect.left,
      rootRight: rootRect.right,
      innerWidth: window.innerWidth,
      htmlScrollLeft: document.documentElement.scrollLeft,
      bodyScrollLeft: document.body.scrollLeft,
    }
  })
  expect(metrics.htmlScrollWidth).toBeLessThanOrEqual(metrics.htmlClientWidth + 1)
  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.bodyClientWidth + 1)
  expect(metrics.rootLeft).toBeGreaterThanOrEqual(-1)
  expect(metrics.rootRight).toBeLessThanOrEqual(metrics.innerWidth + 1)
  expect(metrics.htmlScrollLeft).toBe(0)
  expect(metrics.bodyScrollLeft).toBe(0)
}

// Drives the custom Gafflo listbox (GaffloSelect) the way a real user would: open the trigger,
// click the option by its visible label. Replaces native-<select> .selectOption() calls now that
// every select in the app renders through the shared component instead of a real <select>.
async function selectGafflo(page, label, optionText) {
  await page.getByLabel(label).click()
  await page.getByRole('option', { name: optionText, exact: true }).click()
}

test('fresh tenant onboarding asks only city and looking-for, then routes to discover leaving the rest unknown', async ({ page }) => {
  await seedState(page, { identity: 'freshForTenantOnboarding' })
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue as tenant' }).click()
  await expect(page.getByRole('heading', { name: 'Let’s find your matches' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Smart Match' })).toHaveCount(0)

  // Only two questions on this screen — budget, move-in date and household size are gone.
  await expect(page.getByLabel('Min')).toHaveCount(0)
  await expect(page.getByLabel('Move-in date')).toHaveCount(0)
  await expect(page.getByLabel(/household size|room applicants/i)).toHaveCount(0)

  await selectGafflo(page, 'Target city', 'Dublin')
  await page.getByRole('button', { name: 'A room' }).click()
  await page.getByRole('button', { name: 'See my matches' }).click()

  await expect(page).toHaveURL(/\/discover$/)
  await expect(page.getByRole('heading', { name: 'Smart Match' })).toBeVisible()

  // Real round trip: reload into /profile and read the actual persisted Supabase values back
  // out of the rendered form, rather than a localStorage key the app no longer treats as
  // authoritative.
  await page.goto('/profile')
  await expect(page.getByLabel('Target city')).toHaveText('Dublin')
  await expect(page.getByRole('button', { name: 'A room', exact: true })).toHaveAttribute('aria-pressed', 'true')
  // Never fabricated — these stay unknown until the tenant explicitly provides them.
  await expect(page.getByLabel('Budget min (€)')).toHaveValue('')
  await expect(page.getByLabel('Budget max (€)')).toHaveValue('')
  await expect(page.getByLabel('Move-in date')).toHaveValue('')
  await expect(page.getByLabel('Room applicants')).toHaveValue('')
})

test('onboarding never shows validation errors before a submit attempt, and only blocks on the two required answers', async ({ page }) => {
  await seedState(page, { identity: 'freshForOnboardingValidation' })
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue as tenant' }).click()

  // A fresh screen must never open already showing red error states.
  await expect(page.getByText('Choose a target city.')).toHaveCount(0)
  await expect(page.getByText('Choose what you are looking for.')).toHaveCount(0)

  await page.getByRole('button', { name: 'See my matches' }).click()
  await expect(page.getByText('Choose a target city.')).toBeVisible()
  await expect(page.getByText('Choose what you are looking for.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Let’s find your matches' })).toBeVisible()
})

test('onboarding fits within 320-430px viewports without needing to scroll', async ({ page }) => {
  await seedState(page, { identity: 'freshForOnboardingViewport' })
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue as tenant' }).click()
  await expect(page.getByRole('heading', { name: 'Let’s find your matches' })).toBeVisible()

  // Choosing tenant persists real last_active_role — a second visit lands straight back on
  // onboarding (tenant_profiles still doesn't exist yet), so only the first iteration needs to
  // click through RoleSelection; the rest just re-check the same real in-progress state at
  // other sizes. Paired with each width's typical device height (iPhone SE, 8, 12, 14 Pro Max).
  for (const { width, height } of [{ width: 320, height: 568 }, { width: 375, height: 667 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    await page.setViewportSize({ width, height })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Let’s find your matches' })).toBeVisible()
    const overflowsViewport = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight)
    expect(overflowsViewport, `onboarding should not need to scroll at ${width}x${height}`).toBe(false)
  }
})

test('returning tenant with a saved profile is never sent through onboarding', async ({ page }) => {
  await seedState(page)
  await page.goto('/discover')
  await expect(page.getByRole('heading', { name: 'Smart Match' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Let’s find your matches' })).toHaveCount(0)
})

test('a tenant who skipped budget in onboarding still sees ranked matches, never a false hard stop', async ({ page }) => {
  test.skip(true, "Stage C: blocked — needs a moderator-approved published/paused/rented real listing. This environment has no moderator test credential (by design: the listings.status column grant excludes authenticated entirely, and moderator_* RPCs require platform_role='moderator', which no test identity has or can self-assign). See the Stage C final report.")
  await seedState(page, { identity: 'tenantNoFacts' })
  await page.goto('/discover')
  await expect(page.getByRole('heading', { name: 'Smart Match' })).toBeVisible()
  const card = page.getByRole('button', { name: /^Open (?!filters)/ }).first()
  await expect(card).toBeVisible()

  const scoreText = await card.getByText(/% rental fit/).innerText()
  const score = Number(scoreText.replace(/[^0-9]/g, ''))
  // A hard-stop score is capped at 58. A real score here proves the missing budget was left
  // unknown and unscored, not silently treated as a €0 maximum that would crash every match.
  expect(score).toBeGreaterThan(58)

  await card.click()
  await expect(page.getByText('Budget is not set yet, so rent fit is not scored.')).toBeVisible()
})

test('saving the profile without touching budget or household size does not fabricate values', async ({ page }) => {
  await seedState(page, { identity: 'tenantNoFacts' })
  await page.goto('/profile')
  await page.getByLabel('Name').fill('Sam Rivera')
  await page.getByRole('button', { name: 'Save tenant profile' }).click()
  await expect(page).toHaveURL(/\/discover$/)

  // Real round trip: reload straight into /profile and read the actual persisted Supabase
  // values back out of the rendered form, rather than a localStorage key the app no longer
  // treats as authoritative.
  await page.goto('/profile')
  await expect(page.getByLabel('Name')).toHaveValue('Sam Rivera')
  await expect(page.getByLabel('Budget min (€)')).toHaveValue('')
  await expect(page.getByLabel('Budget max (€)')).toHaveValue('')
  await expect(page.getByLabel('Household size')).toHaveValue('')
})

test('tenant dashboard nudges to complete the profile only when core match facts are missing', async ({ page }) => {
  await seedState(page, { identity: 'tenantNoFacts' })
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'Make your matches more accurate' })).toBeVisible()

  await seedState(page, { identity: 'tenantCompleteFacts' })
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'Make your matches more accurate' })).toHaveCount(0)
})

test('routes fresh landlord role selection through the required display-name step, then to dashboard', async ({ page }) => {
  await seedState(page, { identity: 'freshForLandlordOnboarding' })
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue as landlord' }).click()
  // landlord_profiles.display_name is a real, required (NOT NULL) column with no truthful
  // default — a genuinely fresh landlord must supply it before reaching the dashboard, unlike
  // the old mock flow which had no such backend constraint to satisfy.
  await expect(page.getByRole('heading', { name: 'What should tenants see as your name?' })).toBeVisible()
  await page.getByLabel('Display name').fill('Fresh Landlord Onboarding Co')
  await page.getByRole('button', { name: 'Continue to dashboard' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { name: 'Your properties at a glance.' })).toBeVisible()
})

test('smart match pass updates the visible deck at mobile width', async ({ page }) => {
  await page.setViewportSize(viewport390)
  await seedState(page)
  await page.goto('/discover')
  await expect(page.getByRole('heading', { name: 'Smart Match' })).toBeVisible()

  const firstCard = await visibleSmartCardLabel(page)
  await page.getByRole('button', { name: 'Pass' }).click()
  await expect.poll(() => visibleSmartCardLabel(page)).not.toBe(firstCard)
  await expect(page.getByRole('button', { name: 'Pass' })).toBeEnabled()
  await expect(page.getByRole('button', { name: /Interested|Limit reached/ })).toBeVisible()
})

// Stage D: "Interested" now submits a real create_application() row (see the Stage D report's
// CTA audit) rather than writing a mock gafflo.enquiries entry — so this asserts the real,
// durable result through the UI itself (switching to Browse and checking the same listing now
// shows a real application status pill) instead of inspecting localStorage for a key the app no
// longer writes to on this path.
test('smart match interested submits a real application and keeps controls usable at mobile width', async ({ page }) => {
  await page.setViewportSize(viewport390)
  await seedState(page, { dismissed: [] })
  await page.goto('/discover')

  const firstCard = await visibleSmartCardLabel(page)
  const firstCardTitle = firstCard.replace('Open ', '')
  await page.getByRole('button', { name: 'Interested' }).click()
  await expect.poll(() => visibleSmartCardLabel(page)).not.toBe(firstCard)
  await expect(page.getByRole('button', { name: 'Pass' })).toBeEnabled()

  await page.getByRole('button', { name: 'Browse' }).click()
  const appliedCard = page.locator('article', { hasText: firstCardTitle }).first()
  await expect(appliedCard.getByText(/Application status:/)).toBeVisible()
})

test('save and saved page stay consistent through remove', async ({ page }) => {
  await page.setViewportSize(viewport390)
  await seedState(page, { saved: [] })
  await page.goto('/discover')

  const firstCard = await visibleSmartCardLabel(page)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible()
  await page.getByRole('link', { name: /Saved/ }).click()

  await expect(page.getByRole('heading', { name: 'Your shortlist' })).toBeVisible()
  await expect(page.locator('article').first()).toContainText(firstCard.replace('Open ', ''))
  await expect(page.getByText('Saved').first()).toBeVisible()
  await page.getByRole('button', { name: 'Remove' }).first().click()
  await expect(page.getByRole('heading', { name: 'Build your shortlist' })).toBeVisible()
})

test('filter drawer closes, applies, resets, and leaves the app scrollable', async ({ page }) => {
  test.skip(true, "Stage C: blocked — needs a moderator-approved published/paused/rented real listing. This environment has no moderator test credential (by design: the listings.status column grant excludes authenticated entirely, and moderator_* RPCs require platform_role='moderator', which no test identity has or can self-assign). See the Stage C final report.")
  await page.setViewportSize(viewport390)
  await seedState(page)
  await page.goto('/discover')

  await page.getByRole('button', { name: 'Open filters' }).click()
  await expect(page.getByText('Filters').first()).toBeVisible()
  await page.getByRole('button', { name: 'Close filters' }).last().click()
  await expect(page.getByText('Narrow the property deck')).toBeHidden()

  await page.getByRole('button', { name: 'Open filters' }).click()
  await page.mouse.click(8, 8)
  await expect(page.getByText('Narrow the property deck')).toBeHidden()

  await page.getByRole('button', { name: 'Open filters' }).click()
  await selectGafflo(page, 'Location', 'Ranelagh')
  await page.getByRole('button', { name: 'Show properties' }).click()
  await expect(page.getByRole('button', { name: 'Open filters' })).toContainText('1')

  await page.getByRole('button', { name: 'Open filters' }).click()
  await page.getByRole('button', { name: 'Reset' }).click()
  await page.getByRole('button', { name: 'Show properties' }).click()
  await expect(page.getByRole('button', { name: 'Open filters' })).not.toContainText('1')

  const shellCanScroll = await page.evaluate(() => {
    const shell = document.querySelector('#app-shell-scroll')
    shell.scrollTop = 180
    return shell.scrollTop > 0 && document.body.style.position !== 'fixed'
  })
  expect(shellCanScroll).toBe(true)
})

test('advanced filters stay locked and inert for Free tenants', async ({ page }) => {
  await page.setViewportSize(viewport390)
  await seedState(page)
  await page.goto('/discover')

  await page.getByRole('button', { name: 'Open filters' }).click()
  await selectGafflo(page, 'Listing category', 'Entire property')
  await expect(page.getByText('Unlock these filters with Gafflo+')).toBeVisible()
  await expect(page.getByLabel('Property type')).toBeDisabled()
})

test('Gafflo+ tenants can use advanced filters', async ({ page }) => {
  await page.setViewportSize(viewport390)
  await seedState(page, { tenantPlan: 'gafflo_plus' })
  await page.goto('/discover')

  await page.getByRole('button', { name: 'Open filters' }).click()
  await selectGafflo(page, 'Listing category', 'Entire property')
  await expect(page.getByText('Unlock these filters with Gafflo+')).toHaveCount(0)
  await expect(page.getByLabel('Property type')).toBeEnabled()
})

test('property details open, scroll, close, and keep 390px geometry stable', async ({ page }) => {
  test.skip(true, "Stage C: blocked — needs a moderator-approved published/paused/rented real listing. This environment has no moderator test credential (by design: the listings.status column grant excludes authenticated entirely, and moderator_* RPCs require platform_role='moderator', which no test identity has or can self-assign). See the Stage C final report.")
  await page.setViewportSize(viewport390)
  await seedState(page)
  await page.goto('/discover')

  await page.getByRole('button', { name: /^Open (?!filters)/ }).first().click()
  await expect(page.getByText('Property details').first()).toBeVisible()
  await page.locator('[data-property-details-scroll]').evaluate((node) => {
    node.scrollTop = node.scrollHeight
  })
  await expect(page.getByText('Safety and reporting')).toBeVisible()
  await expectNoHorizontalOverflow(page)

  await page.getByRole('button', { name: 'Close property details' }).click()
  await expect(page).toHaveURL(/\/discover$/)
  await expectNoHorizontalOverflow(page)
})

test('tenant enquiry opens messages with waiting composer and blocks second unsolicited message', async ({ page }) => {
  test.skip(true, "Stage D skip audit: this is Stage E Messaging (composer/duplicate-message-guard), not Stage D Applications — deliberately not re-enabled. Still moderator-blocked as originally noted, but now doubly so: Stage D removed the 'click Interested -> auto-navigate to /messages/conversation-...' mechanic this test depends on entirely (PropertyDetailsModal's Apply button no longer creates or opens a conversation — see the Stage D report's application/messaging decoupling section), so even a moderator credential would not make this exact test valid again as written. It will need a real Stage E rewrite, not a moderator credential.")
  await seedState(page, { enquiries: [], conversations: [] })
  await page.goto('/discover')
  await page.getByRole('button', { name: /^Open (?!filters)/ }).first().click()
  await page.getByRole('button', { name: 'Interested' }).click()

  await expect(page).toHaveURL(/\/messages\/conversation-enquiry-/)
  await expect(page.getByText('Waiting for the landlord to reply')).toBeVisible()
  await expect(page.getByPlaceholder('Write a message')).toHaveCount(0)

  const conversation = await page.evaluate(() => JSON.parse(window.localStorage.getItem('gafflo.conversations'))[0])
  expect(conversation.messages).toHaveLength(1)
})

test('tenant profile city change resets incompatible preferred areas', async ({ page }) => {
  await seedState(page, { identity: 'tenantNoAreas' })
  await page.goto('/profile')

  await selectGafflo(page, 'Suggested areas', 'Rathmines')
  await expect(page.getByRole('button', { name: /Rathmines/ })).toBeVisible()
  await selectGafflo(page, 'Target city', 'Cork')
  await expect(page.getByRole('button', { name: /Rathmines/ })).toHaveCount(0)
})

// The "loads legacy coupleRequirement and persists applyingAsCouple only" e2e case was retired
// in Stage B: it exercised a localStorage-era migration (a profile saved under the old
// coupleRequirement field shape) that has no real equivalent — tenant_profiles has only ever
// had applying_as_couple, so a real authenticated profile can never load in that legacy shape.
// The underlying pure-function migration logic remains covered directly by
// src/__tests__/businessRules.test.js's normalizeTenantProfileForState coverage.

test('tenant profile separates two room applicants from applying as a couple', async ({ page }) => {
  await seedState(page, { identity: 'tenantHousehold2Room' })
  await page.goto('/profile')

  await expect(page.getByLabel('Room applicants')).toHaveValue('2')
  await expect(page.getByLabel('Applying as a couple')).not.toBeChecked()
  await page.getByRole('button', { name: 'Save tenant profile' }).click()
  await expect(page).toHaveURL(/\/discover$/)

  await page.goto('/profile')
  await expect(page.getByLabel('Room applicants')).toHaveValue('2')
  await expect(page.getByLabel('Applying as a couple')).not.toBeChecked()
})

test('create and reopen draft preserves blank numeric field', async ({ page }) => {
  test.skip(true, "Stage C: retired — this exact scenario is now covered against a real Supabase draft/pending listing in e2e/listings.spec.js instead of a gafflo.properties localStorage fixture, which is no longer the source of truth for authenticated listing surfaces.")
  await seedState(page, { identity: 'landlordDefault', properties: [] })
  await page.goto('/listings/new')

  await page.getByLabel('Title').fill('Draft Numeric Blank')
  await page.getByLabel('Area').fill('Rathmines')
  await page.getByLabel('Monthly rent (€)').fill('2050')
  await page.getByLabel('Bedrooms').fill('')
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect(page).toHaveURL(/\/properties$/)

  await page.locator('article').filter({ hasText: 'Draft Numeric Blank' }).getByRole('button', { name: 'Edit' }).click()
  await expect(page.getByLabel('Bedrooms')).toHaveValue('')

  const storedDraft = await page.evaluate(() => JSON.parse(window.localStorage.getItem('gafflo.properties'))[0])
  expect(storedDraft.bedrooms).toBeNull()
})

test('loads incomplete listing draft without writing fabricated enum defaults', async ({ page }) => {
  test.skip(true, "Stage C: retired — this exact scenario is now covered against a real Supabase draft/pending listing in e2e/listings.spec.js instead of a gafflo.properties localStorage fixture, which is no longer the source of truth for authenticated listing surfaces.")
  const seededDraft = {
    id: 'property-incomplete-draft',
    ownerId: 'owner-private-1',
    ownerName: 'Maeve Doyle',
    ownerType: 'Private landlord',
    listingStatus: 'draft',
    title: 'Incomplete enum draft',
    area: 'Rathmines',
    city: 'Dublin',
    rent: null,
    availableFrom: '',
    listingCategory: 'entire_property',
    propertyType: null,
    furnished: null,
    parking: null,
    petsAllowed: null,
    smokingAllowed: null,
    images: [],
    photoMetadata: [],
  }

  await seedState(page, { identity: 'landlordDefault', properties: [seededDraft] })
  await page.goto('/properties')
  await expect(page.getByRole('heading', { name: 'Incomplete enum draft' })).toBeVisible()

  const properties = await page.evaluate(() => JSON.parse(window.localStorage.getItem('gafflo.properties')))
  expect(properties).toHaveLength(1)
  expect(properties[0]).toMatchObject({
    listingStatus: 'draft',
    title: 'Incomplete enum draft',
    propertyType: null,
    furnished: null,
    parking: null,
    petsAllowed: null,
    smokingAllowed: null,
  })
})

test('property-scoped applicants can be opened and cleared', async ({ page }) => {
  test.skip(true, "Stage D skip audit: confirmed Stage D Applications territory (Applicants.jsx's ?property= scoping, now backed by real landlordApplications) — but still genuinely blocked, for a stronger reason than originally recorded: this needs a landlord identity that BOTH this suite controls AND owns a real published listing with a real applicant, and live investigation during Stage D confirmed none of landlordDefault/landlordListingOwnerA/landlordListingOwnerB own any of the handful of real published listings in gafflo-dev (those were published via direct backend/dashboard moderation by accounts this suite has no credentials for). The exact fixture this test used ('property-rathmines-2bed') no longer exists as real data regardless. getValidApplicantPropertyId()/filterApplicantsByProperty() themselves remain covered for real by existing unit tests (src/__tests__/businessRules.test.js), and e2e/applications.spec.js covers the landlord-side privacy/empty-state claims that ARE reachable without an owned published listing — see the Stage D final report for the full breakdown of what could and couldn't be reached.")
  await seedState(page, { identity: 'landlordDefault' })
  await page.goto('/properties')

  await page.locator('article').filter({ hasText: 'Bright two-bedroom apartment in Rathmines' }).getByRole('button', { name: 'Applicants' }).click()
  await expect(page).toHaveURL(/\/applicants\?property=property-rathmines-2bed/)
  await expect(page.getByText('Showing applicants for Bright two-bedroom apartment in Rathmines.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Bright two-bedroom apartment in Rathmines' })).toBeVisible()

  await page.getByRole('button', { name: 'All properties' }).click()
  await expect(page).toHaveURL(/\/applicants$/)
  await expect(page.getByText('Showing applicants for Bright two-bedroom apartment in Rathmines.')).toHaveCount(0)
})

test('landlord own-listing preview hides tenant match content', async ({ page }) => {
  test.skip(true, "Stage C: retired — this exact scenario (fixture title 'Bright two-bedroom apartment in Rathmines', reached via a landlord Properties-list Preview click) can no longer be constructed against real Supabase data, but the underlying claim was miscategorized as moderator-blocked in the original Stage C skip pass: canViewListing()'s own-listing branch is role+ownerId only, with no status condition, so it never actually needed a published listing. Real, corrected coverage now lives in e2e/listings.spec.js's 'landlord own-listing preview (route-based) hides tenant match content for any pre-published status'.")
  await seedState(page, { identity: 'landlordDefault' })
  await page.goto('/properties')

  await page.locator('article').filter({ hasText: 'Bright two-bedroom apartment in Rathmines' }).getByRole('button', { name: 'Preview' }).click()
  await expect(page.getByText('Property details').first()).toBeVisible()
  await expect(page.getByText(/Why this .*fits you/)).toHaveCount(0)
  await expect(page.locator('[aria-label^="Match score"]')).toHaveCount(0)
})

test('mobile geometry stays stable on discover, property details, and dashboard', async ({ page }) => {
  test.skip(true, "Stage C: blocked — needs a moderator-approved published/paused/rented real listing. This environment has no moderator test credential (by design: the listings.status column grant excludes authenticated entirely, and moderator_* RPCs require platform_role='moderator', which no test identity has or can self-assign). See the Stage C final report.")
  await page.setViewportSize(viewport390)
  await seedState(page)

  await page.goto('/discover')
  await expectNoHorizontalOverflow(page)
  await page.getByRole('button', { name: /^Open (?!filters)/ }).first().click()
  await expect(page.getByText('Property details').first()).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.getByRole('button', { name: 'Close property details' }).click()

  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'Find a place that fits the tenancy.' })).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

function buildTestProperty(overrides = {}) {
  return {
    id: 'property-test-listing',
    ownerId: 'owner-private-1',
    ownerName: 'Maeve Doyle',
    ownerType: 'Private landlord',
    listingStatus: 'published',
    title: 'Quiet two-bedroom flat in Ranelagh',
    description: 'A quiet two-bedroom flat close to the village with easy access to the city centre and parks.',
    area: 'Ranelagh',
    city: 'Dublin',
    rent: 1900,
    deposit: 1900,
    billsIncluded: true,
    availableFrom: '2030-01-01',
    minStayMonths: 6,
    listingCategory: 'entire_property',
    propertyType: 'apartment',
    bedrooms: 2,
    bathrooms: 1,
    maxOccupants: 3,
    furnished: 'furnished',
    parking: 'none',
    petsAllowed: 'not_allowed',
    smokingAllowed: 'no',
    viewingType: 'In-person',
    amenities: ['Internet'],
    features: ['Apartment', '2 bedrooms'],
    listingRules: ['No smoking indoors'],
    images: ['https://images.example.test/one.jpg'],
    photoMetadata: [{ id: 'p1', src: 'https://images.example.test/one.jpg', label: 'Cover', isCover: true }],
    ...overrides,
  }
}

test('request review blocks session-only photos and explains why', async ({ page }) => {
  test.skip(true, "Stage C: retired — this exact scenario is now covered against a real Supabase draft/pending listing in e2e/listings.spec.js instead of a gafflo.properties localStorage fixture, which is no longer the source of truth for authenticated listing surfaces.")
  await seedState(page, { identity: 'landlordDefault', properties: [] })
  await page.goto('/listings/new')

  await page.getByLabel('Title').fill('Bright renovated room in Rathmines with lots of light')
  await page.getByLabel('Area').fill('Rathmines')
  await page.getByLabel('Monthly rent (€)').fill('1400')
  await page.getByLabel('Deposit (€)').fill('1400')
  await page.getByLabel('Available from').fill('2030-01-01')
  await page.getByLabel('Property description').fill('A bright, freshly renovated room close to shops, transport links and parks in Rathmines.')
  await page.getByLabel('Add photos').setInputFiles({ name: 'listing.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fake-image-bytes-for-testing') })

  await page.getByRole('button', { name: 'Request review' }).click()
  await expect(page.getByText(/session only/i)).toBeVisible()
  await expect(page).toHaveURL(/\/listings\/new$/)

  const stored = await page.evaluate(() => JSON.parse(window.localStorage.getItem('gafflo.properties') || '[]'))
  expect(stored).toHaveLength(0)
})

test('tenant cannot open a listing that is not public and has no saved or enquiry history', async ({ page }) => {
  const hiddenListing = buildTestProperty({ id: 'property-hidden-draft', listingStatus: 'draft' })
  await seedState(page, { properties: [hiddenListing] })
  await page.goto(`/properties/${hiddenListing.id}`)
  await expect(page.getByText('Property not available')).toBeVisible()
  await expect(page.getByText(hiddenListing.title)).toHaveCount(0)
})

test('landlord cannot open another landlord\'s hidden listing', async ({ page }) => {
  const otherLandlordListing = buildTestProperty({ id: 'property-other-landlord-paused', ownerId: 'owner-agent-1', listingStatus: 'paused' })
  await seedState(page, { identity: 'landlordDefault', properties: [otherLandlordListing] })
  await page.goto(`/properties/${otherLandlordListing.id}`)
  await expect(page.getByText('Property not available')).toBeVisible()
})

test('tenant can still view a previously saved listing after it becomes inactive, marked as historical', async ({ page }) => {
  test.skip(true, "Stage C: blocked — needs a moderator-approved published/paused/rented real listing. This environment has no moderator test credential (by design: the listings.status column grant excludes authenticated entirely, and moderator_* RPCs require platform_role='moderator', which no test identity has or can self-assign). See the Stage C final report.")
  const pausedSavedListing = buildTestProperty({ id: 'property-saved-paused', listingStatus: 'paused' })
  await seedState(page, { properties: [pausedSavedListing], saved: [pausedSavedListing.id] })
  await page.goto(`/properties/${pausedSavedListing.id}`)
  await expect(page.getByRole('heading', { name: pausedSavedListing.title })).toBeVisible()
  await expect(page.getByText('Listing no longer active')).toBeVisible()
})

test('editing a published listing cannot silently move it back into review', async ({ page }) => {
  test.skip(true, "Stage C: blocked (specifically for 'published' status — reaching it genuinely requires a moderator credential this environment does not have) — but the underlying claim this test exists to protect (editing a listing that is not draft/rejected must never re-attempt request_listing_review or move its status) is now covered for real, using pending_verification as the reachable stand-in for 'any non-draft/rejected status': e2e/listings.spec.js's 'editing an already-submitted listing saves fields without re-requesting review or changing status'. That replacement test is also what caught and fixed the real CreateListing.jsx bug this exact skip would otherwise have hidden — see the Stage C final report.")
  const published = buildTestProperty({ id: 'property-edit-published', listingStatus: 'published' })
  await seedState(page, { identity: 'landlordDefault', properties: [published] })
  await page.goto(`/listings/${published.id}/edit`)

  await page.getByLabel('Title').fill('Quiet two-bedroom flat in Ranelagh — repainted')
  await page.getByRole('button', { name: 'Request review' }).click()
  await expect(page).toHaveURL(/\/properties$/)

  const stored = await page.evaluate(() => JSON.parse(window.localStorage.getItem('gafflo.properties'))[0])
  expect(stored.listingStatus).toBe('published')
  expect(stored.title).toBe('Quiet two-bedroom flat in Ranelagh — repainted')
})

test('availability confirmation timestamp only refreshes when availableFrom actually changes', async ({ page }) => {
  test.skip(true, "Stage C: retired — this exact scenario is now covered against a real Supabase draft/pending listing in e2e/listings.spec.js instead of a gafflo.properties localStorage fixture, which is no longer the source of truth for authenticated listing surfaces.")
  const listing = buildTestProperty({
    id: 'property-availability-edit',
    listingStatus: 'published',
    availableFrom: '2030-01-01',
    availabilityConfirmedAt: '2029-01-01T00:00:00.000Z',
  })
  await seedState(page, { identity: 'landlordDefault', properties: [listing] })

  await page.goto(`/listings/${listing.id}/edit`)
  await page.getByLabel('Title').fill('Quiet two-bedroom flat in Ranelagh — repainted')
  await page.getByRole('button', { name: 'Request review' }).click()
  await expect(page).toHaveURL(/\/properties$/)
  let stored = await page.evaluate(() => JSON.parse(window.localStorage.getItem('gafflo.properties'))[0])
  expect(stored.availabilityConfirmedAt).toBe('2029-01-01T00:00:00.000Z')

  await page.goto(`/listings/${listing.id}/edit`)
  await page.getByLabel('Available from').fill('2030-03-01')
  await page.getByRole('button', { name: 'Request review' }).click()
  await expect(page).toHaveURL(/\/properties$/)
  stored = await page.evaluate(() => JSON.parse(window.localStorage.getItem('gafflo.properties'))[0])
  expect(stored.availabilityConfirmedAt).not.toBe('2029-01-01T00:00:00.000Z')
})

test('legacy sender labels do not bypass the duplicate message guard', async ({ page }) => {
  test.skip(true, "Stage C: blocked — needs a moderator-approved published/paused/rented real listing. This environment has no moderator test credential (by design: the listings.status column grant excludes authenticated entirely, and moderator_* RPCs require platform_role='moderator', which no test identity has or can self-assign). See the Stage C final report.")
  const now = new Date().toISOString()
  const legacyConversation = {
    id: 'conversation-legacy-duplicate',
    propertyId: 'property-rathmines-2bed',
    enquiryId: 'enquiry-legacy-duplicate',
    tenantId: 'tenant-local',
    ownerId: 'owner-private-1',
    archived: false,
    unreadFor: null,
    createdAt: now,
    updatedAt: now,
    // Legacy sender label from before the tenant/landlord rename — should still be recognised as "tenant".
    messages: [{ id: 'message-legacy-1', sender: 'user', body: 'Is this still available?', createdAt: now }],
  }
  const legacyEnquiry = {
    id: 'enquiry-legacy-duplicate',
    propertyId: 'property-rathmines-2bed',
    tenantId: 'tenant-local',
    ownerId: 'owner-private-1',
    status: 'landlord interested',
    createdAt: now,
    updatedAt: now,
    message: 'Is this still available?',
    viewing: { status: 'none', proposedSlots: [], selectedSlot: '' },
  }
  await seedState(page, { enquiries: [legacyEnquiry], conversations: [legacyConversation] })
  await page.goto('/messages/conversation-legacy-duplicate')

  // Re-sending the same body immediately should be recognised as a duplicate of the legacy-labelled
  // message above, even though its stored sender is the pre-rename "user" value, not "tenant".
  await page.getByPlaceholder('Write a message').fill('Is this still available?')
  await page.getByRole('button', { name: 'Send message' }).click()

  await expect(page.getByText('Is this still available?')).toHaveCount(1)
  const stored = await page.evaluate(() => JSON.parse(window.localStorage.getItem('gafflo.conversations'))[0])
  expect(stored.messages).toHaveLength(1)
})

test('messages inbox only shows conversations for the current role and identity', async ({ page }) => {
  test.skip(true, "Stage C: blocked — needs a moderator-approved published/paused/rented real listing. This environment has no moderator test credential (by design: the listings.status column grant excludes authenticated entirely, and moderator_* RPCs require platform_role='moderator', which no test identity has or can self-assign). See the Stage C final report.")
  const now = new Date().toISOString()
  const ownConversation = {
    id: 'conversation-own',
    propertyId: 'property-rathmines-2bed',
    enquiryId: 'enquiry-own',
    tenantId: 'tenant-local',
    ownerId: 'owner-private-1',
    archived: false,
    unreadFor: null,
    createdAt: now,
    updatedAt: now,
    messages: [{ id: 'm1', sender: 'tenant', body: 'This is my conversation', createdAt: now }],
  }
  const otherTenantConversation = {
    id: 'conversation-other-tenant',
    propertyId: 'property-rathmines-2bed',
    enquiryId: 'enquiry-other-tenant',
    tenantId: 'tenant-aoife',
    ownerId: 'owner-private-1',
    archived: false,
    unreadFor: null,
    createdAt: now,
    updatedAt: now,
    messages: [{ id: 'm2', sender: 'tenant', body: 'This belongs to another tenant', createdAt: now }],
  }
  await seedState(page, { conversations: [ownConversation, otherTenantConversation] })
  await page.goto('/messages')

  await expect(page.getByText('This is my conversation')).toBeVisible()
  await expect(page.getByText('This belongs to another tenant')).toHaveCount(0)
})

test('Free tenants lose old closed enquiry history after 30 days, Gafflo+ tenants keep it', async ({ page }) => {
  test.skip(true, "Stage C: blocked — needs a moderator-approved published/paused/rented real listing. This environment has no moderator test credential (by design: the listings.status column grant excludes authenticated entirely, and moderator_* RPCs require platform_role='moderator', which no test identity has or can self-assign). See the Stage C final report.")
  const oldTimestamp = '2020-01-01T00:00:00.000Z'
  const oldClosedConversation = {
    id: 'conversation-old-closed',
    propertyId: 'property-rathmines-2bed',
    enquiryId: 'enquiry-old-closed',
    tenantId: 'tenant-local',
    ownerId: 'owner-private-1',
    archived: false,
    unreadFor: null,
    createdAt: oldTimestamp,
    updatedAt: oldTimestamp,
    messages: [{ id: 'm-old', sender: 'tenant', body: 'An old closed enquiry conversation', createdAt: oldTimestamp }],
  }
  const oldClosedEnquiry = {
    id: 'enquiry-old-closed',
    propertyId: 'property-rathmines-2bed',
    tenantId: 'tenant-local',
    ownerId: 'owner-private-1',
    status: 'rejected',
    createdAt: oldTimestamp,
    updatedAt: oldTimestamp,
    message: 'An old closed enquiry conversation',
    viewing: { status: 'none', proposedSlots: [], selectedSlot: '' },
  }

  await seedState(page, { enquiries: [oldClosedEnquiry], conversations: [oldClosedConversation] })
  await page.goto('/messages')
  await expect(page.getByText('An old closed enquiry conversation')).toHaveCount(0)

  await seedState(page, { enquiries: [oldClosedEnquiry], conversations: [oldClosedConversation], tenantPlan: 'gafflo_plus' })
  await page.goto('/messages')
  await expect(page.getByText('An old closed enquiry conversation')).toBeVisible()
})

test('draft listing with no rent set shows a clear placeholder instead of a fake price', async ({ page }) => {
  test.skip(true, "Stage C: retired — this exact scenario is now covered against a real Supabase draft/pending listing in e2e/listings.spec.js instead of a gafflo.properties localStorage fixture, which is no longer the source of truth for authenticated listing surfaces.")
  const rentlessDraft = {
    id: 'property-rentless-draft',
    ownerId: 'owner-private-1',
    ownerName: 'Maeve Doyle',
    ownerType: 'Private landlord',
    listingStatus: 'draft',
    title: 'Draft without a rent yet',
    area: 'Rathmines',
    city: 'Dublin',
    rent: null,
    availableFrom: '',
    listingCategory: 'entire_property',
    propertyType: null,
    furnished: null,
    parking: null,
    petsAllowed: null,
    smokingAllowed: null,
    images: [],
    photoMetadata: [],
  }
  await seedState(page, { identity: 'landlordDefault', properties: [rentlessDraft] })
  await page.goto('/properties')

  await expect(page.getByRole('heading', { name: 'Draft without a rent yet' })).toBeVisible()
  await expect(page.getByText('Rent not set')).toBeVisible()
  await expect(page.getByText('€0/mo')).toHaveCount(0)
})

test('top app bar stays attached to the top edge and visible while content scrolls', async ({ page }) => {
  await page.setViewportSize(viewport390)
  await seedState(page)
  await page.goto('/discover')

  const header = page.locator('header')
  const before = await header.boundingBox()
  expect(before.y).toBeLessThanOrEqual(1)
  expect(before.width).toBeGreaterThan(380)
  const radius = await header.evaluate((node) => window.getComputedStyle(node).borderRadius)
  expect(parseFloat(radius)).toBeLessThanOrEqual(2)

  await page.evaluate(() => document.querySelector('#app-shell-scroll')?.scrollTo({ top: 400 }))
  await page.waitForTimeout(50)
  const after = await header.boundingBox()
  expect(after.y).toBeLessThanOrEqual(1)
  await expect(page.getByRole('button', { name: 'Open filters' })).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

test('tenant profile shows a Gafflo+ entry point with only real, wired benefits', async ({ page }) => {
  await seedState(page)
  await page.goto('/profile')

  await expect(page.getByRole('heading', { name: 'Gafflo+' })).toBeVisible()
  await expect(page.getByText('€4.99')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Gafflo+ coming soon' })).toHaveCount(0)
})

test('Gafflo+ entry opens the plan screen with the canonical price and a quick Free-vs-Plus glance', async ({ page }) => {
  await page.setViewportSize(viewport390)
  await seedState(page)
  await page.goto('/profile')

  await page.getByRole('button', { name: 'Explore Gafflo+' }).click()
  const dialog = page.getByRole('dialog', { name: 'Gafflo+' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Get ahead in your rental search.')).toBeVisible()
  await expect(dialog.getByText('€4.99').first()).toBeVisible()
  await expect(dialog.getByText('Everything in Free + premium benefits')).toBeVisible()
  await expect(dialog.getByText('Planned Gafflo+ pricing', { exact: false })).toBeVisible()
  await expect(dialog.getByText('Cancel anytime')).toHaveCount(0)
  await expectNoHorizontalOverflow(page)
})

test('Gafflo+ "See all benefits" opens the full benefits screen with only real, wired benefits', async ({ page }) => {
  await page.setViewportSize(viewport390)
  await seedState(page)
  await page.goto('/profile')
  await page.getByRole('button', { name: 'Explore Gafflo+' }).click()

  await page.getByRole('button', { name: 'See all benefits' }).click()
  const dialog = page.getByRole('dialog', { name: 'All the advantages' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Advanced filters').first()).toBeVisible()
  await expect(dialog.getByText('Full application history').first()).toBeVisible()
  await expect(dialog.getByText('100 Smart Match cards a day')).toBeVisible()
  await expect(dialog.getByText('25 Interested actions a day')).toBeVisible()
  await expect(dialog.getByText('Standard application history')).toBeVisible()
  await expect(dialog.getByText('Everything in Free')).toBeVisible()
  await expect(
    dialog.getByText('Gafflo+ never changes your Rental Fit score or moves your application ahead of other renters.'),
  ).toBeVisible()
  // Rewind, alerts, compare and the follow-up message are not implemented yet — they must not
  // be advertised as current Gafflo+ benefits (see config/pricingPlans.js).
  await expect(dialog.getByText('Rewind')).toHaveCount(0)
  await expect(dialog.getByText(/alerts/i)).toHaveCount(0)
  await expect(dialog.getByText('Compare listings')).toHaveCount(0)
  await expect(dialog.getByText(/follow-up/i)).toHaveCount(0)
  await expectNoHorizontalOverflow(page)
})

test('Gafflo+ benefits screen CTA is non-transactional, and the back button returns to the plan screen', async ({ page }) => {
  await seedState(page)
  await page.goto('/profile')
  await page.getByRole('button', { name: 'Explore Gafflo+' }).click()
  await page.getByRole('button', { name: 'Compare plans' }).click()

  await expect(page.getByRole('button', { name: 'Gafflo+ coming soon' })).toBeDisabled()
  await expect(page.getByText('Payments aren’t available in this preview yet.')).toBeVisible()
  await expect(page.getByRole('button', { name: /^(Subscribe|Buy|Start subscription|Pay now|Purchase)$/ })).toHaveCount(0)

  await page.getByRole('button', { name: 'Back to Gafflo+ plan' }).click()
  await expect(page.getByRole('dialog', { name: 'Gafflo+' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'See all benefits' })).toBeVisible()
})

test('Gafflo+ presentation closes via the X button, the backdrop, and Escape, and leaves the app scrollable', async ({ page }) => {
  await page.setViewportSize(viewport390)
  await seedState(page)
  await page.goto('/profile')

  await page.getByRole('button', { name: 'Explore Gafflo+' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.getByRole('button', { name: 'Explore Gafflo+' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.mouse.click(8, 8)
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.getByRole('button', { name: 'Explore Gafflo+' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  const shellCanScroll = await page.evaluate(() => {
    const shell = document.querySelector('#app-shell-scroll')
    shell.scrollTop = 40
    return shell.scrollTop > 0
  })
  expect(shellCanScroll).toBe(true)
})

test('landlord profile shows a Landlord Plus upgrade entry point with only real, wired benefits', async ({ page }) => {
  await seedState(page, { identity: 'landlordDefault' })
  await page.goto('/profile')

  await expect(page.getByText('Landlord Plus')).toBeVisible()
  await expect(page.getByText('€19.99')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Purchase' })).toHaveCount(0)
})

test('landlord plans preview shows Free, Single Listing Plus, Landlord Plus and Boost with the trust line, and is non-transactional', async ({ page }) => {
  await page.setViewportSize(viewport390)
  await seedState(page, { identity: 'landlordDefault' })
  await page.goto('/profile')

  await page.getByRole('button', { name: 'Explore plans and add-ons' }).click()
  const dialog = page.getByRole('dialog', { name: 'Plans and add-ons' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Landlord Free')).toBeVisible()
  await expect(dialog.getByText('Single Listing Plus')).toBeVisible()
  await expect(dialog.getByText('Landlord Plus')).toBeVisible()
  await expect(dialog.getByText('Listing Boost')).toBeVisible()
  await expect(dialog.getByText('You can pay for exposure. You cannot pay for compatibility.', { exact: false })).toBeVisible()
  // Applicant tools, templates-as-a-paid-feature, and analytics have no UI behind them yet.
  await expect(dialog.getByText('Advanced applicant filters')).toHaveCount(0)
  await expect(dialog.getByText('Listing analytics')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Coming soon' })).toBeDisabled()
  await expect(dialog.getByRole('button', { name: /^(Subscribe|Buy|Purchase|Pay now)$/ })).toHaveCount(0)
})

test('free landlord cannot resume a listing beyond the active listing allowance', async ({ page }) => {
  test.skip(true, "Stage C: blocked — needs a moderator-approved published/paused/rented real listing. This environment has no moderator test credential (by design: the listings.status column grant excludes authenticated entirely, and moderator_* RPCs require platform_role='moderator', which no test identity has or can self-assign). See the Stage C final report.")
  await seedState(page, { identity: 'landlordDefault' })
  await page.goto('/properties')

  await page.locator('article').filter({ hasText: 'Drumcondra' }).getByRole('button', { name: 'Resume' }).click()
  await expect(page.getByRole('heading', { name: 'You’re at your active listing limit' })).toBeVisible()
  await expect(page.getByText('Landlord Plus')).toBeVisible()

  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()
  await expect(page.locator('article').filter({ hasText: 'Drumcondra' }).getByText('Paused')).toBeVisible()
})

test('a boosted listing is labelled Promoted in Browse but never appears in Smart Match', async ({ page }) => {
  test.skip(true, "Stage C: blocked — needs a moderator-approved published/paused/rented real listing. This environment has no moderator test credential (by design: the listings.status column grant excludes authenticated entirely, and moderator_* RPCs require platform_role='moderator', which no test identity has or can self-assign). See the Stage C final report.")
  await seedState(page)
  await page.goto('/discover')

  await page.getByRole('button', { name: 'Browse' }).click()
  await expect(page.getByText('Promoted').first()).toBeVisible()

  await page.getByRole('button', { name: 'Smart Match' }).click()
  await expect(page.getByText('Promoted')).toHaveCount(0)
})

test('bottom nav remains visible and does not block a lower primary action', async ({ page }) => {
  test.skip(true, "Stage C: blocked — needs a moderator-approved published/paused/rented real listing. This environment has no moderator test credential (by design: the listings.status column grant excludes authenticated entirely, and moderator_* RPCs require platform_role='moderator', which no test identity has or can self-assign). See the Stage C final report.")
  await page.setViewportSize(viewport390)
  await seedState(page)
  await page.goto('/dashboard')

  await expect(page.getByRole('navigation')).toBeVisible()
  await page.getByRole('button', { name: 'View top fit' }).scrollIntoViewIfNeeded()
  await page.getByRole('button', { name: 'View top fit' }).click()
  await expect(page.getByText('Property details').first()).toBeVisible()
})

test('landlord dashboard surfaces a "what needs your attention" summary instead of duplicated metrics', async ({ page }) => {
  test.skip(true, "Stage D skip audit: confirmed Stage D Applications territory (Dashboard.jsx's newInterest is now real landlordApplications.filter(status === 'sent').length) — but the 'new applicant' text needs a real applicant on a real published listing owned by a frontend-controlled identity, and live investigation during Stage D confirmed no such identity/listing combination exists in gafflo-dev (see the property-scoped-applicants skip above for the same underlying constraint). The companion test right below this one ('...calm empty state when nothing needs attention') already covers the zero-applicants path for real, and e2e/applications.spec.js's empty-state test confirms a real zero-applications landlord sees the honest empty Applicants page — the remaining gap is specifically the non-empty 'N new applicants' rendering, which is unreachable without a moderator credential this environment does not have.")
  await seedState(page, { identity: 'landlordDefault' })
  await page.goto('/dashboard')

  await expect(page.getByRole('heading', { name: 'What needs your attention' })).toBeVisible()
  await expect(page.getByText(/new applicant/)).toBeVisible()
  // These now live only on Properties (status tabs) and Applicants (pipeline tabs), and the old
  // flat metric-tile grid + separate "new interested tenants" card are gone.
  await expect(page.getByText('Active properties')).toHaveCount(0)
  await expect(page.getByText('Shortlisted tenants', { exact: true })).toHaveCount(0)
  await expect(page.getByText('New interested tenants', { exact: true })).toHaveCount(0)
})

test('landlord dashboard shows a calm empty state when nothing needs attention — no fake urgency', async ({ page }) => {
  const now = new Date().toISOString()
  const unrelatedEnquiry = {
    id: 'enquiry-unrelated',
    propertyId: 'property-smithfield-studio',
    tenantId: 'tenant-someone-else',
    ownerId: 'owner-agent-1',
    status: 'sent',
    createdAt: now,
    updatedAt: now,
    message: 'Hi',
    viewing: { status: 'none', proposedSlots: [], selectedSlot: '' },
  }
  const unrelatedConversation = {
    id: 'conversation-unrelated',
    propertyId: 'property-smithfield-studio',
    enquiryId: 'enquiry-unrelated',
    tenantId: 'tenant-someone-else',
    ownerId: 'owner-agent-1',
    archived: false,
    unreadFor: null,
    createdAt: now,
    updatedAt: now,
    messages: [{ id: 'm-unrelated', sender: 'tenant', body: 'Hi', createdAt: now }],
  }
  await seedState(page, { identity: 'landlordDefault', enquiries: [unrelatedEnquiry], conversations: [unrelatedConversation] })
  await page.goto('/dashboard')

  await expect(page.getByRole('heading', { name: 'What needs your attention' })).toBeVisible()
  await expect(page.getByText(/all caught up/i)).toBeVisible()
})

test('smart match card caps secondary status pills at two high-value signals', async ({ page }) => {
  test.skip(true, "Stage D skip audit: this was already unreachable regardless of moderator access (buildTestProperty's gafflo.properties fixture is inert — Stage C made real Supabase listings the only source), and Stage D adds a second, permanent reason: the deck card's status pill now reads getTenantApplicationForListing()?.statusLabel from real applications (see MarketplaceDiscover.jsx's SmartMatchDeck), never the mock enquiries fixture this test seeds — so no moderator credential could ever make the specific mechanism this test exercises real again as written. The underlying claim (a real application status pill renders on a real Browse/Smart Match card) is covered for real by e2e/applications.spec.js's main apply test; the specific 'caps at two pills, saved is dropped in favour of status+freshness' priority-ordering claim has no real-backend equivalent yet since it needs multiple simultaneous real signals (new + saved + application status) on one real listing, which the same moderator/ownership constraint still blocks.")
  const now = new Date().toISOString()
  const property = buildTestProperty({
    id: 'property-pill-cap-test',
    title: 'Signal-dense test listing in Waterford',
    city: 'Waterford',
    area: 'City Centre',
    rent: 1500,
    createdAt: now,
  })
  const enquiry = {
    id: 'enquiry-pill-cap-test',
    propertyId: property.id,
    tenantId: 'tenant-local',
    ownerId: 'owner-private-1',
    status: 'landlord interested',
    createdAt: now,
    updatedAt: now,
    message: 'Interested.',
    viewing: { status: 'none', proposedSlots: [], selectedSlot: '' },
  }

  await seedState(page, {
    identity: 'tenantWaterford',
    properties: [property],
    enquiries: [enquiry],
    conversations: [],
    saved: [property.id],
    dismissed: [],
  })
  await page.goto('/discover')

  const card = page.getByRole('button', { name: `Open ${property.title}` })
  await expect(card).toBeVisible()
  // Four signals are eligible here (enquiry status, new, saved, freshness) — only the two
  // highest-value ones (application status, then freshness/trust) should render on the card.
  await expect(card.getByText('Landlord interested')).toBeVisible()
  await expect(card.getByText('New', { exact: true })).toBeVisible()
  await expect(card.getByText('Saved', { exact: true })).toHaveCount(0)
})

test('Smart Match never renders the next listing’s photo or text underneath the active card', async ({ page }) => {
  test.skip(true, "Stage C: blocked — needs a moderator-approved published/paused/rented real listing. This environment has no moderator test credential (by design: the listings.status column grant excludes authenticated entirely, and moderator_* RPCs require platform_role='moderator', which no test identity has or can self-assign). See the Stage C final report.")
  await seedState(page)
  await page.goto('/discover')

  const backplate = page.getByTestId('smart-match-backplate')
  await expect(backplate).toBeVisible()
  await expect(backplate.locator('img')).toHaveCount(0)
  const backplateText = (await backplate.textContent()) ?? ''
  expect(backplateText.trim()).toBe('')

  // Scoped to the active-card + backplate stack only: exactly one image belongs there — the
  // active card's own photo. The backplate contributes none of its own.
  const deckStack = backplate.locator('xpath=..')
  await expect(deckStack.locator('img')).toHaveCount(1)
})

const allPublishedMockPropertyIds = [
  'property-rathmines-2bed',
  'property-smithfield-studio',
  'room-ranelagh-private',
  'room-portobello-owner',
  'property-ballsbridge-1bed',
  'property-portobello-1bed',
  'property-grand-canal-2bed',
]

test('reviewing all eligible listings is not treated as a paywall event', async ({ page }) => {
  test.skip(true, "Stage C: blocked — needs a moderator-approved published/paused/rented real listing. This environment has no moderator test credential (by design: the listings.status column grant excludes authenticated entirely, and moderator_* RPCs require platform_role='moderator', which no test identity has or can self-assign). See the Stage C final report.")
  await seedState(page, { dismissed: allPublishedMockPropertyIds })
  await page.goto('/discover')

  await expect(page.getByRole('heading', { name: "You've reviewed all eligible listings." })).toBeVisible()
  await expect(page.getByText('Continue with Gafflo+')).toHaveCount(0)
  await expect(page.getByText('Want more today?')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Continue browsing' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start over' })).toBeEnabled()
})

test('reviewing all eligible listings still avoids the paywall on the non-launch limit path when the limit itself has not been hit', async ({ page }) => {
  test.skip(true, "Stage C: blocked — needs a moderator-approved published/paused/rented real listing. This environment has no moderator test credential (by design: the listings.status column grant excludes authenticated entirely, and moderator_* RPCs require platform_role='moderator', which no test identity has or can self-assign). See the Stage C final report.")
  await seedState(page, {
    dismissed: allPublishedMockPropertyIds,
    launchOverride: false,
    smartMatchActivity: { [todayDateKey()]: { cards: 2, interests: 1 } },
  })
  await page.goto('/discover')

  await expect(page.getByRole('heading', { name: "You've reviewed all eligible listings." })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Daily Smart Match limit reached.' })).toHaveCount(0)
  await expect(page.getByText('Continue with Gafflo+')).toHaveCount(0)
})

test('hitting the daily Smart Match card limit on the non-launch path shows a restrained Gafflo+ upgrade that opens the plan directly', async ({ page }) => {
  await seedState(page, {
    launchOverride: false,
    smartMatchActivity: { [todayDateKey()]: { cards: 30, interests: 0 } },
  })
  await page.goto('/discover')

  await expect(page.getByText("You've reached today's Smart Match card limit.")).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pass' })).toBeDisabled()
  await expect(page.getByRole('button', { name: /Interested|Limit reached/ })).toBeDisabled()

  await page.getByRole('button', { name: 'Continue with Gafflo+' }).click()
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Gafflo+' })).toBeVisible()
  // Opens in place — never a route change to Profile.
  await expect(page).toHaveURL(/\/discover/)
})

test('hitting the daily Interested limit on the non-launch path explains the allowance without promising unlimited use', async ({ page }) => {
  await seedState(page, {
    launchOverride: false,
    smartMatchActivity: { [todayDateKey()]: { cards: 5, interests: 10 } },
  })
  await page.goto('/discover')

  await expect(page.getByText("You've reached today's Interested limit.")).toBeVisible()
  await expect(page.getByRole('button', { name: 'Limit reached' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Pass' })).toBeEnabled()
  await expect(page.getByText('unlimited', { exact: false })).toHaveCount(0)

  await page.getByRole('button', { name: 'Continue with Gafflo+' }).click()
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Gafflo+' })).toBeVisible()
})

test('while launch access is enabled, heavy Smart Match usage never forces a paywall and the actual plan stays Free', async ({ page }) => {
  await seedState(page, { smartMatchActivity: { [todayDateKey()]: { cards: 500, interests: 500 } } })
  await page.goto('/discover')

  await expect(page.getByRole('button', { name: 'Pass' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Interested' })).toBeEnabled()
  await expect(page.getByText('Continue with Gafflo+')).toHaveCount(0)
  await expect(page.getByText('Cards today')).toBeVisible()
})

test('landlord quick replies insert text into the composer but never send automatically', async ({ page }) => {
  test.skip(true, "Stage C: blocked — needs a moderator-approved published/paused/rented real listing. This environment has no moderator test credential (by design: the listings.status column grant excludes authenticated entirely, and moderator_* RPCs require platform_role='moderator', which no test identity has or can self-assign). See the Stage C final report.")
  await page.setViewportSize(viewport390)
  const now = new Date().toISOString()
  const conversation = {
    id: 'conversation-quick-reply',
    propertyId: 'property-rathmines-2bed',
    enquiryId: 'enquiry-quick-reply',
    tenantId: 'tenant-quick-reply',
    ownerId: 'owner-private-1',
    archived: false,
    unreadFor: null,
    createdAt: now,
    updatedAt: now,
    messages: [{ id: 'm-qr-1', sender: 'tenant', body: 'Hi, is this still available?', createdAt: now }],
  }
  await seedState(page, { identity: 'landlordDefault', conversations: [conversation] })
  await page.goto('/messages')
  await page.getByRole('button', { name: /Bright two-bedroom apartment in Rathmines/ }).click()
  await expectNoHorizontalOverflow(page)

  const replyBody = 'Thanks for your interest. Could you confirm your preferred move-in date?'
  // Scoped to rendered <p> bubble content so this never matches the composer textarea's value
  // (a <p> has no accessible "name" from its content, so getByRole('paragraph', {name}) would
  // silently never match anything — plain text-content filtering on the tag is what we want here).
  const sentBubble = page.locator('p').filter({ hasText: replyBody })
  const composer = page.getByPlaceholder('Write a message')
  await expect(composer).toHaveValue('')
  await expect(sentBubble).toHaveCount(0)

  await page.getByRole('button', { name: 'Confirm move-in' }).click()
  await expect(composer).toHaveValue(replyBody)
  // Still just a draft — inserting a template must never send on its own.
  await expect(sentBubble).toHaveCount(0)

  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(sentBubble).toHaveCount(1)
  await expect(composer).toHaveValue('')
})

test('Boost preview is informational only, non-transactional, and states the exposure-not-compatibility trust line', async ({ page }) => {
  test.skip(true, "Stage C: blocked — needs a moderator-approved published/paused/rented real listing. This environment has no moderator test credential (by design: the listings.status column grant excludes authenticated entirely, and moderator_* RPCs require platform_role='moderator', which no test identity has or can self-assign). See the Stage C final report.")
  await seedState(page, { identity: 'landlordDefault' })
  await page.goto('/properties')

  await page.locator('article').filter({ hasText: 'Rathmines' }).getByRole('button', { name: 'Boost listing' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Boost this listing')).toBeVisible()
  await expect(dialog.getByText('€8.99').first()).toBeVisible()
  await expect(
    dialog.getByText('You can pay for exposure. You cannot pay for compatibility.', { exact: false }),
  ).toBeVisible()
  await expect(dialog.getByRole('button', { name: /Boost coming soon/ })).toBeDisabled()
  await expect(dialog.getByText("Payments aren’t available yet.")).toBeVisible()

  await dialog.getByRole('button', { name: 'Close' }).click()
  // Closing the preview must never activate the boost or mutate the listing.
  const rathminesCard = page.locator('article').filter({ hasText: 'Rathmines' })
  await expect(rathminesCard.getByText('Promoted')).toHaveCount(0)
  await expect(rathminesCard.getByText('Boost active')).toHaveCount(0)
})

function buildLifecycleProperties() {
  const base = buildTestProperty({ area: 'Drumcondra', availableFrom: '2030-01-01' })
  return [
    { ...base, id: 'property-lifecycle-draft', title: 'Lifecycle stage draft listing', listingStatus: 'draft', rent: null },
    { ...base, id: 'property-lifecycle-pending', title: 'Lifecycle stage pending listing', listingStatus: 'pending_verification' },
    { ...base, id: 'property-lifecycle-published', title: 'Lifecycle stage published listing', listingStatus: 'published' },
    { ...base, id: 'property-lifecycle-paused', title: 'Lifecycle stage paused listing', listingStatus: 'paused' },
    { ...base, id: 'property-lifecycle-rented', title: 'Lifecycle stage rented listing', listingStatus: 'rented' },
  ]
}

test('each listing lifecycle stage shows exactly one clear primary action, and an unset rent stays honest', async ({ page }) => {
  test.skip(true, "Stage C: blocked — needs a moderator-approved published/paused/rented real listing. This environment has no moderator test credential (by design: the listings.status column grant excludes authenticated entirely, and moderator_* RPCs require platform_role='moderator', which no test identity has or can self-assign). See the Stage C final report.")
  await seedState(page, { identity: 'landlordDefault', properties: buildLifecycleProperties() })
  await page.goto('/properties')

  const draftCard = page.locator('article').filter({ hasText: 'Lifecycle stage draft listing' })
  await expect(draftCard.getByText('Rent not set')).toBeVisible()
  await expect(draftCard.getByRole('button', { name: 'Continue editing' })).toHaveClass(/bg-indigo-950/)

  const pendingCard = page.locator('article').filter({ hasText: 'Lifecycle stage pending listing' })
  await expect(pendingCard.getByRole('button', { name: 'Preview' })).toHaveClass(/bg-indigo-950/)

  const publishedCard = page.locator('article').filter({ hasText: 'Lifecycle stage published listing' })
  await expect(publishedCard.getByRole('button', { name: 'Applicants' })).toHaveClass(/bg-indigo-950/)

  const pausedCard = page.locator('article').filter({ hasText: 'Lifecycle stage paused listing' })
  await expect(pausedCard.getByRole('button', { name: 'Resume' })).toHaveClass(/bg-indigo-950/)

  const rentedCard = page.locator('article').filter({ hasText: 'Lifecycle stage rented listing' })
  await expect(rentedCard.getByRole('button', { name: 'View history' })).toHaveClass(/bg-indigo-950/)
})

test('new landlord monetisation surfaces stay within mobile width with no horizontal overflow', async ({ page }) => {
  test.skip(true, "Stage C: blocked — needs a moderator-approved published/paused/rented real listing. This environment has no moderator test credential (by design: the listings.status column grant excludes authenticated entirely, and moderator_* RPCs require platform_role='moderator', which no test identity has or can self-assign). See the Stage C final report.")
  await page.setViewportSize(viewport390)
  await seedState(page, { identity: 'landlordDefault' })

  await page.goto('/properties')
  await expectNoHorizontalOverflow(page)

  await page.locator('article').filter({ hasText: 'Rathmines' }).getByRole('button', { name: 'Boost listing' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()

  await page.locator('article').filter({ hasText: 'Drumcondra' }).getByRole('button', { name: 'Resume' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()

  await page.goto('/profile')
  await page.getByRole('button', { name: 'Explore plans and add-ons' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

test('the Gafflo select opens on click, supports full keyboard interaction, and persists the chosen value', async ({ page }) => {
  await seedState(page, { identity: 'tenantSelectSaveTest' })
  await page.goto('/profile')

  const trigger = page.getByLabel('Target city')
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  const listbox = page.getByRole('listbox')
  await expect(listbox).toBeVisible()
  await expect(listbox.getByRole('option', { name: 'Dublin' })).toHaveAttribute('aria-selected', 'true')

  // Escape closes without changing the value.
  await page.keyboard.press('Escape')
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect(trigger).toHaveText('Dublin')

  // Keyboard: open, arrow to the next option, commit with Enter.
  await trigger.click()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect(trigger).toHaveText('Cork')

  // The selection is real form state, not just visual — it's what actually gets saved to
  // Supabase, not just held in the UI.
  await page.getByRole('button', { name: 'Save tenant profile' }).click()
  await expect(page).toHaveURL(/\/discover$/)
  await page.goto('/profile')
  await expect(page.getByLabel('Target city')).toHaveText('Cork')
})

test('the Gafflo select closes on outside click, never overflows a narrow mobile viewport, and opening one closes another', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 })
  await seedState(page)
  await page.goto('/profile')

  await page.getByLabel('Target city').click()
  await expect(page.getByRole('listbox')).toBeVisible()
  await expectNoHorizontalOverflow(page)

  // Outside click closes it.
  await page.getByRole('heading', { name: 'Your rental profile' }).click()
  await expect(page.getByRole('listbox')).toHaveCount(0)

  // Opening a second select closes the first automatically — never two open at once.
  await page.getByLabel('Target city').click()
  await expect(page.getByRole('listbox')).toHaveCount(1)
  await page.getByLabel('Lease length').click()
  await expect(page.getByRole('listbox')).toHaveCount(1)
  await expect(page.getByRole('listbox').getByRole('option', { name: '12 months' })).toBeVisible()
})

test('toggling "Applying as a couple" on raises applicant count to at least 2, and toggling it off never reduces the count', async ({ page }) => {
  await seedState(page, { identity: 'tenantHousehold1Room' })
  await page.goto('/profile')

  const householdField = page.getByLabel('Room applicants')
  const coupleToggleLabel = page.getByText('Applying as a couple', { exact: true })
  const coupleToggleInput = page.getByLabel('Applying as a couple')
  await expect(householdField).toHaveValue('1')

  // 1 applicant + Couple Yes -> automatically becomes 2, with no validation error to fix by hand.
  await coupleToggleLabel.click()
  await expect(coupleToggleInput).toBeChecked()
  await expect(householdField).toHaveValue('2')
  await expect(page.getByText('Set room applicants to 2 people')).toHaveCount(0)

  // Couple Yes -> No must not reduce the count: two friends applying together is still valid.
  await coupleToggleLabel.click()
  await expect(coupleToggleInput).not.toBeChecked()
  await expect(householdField).toHaveValue('2')

  await page.getByRole('button', { name: 'Save tenant profile' }).click()
  await expect(page).toHaveURL(/\/discover$/)

  await page.goto('/profile')
  await expect(page.getByLabel('Room applicants')).toHaveValue('2')
  await expect(page.getByLabel('Applying as a couple')).not.toBeChecked()
})

test('3 applicants + Couple Yes stays 3, never clamped down to 2', async ({ page }) => {
  await seedState(page, { identity: 'tenantHousehold3Room' })
  await page.goto('/profile')

  await page.getByText('Applying as a couple', { exact: true }).click()
  await expect(page.getByLabel('Applying as a couple')).toBeChecked()
  await expect(page.getByLabel('Room applicants')).toHaveValue('3')
})

test('numeric fields can be cleared and retyped without snapping back to a fabricated default', async ({ page }) => {
  await seedState(page, { identity: 'tenantHousehold4Any' })
  await page.goto('/profile')

  const householdField = page.getByLabel('Household size')
  await householdField.fill('')
  // Must stay genuinely blank while editing — not silently snap back to "1".
  await expect(householdField).toHaveValue('')
  await householdField.fill('5')
  await expect(householdField).toHaveValue('5')

  const budgetMin = page.getByLabel('Budget min (€)')
  await budgetMin.fill('0')
  await expect(budgetMin).toHaveValue('0')
  await page.getByRole('button', { name: 'Save tenant profile' }).click()
  await expect(page).toHaveURL(/\/discover$/)

  await page.goto('/profile')
  await expect(page.getByLabel('Household size')).toHaveValue('5')
  await expect(page.getByLabel('Budget min (€)')).toHaveValue('0')
})

test('a literal saved €0 minimum budget displays as "0" on load, not a blank field', async ({ page }) => {
  await seedState(page, { identity: 'tenantBudgetMinZero' })
  await page.goto('/profile')
  // A real, saved value of 0 must render as "0" — the old `value={form.budgetMin || ''}` display
  // logic treated a real €0 the same as "not set" and silently hid it after reload.
  await expect(page.getByLabel('Budget min (€)')).toHaveValue('0')
})
