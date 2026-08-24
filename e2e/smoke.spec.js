import { expect, test } from '@playwright/test'

test.describe('zero-signup smoke', () => {
  test('public legal and contact pages are reachable signed out', async ({ page }) => {
    await page.goto('/terms')
    await expect(page.getByRole('heading', { name: 'Terms of Service' })).toBeVisible()

    await page.goto('/privacy')
    await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible()

    await page.goto('/fair-housing')
    await expect(page.getByRole('heading', { name: 'Fair Housing Policy' })).toBeVisible()

    await page.goto('/acceptable-use')
    await expect(page.getByRole('heading', { name: 'Acceptable Use / Listing Rules' })).toBeVisible()

    await page.goto('/contact')
    await expect(page.getByRole('heading', { name: 'Contact Gafflo' })).toBeVisible()
  })

  test('protected app routes still land on the auth screen signed out', async ({ page }) => {
    for (const path of ['/dashboard', '/discover', '/profile', '/messages']) {
      await page.goto(path)
      await expect(page.getByRole('heading', { name: /welcome to gafflo/i })).toBeVisible()
      await expect(page.getByLabel('Email')).toBeVisible()
    }
  })
})
