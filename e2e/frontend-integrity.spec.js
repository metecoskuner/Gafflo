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

async function seedState(page, { account = tenantAccount, profile = tenantProfile, properties, enquiries, conversations, saved, dismissed } = {}) {
  await page.addInitScript((state) => {
    window.localStorage.clear()
    if (state.account) window.localStorage.setItem('gafflo.account', JSON.stringify(state.account))
    if (state.profile) window.localStorage.setItem('gafflo.tenant-profile', JSON.stringify(state.profile))
    if (state.properties) window.localStorage.setItem('gafflo.properties', JSON.stringify(state.properties))
    if (state.enquiries) window.localStorage.setItem('gafflo.enquiries', JSON.stringify(state.enquiries))
    if (state.conversations) window.localStorage.setItem('gafflo.conversations', JSON.stringify(state.conversations))
    if (state.saved) window.localStorage.setItem('gafflo.saved-properties', JSON.stringify(state.saved))
    if (state.dismissed) window.localStorage.setItem('gafflo.dismissed-properties', JSON.stringify(state.dismissed))
  }, { account, profile, properties, enquiries, conversations, saved, dismissed })
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

test('routes fresh tenant role selection to discover', async ({ page }) => {
  await seedState(page, { account: null, profile: null })
  await page.goto('/')
  await page.getByRole('button', { name: 'Continue as tenant' }).click()
  await expect(page).toHaveURL(/\/discover$/)
  await expect(page.getByRole('heading', { name: 'Smart Match' })).toBeVisible()
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

test('bottom nav remains visible and does not block a lower primary action', async ({ page }) => {
  await page.setViewportSize(viewport390)
  await seedState(page)
  await page.goto('/dashboard')

  await expect(page.getByRole('navigation')).toBeVisible()
  await page.getByRole('button', { name: 'View top fit' }).scrollIntoViewIfNeeded()
  await page.getByRole('button', { name: 'View top fit' }).click()
  await expect(page.getByText('Property details').first()).toBeVisible()
})
