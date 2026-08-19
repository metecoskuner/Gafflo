import { expect, test } from '@playwright/test'

// This file exercises the real Supabase Auth boundary itself (Stage A). It deliberately runs
// against real gafflo-dev — no mocked network responses, except where noted below — the same
// way every backend phase in this project has been validated. e2e/frontend-integrity.spec.js
// covers the mock marketplace behind the gate; this file covers the gate.

test.describe('signed out', () => {
  // Overrides the config-level authenticated default (see playwright.config.js /
  // e2e/global-setup.js) so this whole describe block genuinely starts with no session.
  test.use({ storageState: { cookies: [], origins: [] } })

  test('a signed-out visitor sees the real auth entry screen, not the marketplace', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /welcome to gafflo/i })).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByRole('button', { name: /choose how you want to use gafflo/i })).toHaveCount(0)
  })

  test('a malformed email is rejected without a network call, and the marketplace stays inaccessible', async ({ page }) => {
    await page.goto('/')
    await page.getByLabel('Email').fill('not-an-email')
    await page.getByRole('button', { name: /send sign-in link/i }).click()
    await expect(page.getByText('Enter a valid email address.')).toBeVisible()
    await expect(page.getByRole('heading', { name: /welcome to gafflo/i })).toBeVisible()
  })

  test('a valid email is genuinely submitted to Supabase, and whatever it says back is reflected correctly', async ({ page }) => {
    await page.goto('/')
    const email = `gafflo-e2e-auth-${Date.now()}@gmail.com`
    const otpResponse = page.waitForResponse((response) => response.url().includes('/auth/v1/otp'))
    await page.getByLabel('Email').fill(email)
    await page.getByRole('button', { name: /send sign-in link/i }).click()
    const response = await otpResponse

    if (response.ok()) {
      await expect(page.getByRole('heading', { name: /check your email/i })).toBeVisible()
      await expect(page.getByText(email)).toBeVisible()
    } else {
      // gafflo-dev's built-in email sender has a low default send-rate limit shared across
      // every real magic-link send this project does (this test, other runs, manual testing —
      // see the Stage A report, which documents hitting this for real: HTTP 429,
      // error_code "over_email_send_rate_limit"). Whichever real outcome Supabase returns, the
      // UI must show a real, human-readable state, never a blank one.
      await expect(page.getByRole('heading', { name: /welcome to gafflo/i })).toBeVisible()
      await expect(page.getByText(/too many attempts|something went wrong/i)).toBeVisible()
    }
  })

  test('a signed-out visitor navigating straight to a marketplace route still lands on the auth screen', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { name: /welcome to gafflo/i })).toBeVisible()
    await expect(page).toHaveURL(/\/dashboard$/)
  })
})

test.describe('signed out (stubbed Supabase response)', () => {
  // The real test above already proves the actual network round trip end to end. These two
  // verify the frontend's own rendering contract for a successful send precisely and
  // repeatably — gafflo-dev's shared email-send quota (see above) is too tight to also assert
  // this exact path on every run without flaking, so only this one network call is stubbed.
  test.use({ storageState: { cookies: [], origins: [] } })

  test.beforeEach(async ({ page }) => {
    await page.route('**/auth/v1/otp*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
    )
  })

  test('a successful send shows the check-your-email state with the submitted address', async ({ page }) => {
    await page.goto('/')
    const email = `gafflo-e2e-auth-stub-${Date.now()}@example.com`
    await page.getByLabel('Email').fill(email)
    await page.getByRole('button', { name: /send sign-in link/i }).click()
    await expect(page.getByRole('heading', { name: /check your email/i })).toBeVisible()
    await expect(page.getByText(email)).toBeVisible()
  })

  test('"Use a different email" returns to a genuinely blank entry form', async ({ page }) => {
    await page.goto('/')
    await page.getByLabel('Email').fill(`gafflo-e2e-auth-stub-${Date.now()}@example.com`)
    await page.getByRole('button', { name: /send sign-in link/i }).click()
    await expect(page.getByRole('heading', { name: /check your email/i })).toBeVisible()

    await page.getByRole('button', { name: /use a different email/i }).click()
    await expect(page.getByRole('heading', { name: /welcome to gafflo/i })).toBeVisible()
    await expect(page.getByLabel('Email')).toHaveValue('')
  })
})

test.describe('signed in', () => {
  // No storageState override: inherits the real, throwaway authenticated session global-setup
  // seeded for this run (playwright.config.js's use.storageState).

  test('a real authenticated session enters the marketplace directly, never the auth screen', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /choose how you want to use gafflo/i })).toBeVisible()
    await expect(page.getByLabel('Email')).toHaveCount(0)
  })

  test('the signed-in account email is real, from the Supabase session, on the profile screen', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /continue as landlord/i }).click()
    await page.goto('/profile')
    await expect(page.getByText(/signed in as .+@.+\..+/i)).toBeVisible()
  })

  test('signing out ends the session for real and returns to the auth entry screen', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /continue as landlord/i }).click()
    await page.goto('/profile')

    await page.getByRole('button', { name: /^sign out$/i }).click()
    await expect(page.getByRole('heading', { name: /welcome to gafflo/i })).toBeVisible()

    // Not just an in-memory reset: reloading must not silently recover the old session, and a
    // marketplace route must fall back to the auth screen, not the mock marketplace.
    await page.reload()
    await expect(page.getByRole('heading', { name: /welcome to gafflo/i })).toBeVisible()
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { name: /welcome to gafflo/i })).toBeVisible()
  })

  test('reloading a signed-in session keeps the user inside the marketplace', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /continue as landlord/i }).click()
    await expect(page).toHaveURL(/\/dashboard$/)

    await page.reload()
    await expect(page.getByRole('heading', { name: /welcome to gafflo/i })).toHaveCount(0)
    await expect(page).toHaveURL(/\/dashboard$/)
  })
})
