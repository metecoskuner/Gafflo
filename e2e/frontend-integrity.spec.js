import { Buffer } from 'node:buffer'
import { expect, test } from '@playwright/test'

const tenantAccount = { role: 'tenant', landlordType: null, completed: true }
const landlordAccount = { role: 'landlord', landlordType: 'private_landlord', completed: true }
const viewport390 = { width: 390, height: 844 }

const tenantProfile = {
  id: 'tenant-local',
  name: 'Local Tenant',
  targetCity: 'Dublin',
  preferredAreas: ['Rathmines'],
  budgetMin: 1200,
  budgetMax: 2400,
  moveInDate: '',
  leaseLength: '12',
  householdSize: 1,
  lookingFor: 'any',
  applyingAsCouple: false,
  pets: 'none',
  smoking: 'no',
  furnishedPreference: 'any',
  parkingNeeded: 'no',
}

async function seedState(page, { account = tenantAccount, profile = tenantProfile, properties, enquiries, conversations, saved, dismissed, tenantPlan, landlordPlan } = {}) {
  await page.addInitScript((state) => {
    window.localStorage.clear()
    if (state.account) window.localStorage.setItem('gafflo.account', JSON.stringify(state.account))
    if (state.profile) window.localStorage.setItem('gafflo.tenant-profile', JSON.stringify(state.profile))
    if (state.properties) window.localStorage.setItem('gafflo.properties', JSON.stringify(state.properties))
    if (state.enquiries) window.localStorage.setItem('gafflo.enquiries', JSON.stringify(state.enquiries))
    if (state.conversations) window.localStorage.setItem('gafflo.conversations', JSON.stringify(state.conversations))
    if (state.saved) window.localStorage.setItem('gafflo.saved-properties', JSON.stringify(state.saved))
    if (state.dismissed) window.localStorage.setItem('gafflo.dismissed-properties', JSON.stringify(state.dismissed))
    if (state.tenantPlan) window.localStorage.setItem('gafflo.tenant-plan', JSON.stringify(state.tenantPlan))
    if (state.landlordPlan) window.localStorage.setItem('gafflo.landlord-plan', JSON.stringify(state.landlordPlan))
  }, { account, profile, properties, enquiries, conversations, saved, dismissed, tenantPlan, landlordPlan })
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

test('fresh tenant onboarding asks only city and looking-for, then routes to discover leaving the rest unknown', async ({ page }) => {
  await seedState(page, { account: null, profile: null })
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue as tenant' }).click()
  await expect(page.getByRole('heading', { name: 'Let’s find your matches' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Smart Match' })).toHaveCount(0)

  // Only two questions on this screen — budget, move-in date and household size are gone.
  await expect(page.getByLabel('Min')).toHaveCount(0)
  await expect(page.getByLabel('Move-in date')).toHaveCount(0)
  await expect(page.getByLabel(/household size|room applicants/i)).toHaveCount(0)

  await page.getByLabel('Target city').selectOption('Dublin')
  await page.getByRole('button', { name: 'A room' }).click()
  await page.getByRole('button', { name: 'See my matches' }).click()

  await expect(page).toHaveURL(/\/discover$/)
  await expect(page.getByRole('heading', { name: 'Smart Match' })).toBeVisible()

  const storedProfile = await page.evaluate(() => JSON.parse(window.localStorage.getItem('gafflo.tenant-profile')))
  expect(storedProfile.targetCity).toBe('Dublin')
  expect(storedProfile.lookingFor).toBe('room')
  // Never fabricated — these stay unknown until the tenant explicitly provides them.
  expect(storedProfile.budgetMin).toBeNull()
  expect(storedProfile.budgetMax).toBeNull()
  expect(storedProfile.moveInDate).toBeNull()
  expect(storedProfile.householdSize).toBeNull()
})

test('onboarding never shows validation errors before a submit attempt, and only blocks on the two required answers', async ({ page }) => {
  await seedState(page, { account: null, profile: null })
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
  await seedState(page, { account: null, profile: null })
  // Paired with each width's typical device height (iPhone SE, 8, 12, 14 Pro Max).
  for (const { width, height } of [{ width: 320, height: 568 }, { width: 375, height: 667 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    await page.setViewportSize({ width, height })
    await page.goto('/')
    await page.getByRole('button', { name: 'Continue as tenant' }).click()
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
  await seedState(page, {
    account: tenantAccount,
    profile: { id: 'tenant-local', targetCity: 'Dublin', lookingFor: 'any', budgetMin: null, budgetMax: null, moveInDate: null, householdSize: null },
  })
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
  await seedState(page, {
    account: tenantAccount,
    profile: { id: 'tenant-local', name: '', targetCity: 'Dublin', lookingFor: 'any', budgetMin: null, budgetMax: null, moveInDate: null, householdSize: null },
  })
  await page.goto('/profile')
  await page.getByLabel('Name').fill('Sam Rivera')
  await page.getByRole('button', { name: 'Save tenant profile' }).click()

  const storedProfile = await page.evaluate(() => JSON.parse(window.localStorage.getItem('gafflo.tenant-profile')))
  expect(storedProfile.name).toBe('Sam Rivera')
  expect(storedProfile.budgetMin).toBeNull()
  expect(storedProfile.budgetMax).toBeNull()
  expect(storedProfile.householdSize).toBeNull()
})

test('tenant dashboard nudges to complete the profile only when core match facts are missing', async ({ page }) => {
  await seedState(page, {
    account: tenantAccount,
    profile: { id: 'tenant-local', targetCity: 'Dublin', lookingFor: 'any', budgetMin: null, budgetMax: null, moveInDate: null, householdSize: null },
  })
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'Make your matches more accurate' })).toBeVisible()

  await seedState(page, {
    account: tenantAccount,
    profile: { id: 'tenant-local', targetCity: 'Dublin', lookingFor: 'any', budgetMin: 1200, budgetMax: 1800, moveInDate: '2030-01-01', householdSize: 1 },
  })
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'Make your matches more accurate' })).toHaveCount(0)
})

test('routes fresh landlord role selection to dashboard', async ({ page }) => {
  await seedState(page, { account: null, profile: null })
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue as landlord' }).click()
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

test('smart match interested records enquiry state and keeps controls usable at mobile width', async ({ page }) => {
  await page.setViewportSize(viewport390)
  await seedState(page, { enquiries: [], conversations: [], dismissed: [] })
  await page.goto('/discover')

  const firstCard = await visibleSmartCardLabel(page)
  const startingEnquiryCount = await page.evaluate(() => JSON.parse(window.localStorage.getItem('gafflo.enquiries') || '[]').length)
  await page.getByRole('button', { name: 'Interested' }).click()
  await expect.poll(async () => {
    const enquiries = await page.evaluate(() => JSON.parse(window.localStorage.getItem('gafflo.enquiries') || '[]'))
    return enquiries.length
  }).toBeGreaterThan(startingEnquiryCount)
  await expect.poll(() => visibleSmartCardLabel(page)).not.toBe(firstCard)
  await expect(page.getByRole('button', { name: 'Pass' })).toBeEnabled()
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
  await page.getByLabel('Location').selectOption('Ranelagh')
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
  await page.getByLabel('Listing category').selectOption('entire_property')
  await expect(page.getByText('Unlock these filters with Gafflo+')).toBeVisible()
  await expect(page.getByLabel('Property type')).toBeDisabled()
})

test('Gafflo+ tenants can use advanced filters', async ({ page }) => {
  await page.setViewportSize(viewport390)
  await seedState(page, { tenantPlan: 'gafflo_plus' })
  await page.goto('/discover')

  await page.getByRole('button', { name: 'Open filters' }).click()
  await page.getByLabel('Listing category').selectOption('entire_property')
  await expect(page.getByText('Unlock these filters with Gafflo+')).toHaveCount(0)
  await expect(page.getByLabel('Property type')).toBeEnabled()
})

test('property details open, scroll, close, and keep 390px geometry stable', async ({ page }) => {
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
  await seedState(page, { profile: { ...tenantProfile, preferredAreas: [] } })
  await page.goto('/profile')

  await page.getByLabel('Suggested areas').selectOption('Rathmines')
  await expect(page.getByRole('button', { name: /Rathmines/ })).toBeVisible()
  await page.getByLabel('Target city').selectOption('Cork')
  await expect(page.getByRole('button', { name: /Rathmines/ })).toHaveCount(0)
})

test('loads legacy coupleRequirement and persists applyingAsCouple only', async ({ page }) => {
  await seedState(page, {
    profile: {
      ...tenantProfile,
      name: 'Legacy Tenant',
      preferredAreas: [],
      householdSize: 2,
      lookingFor: 'room',
      applyingAsCouple: undefined,
      coupleRequirement: true,
    },
  })

  await page.goto('/profile')
  await expect(page.getByLabel('Applying as a couple')).toBeChecked()
  await page.getByRole('button', { name: 'Save tenant profile' }).click()

  const storedProfile = await page.evaluate(() => JSON.parse(window.localStorage.getItem('gafflo.tenant-profile')))
  expect(storedProfile.applyingAsCouple).toBe(true)
  expect(storedProfile).not.toHaveProperty('coupleRequirement')
})

test('tenant profile separates two room applicants from applying as a couple', async ({ page }) => {
  await seedState(page, { profile: { ...tenantProfile, householdSize: 2, lookingFor: 'room', applyingAsCouple: false } })
  await page.goto('/profile')

  await expect(page.getByLabel('Room applicants')).toHaveValue('2')
  await expect(page.getByLabel('Applying as a couple')).not.toBeChecked()
  await page.getByRole('button', { name: 'Save tenant profile' }).click()

  const storedProfile = await page.evaluate(() => JSON.parse(window.localStorage.getItem('gafflo.tenant-profile')))
  expect(storedProfile.householdSize).toBe(2)
  expect(storedProfile.applyingAsCouple).toBe(false)
})

test('create and reopen draft preserves blank numeric field', async ({ page }) => {
  await seedState(page, { account: landlordAccount, properties: [] })
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

  await seedState(page, { account: landlordAccount, properties: [seededDraft] })
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
  await seedState(page, { account: landlordAccount })
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
  await seedState(page, { account: landlordAccount })
  await page.goto('/properties')

  await page.locator('article').filter({ hasText: 'Bright two-bedroom apartment in Rathmines' }).getByRole('button', { name: 'Preview' }).click()
  await expect(page.getByText('Property details').first()).toBeVisible()
  await expect(page.getByText(/Why this .*fits you/)).toHaveCount(0)
  await expect(page.locator('[aria-label^="Match score"]')).toHaveCount(0)
})

test('mobile geometry stays stable on discover, property details, and dashboard', async ({ page }) => {
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
  await seedState(page, { account: landlordAccount, properties: [] })
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
  await seedState(page, { account: landlordAccount, properties: [otherLandlordListing] })
  await page.goto(`/properties/${otherLandlordListing.id}`)
  await expect(page.getByText('Property not available')).toBeVisible()
})

test('tenant can still view a previously saved listing after it becomes inactive, marked as historical', async ({ page }) => {
  const pausedSavedListing = buildTestProperty({ id: 'property-saved-paused', listingStatus: 'paused' })
  await seedState(page, { properties: [pausedSavedListing], saved: [pausedSavedListing.id] })
  await page.goto(`/properties/${pausedSavedListing.id}`)
  await expect(page.getByRole('heading', { name: pausedSavedListing.title })).toBeVisible()
  await expect(page.getByText('Listing no longer active')).toBeVisible()
})

test('editing a published listing cannot silently move it back into review', async ({ page }) => {
  const published = buildTestProperty({ id: 'property-edit-published', listingStatus: 'published' })
  await seedState(page, { account: landlordAccount, properties: [published] })
  await page.goto(`/listings/${published.id}/edit`)

  await page.getByLabel('Title').fill('Quiet two-bedroom flat in Ranelagh — repainted')
  await page.getByRole('button', { name: 'Request review' }).click()
  await expect(page).toHaveURL(/\/properties$/)

  const stored = await page.evaluate(() => JSON.parse(window.localStorage.getItem('gafflo.properties'))[0])
  expect(stored.listingStatus).toBe('published')
  expect(stored.title).toBe('Quiet two-bedroom flat in Ranelagh — repainted')
})

test('availability confirmation timestamp only refreshes when availableFrom actually changes', async ({ page }) => {
  const listing = buildTestProperty({
    id: 'property-availability-edit',
    listingStatus: 'published',
    availableFrom: '2030-01-01',
    availabilityConfirmedAt: '2029-01-01T00:00:00.000Z',
  })
  await seedState(page, { account: landlordAccount, properties: [listing] })

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
  await seedState(page, { account: landlordAccount, properties: [rentlessDraft] })
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
  await seedState(page, { account: landlordAccount, profile: null })
  await page.goto('/profile')

  await expect(page.getByText('Landlord Plus')).toBeVisible()
  await expect(page.getByText('€19.99')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Purchase' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Explore benefits' }).click()
  await expect(page.getByText('Up to 3 active listings')).toBeVisible()
  // Applicant tools, templates, analytics and the boost credit have no UI behind them yet.
  await expect(page.getByText('Advanced applicant filters')).toHaveCount(0)
  await expect(page.getByText('Private applicant notes')).toHaveCount(0)
  await expect(page.getByText('Reusable message templates')).toHaveCount(0)
  await expect(page.getByText('Listing performance analytics')).toHaveCount(0)
  await expect(page.getByText('Listing Boost credit')).toHaveCount(0)
})

test('free landlord cannot resume a listing beyond the active listing allowance', async ({ page }) => {
  await seedState(page, { account: landlordAccount })
  await page.goto('/properties')

  await page.locator('article').filter({ hasText: 'Drumcondra' }).getByRole('button', { name: 'Resume' }).click()
  await expect(page.getByRole('heading', { name: 'You’re at your active listing limit' })).toBeVisible()
  await expect(page.getByText('Landlord Plus')).toBeVisible()

  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()
  await expect(page.locator('article').filter({ hasText: 'Drumcondra' }).getByText('Paused')).toBeVisible()
})

test('a boosted listing is labelled Promoted in Browse but never appears in Smart Match', async ({ page }) => {
  await seedState(page)
  await page.goto('/discover')

  await page.getByRole('button', { name: 'Browse' }).click()
  await expect(page.getByText('Promoted').first()).toBeVisible()

  await page.getByRole('button', { name: 'Smart Match' }).click()
  await expect(page.getByText('Promoted')).toHaveCount(0)
})

test('bottom nav remains visible and does not block a lower primary action', async ({ page }) => {
  await page.setViewportSize(viewport390)
  await seedState(page)
  await page.goto('/dashboard')

  await expect(page.getByRole('navigation')).toBeVisible()
  await page.getByRole('button', { name: 'View top fit' }).scrollIntoViewIfNeeded()
  await page.getByRole('button', { name: 'View top fit' }).click()
  await expect(page.getByText('Property details').first()).toBeVisible()
})

test('landlord dashboard keeps only decision-oriented metrics, not ones owned by Properties or Applicants', async ({ page }) => {
  await seedState(page, { account: landlordAccount })
  await page.goto('/dashboard')

  await expect(page.getByText('New interested tenants', { exact: true })).toBeVisible()
  await expect(page.getByText('Unread messages')).toBeVisible()
  await expect(page.getByText('Upcoming viewings').first()).toBeVisible()
  // These now live only on Properties (status tabs) and Applicants (pipeline tabs).
  await expect(page.getByText('Active properties')).toHaveCount(0)
  await expect(page.getByText('Shortlisted tenants')).toHaveCount(0)
})

test('smart match card caps secondary status pills at two high-value signals', async ({ page }) => {
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
    profile: { ...tenantProfile, targetCity: 'Waterford', preferredAreas: [], budgetMin: 1400, budgetMax: 1600, moveInDate: '2030-01-01' },
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
