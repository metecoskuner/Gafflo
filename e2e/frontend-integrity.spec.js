import { expect, test } from '@playwright/test'

test('loads legacy coupleRequirement and persists applyingAsCouple only', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('gafflo.account', JSON.stringify({ role: 'tenant', landlordType: null, completed: true }))
    window.localStorage.setItem(
      'gafflo.tenant-profile',
      JSON.stringify({
        id: 'tenant-local',
        name: 'Legacy Tenant',
        targetCity: 'Dublin',
        preferredAreas: [],
        budgetMin: 1200,
        budgetMax: 2200,
        moveInDate: '',
        leaseLength: '12',
        householdSize: 2,
        lookingFor: 'room',
        coupleRequirement: true,
      }),
    )
  })

  await page.goto('/profile')
  await expect(page.getByLabel('Applying as a couple')).toBeChecked()
  await page.getByRole('button', { name: 'Save tenant profile' }).click()

  const storedProfile = await page.evaluate(() => JSON.parse(window.localStorage.getItem('gafflo.tenant-profile')))
  expect(storedProfile.applyingAsCouple).toBe(true)
  expect(storedProfile).not.toHaveProperty('coupleRequirement')
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

  await page.addInitScript((draft) => {
    window.localStorage.setItem('gafflo.account', JSON.stringify({ role: 'landlord', landlordType: 'private_landlord', completed: true }))
    window.localStorage.setItem('gafflo.properties', JSON.stringify([draft]))
  }, seededDraft)

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
