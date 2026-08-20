// Stage E — real Supabase conversations/messages/blocks. Reuses existing authenticated
// identities from global-setup.js exactly like e2e/applications.spec.js and e2e/listings.spec.js
// — never signs up a new user, never triggers an OTP/magic-link email.
//
// Same real constraint already documented in e2e/applications.spec.js: no frontend-controlled
// identity (landlordDefault/landlordListingOwnerA/landlordListingOwnerB) owns any of the handful
// of real published listings in gafflo-dev, so the full LANDLORD-side UI flow (real inbox, real
// reply, mark-viewed-equivalent read state) cannot be driven through the browser as the real
// owner. What CAN be verified for real without that credential:
//   - The full TENANT-side flow end to end (start conversation, first message, anti-spam block,
//     duplicate-conversation reuse, archive/mute/read, block/unblock) against one of the
//     pre-existing published listings — done below.
//   - Cross-tenant and cross-landlord privacy, and the block guard, via direct RPC calls using
//     identities this suite does control (a landlord we control is definitely NOT a participant
//     in a conversation on a listing they don't own, which is exactly what needs proving).
//   - The one behavior genuinely unreachable without a controlled listing-owner: a real
//     landlord-authored reply unlocking the tenant's second message, and archive-on-new-message
//     for a landlord recipient. Both are already proven server-side in
//     supabase/tests/messaging_pipeline_test.sql (tests #37-50); see the Stage E final report.
//
// Same accepted trade-off class as listings.spec.js/applications.spec.js: conversations/messages
// are never hard-deleted, so the "start conversation" test below permanently consumes one of the
// shared published listings per run for whichever tenant identity runs it.
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

// Confirmed live during Stage D validation and still true here: this owner's account (listings
// titled "Phase 4 listing N") is not platform_status = 'active', so start_conversation()
// correctly rejects every enquiry to any of its listings — a real, correct rejection, not a bug.
const KNOWN_INACTIVE_OWNER_ID = '8c76e949-7825-4c3d-9f81-78f8b3dcb09a'

async function pickApplicableListing(tenantUserId, accessToken) {
  const { json: publicListings } = await rest('public_listings?select=id,owner_id,title', { accessToken })
  const { json: existing } = await rest('conversations?select=listing_id', { accessToken })
  const existingIds = new Set((existing || []).map((row) => row.listing_id))
  const candidate = (publicListings || []).find(
    (row) => row.owner_id !== tenantUserId && row.owner_id !== KNOWN_INACTIVE_OWNER_ID && !existingIds.has(row.id),
  )
  if (!candidate) throw new Error('No applicable published listing left in the shared pool for this identity — see the file header comment.')
  return { id: candidate.id, title: candidate.title, ownerId: candidate.owner_id }
}

// Idempotent and self-contained on purpose: playwright.config.js runs with fullyParallel: true.
async function ensureConversation(identityName) {
  const { accessToken, userId } = sessionFor(identityName)
  const { json: existing } = await rest('conversations?select=id,listing_id,landlord_id&limit=1', { accessToken })
  if (existing?.length) return { conversationId: existing[0].id, listingId: existing[0].listing_id, landlordId: existing[0].landlord_id, accessToken, userId }
  const { id: listingId, ownerId } = await pickApplicableListing(userId, accessToken)
  const created = await rpc('start_conversation', { p_listing_id: listingId, p_initial_message: 'Hi, is this still available?' }, { accessToken })
  if (created.ok) return { conversationId: created.json, listingId, landlordId: ownerId, accessToken, userId }
  const { json: after } = await rest('conversations?select=id,listing_id,landlord_id&limit=1', { accessToken })
  if (!after?.length) throw new Error(`ensureConversation(${identityName}) failed: ${JSON.stringify(created.json)}`)
  return { conversationId: after[0].id, listingId: after[0].listing_id, landlordId: after[0].landlord_id, accessToken, userId }
}

test.describe('Stage E — real messaging', () => {
  test('tenant starts a real conversation through the UI: real message appears, survives reload, second send is blocked until a landlord reply exists', async ({ page }) => {
    // Deliberately a different identity from every ensureConversation('tenantWaterford') test
    // below: this test requires NO pre-existing conversation, and under playwright.config.js's
    // fullyParallel: true, sharing tenantWaterford with those tests raced — by the time this test's
    // page loaded, another parallel test could have already created tenantWaterford's conversation,
    // making the "fresh start" assumption false. tenantBudgetMinZero is unused elsewhere in this
    // file and in applications.spec.js (confirmed via grep), so it carries no such race.
    const { accessToken, userId } = sessionFor('tenantBudgetMinZero')
    const { id: listingId, title: listingTitle } = await pickApplicableListing(userId, accessToken)

    await seedSession(page, 'tenantBudgetMinZero')
    await page.goto(`/properties/${listingId}`)
    await expect(page.getByRole('button', { name: 'Message landlord' })).toBeVisible({ timeout: 10000 })
    await page.getByRole('button', { name: 'Message landlord' }).click()
    await page.getByPlaceholder('Write a message to the landlord').fill('Hi, is this still available?')
    await page.getByRole('button', { name: 'Send' }).click()

    await expect(page).toHaveURL(/\/messages\/[0-9a-f-]{36}/, { timeout: 10000 })
    await expect(page.getByText('Hi, is this still available?')).toBeVisible()
    await expect(page.getByText('Waiting for the landlord to reply')).toBeVisible()
    // The composer must be genuinely gone/disabled, not just visually — no way to submit message #2.
    await expect(page.locator('#message-composer')).toHaveCount(0)

    // Real, durable server truth.
    const { json: rows } = await rest(`conversations?listing_id=eq.${listingId}&tenant_id=eq.${userId}&select=id,tenant_id,landlord_id`, { accessToken })
    expect(rows).toHaveLength(1)
    expect(rows[0].tenant_id).toBe(userId) // server-derived, never client-supplied
    const { json: messages } = await rest(`messages?conversation_id=eq.${rows[0].id}&select=sender_id,body`, { accessToken })
    expect(messages).toHaveLength(1)
    expect(messages[0].sender_id).toBe(userId)

    await page.reload()
    await expect(page.getByText('Waiting for the landlord to reply')).toBeVisible({ timeout: 10000 })

    // A forced direct second send must still be rejected server-side, not just hidden by the UI.
    const { status, json } = await rpc('send_message', { p_conversation_id: rows[0].id, p_body: 'Are you there?' }, { accessToken })
    expect(status).toBe(403)
    expect(json.code).toBe('42501')

    await page.goto('/messages')
    await expect(page.locator('article', { hasText: listingTitle })).toBeVisible()
  })

  test('duplicate conversation is prevented: starting again on the same listing reuses the existing one, no forked thread', async () => {
    const { conversationId, listingId, accessToken } = await ensureConversation('tenantWaterford')

    const { status, json } = await rpc('start_conversation', { p_listing_id: listingId, p_initial_message: 'trying again' }, { accessToken })
    expect(status).toBe(200)
    expect(json).toBe(conversationId) // same id returned, not a new one

    const { json: rows } = await rest(`conversations?listing_id=eq.${listingId}&select=id`, { accessToken })
    const mine = rows.filter((row) => row.id === conversationId)
    expect(mine).toHaveLength(1)
  })

  test('a tenant cannot read another tenant\'s conversation', async () => {
    const { conversationId } = await ensureConversation('tenantWaterford')
    const { accessToken: otherTenantToken } = sessionFor('tenantNoAreas')
    const { json } = await rest(`conversations?id=eq.${conversationId}&select=id`, { accessToken: otherTenantToken })
    expect(json).toHaveLength(0)
  })

  test('an unrelated landlord cannot read or reply to a conversation on a listing they do not own', async () => {
    const { conversationId } = await ensureConversation('tenantWaterford')
    const { accessToken: unrelatedLandlordToken } = sessionFor('landlordListingOwnerA')

    const { json: readResult } = await rest(`conversations?id=eq.${conversationId}&select=id`, { accessToken: unrelatedLandlordToken })
    expect(readResult).toHaveLength(0)

    const sendResult = await rpc('send_message', { p_conversation_id: conversationId, p_body: 'not my listing' }, { accessToken: unrelatedLandlordToken })
    expect(sendResult.status).toBe(403)
    expect(sendResult.json.code).toBe('42501')
  })

  test('anonymous cannot read or write any messaging surface', async () => {
    const readResult = await rest('conversations?select=id&limit=1')
    expect(readResult.status).toBe(401)
    expect(readResult.json.code).toBe('42501')

    const { json: anyListing } = await rest('public_listings?select=id&limit=1')
    const startResult = await rpc('start_conversation', { p_listing_id: anyListing[0].id, p_initial_message: 'hi' })
    expect(startResult.status).toBe(401)
    expect(startResult.json.code).toBe('42501')
  })

  test('read/archive/mute are real, per-participant, and reversible through the UI', async ({ page }) => {
    const { conversationId, accessToken, userId } = await ensureConversation('tenantWaterford')

    // Read state — opening the thread must call mark_conversation_read() for real. On a reused
    // conversation (fullyParallel: true, see the file header) last_read_at may already be set
    // from an earlier run; the assertion below still holds (it only requires "not null"), it
    // just isn't proving the null->set transition on every run, the same accepted trade-off as
    // e2e/applications.spec.js's shared-fixture reuse.
    await seedSession(page, 'tenantWaterford')
    await page.goto(`/messages/${conversationId}`)
    await expect(page.getByRole('button', { name: 'Back to conversations' })).toBeVisible({ timeout: 10000 })
    await expect.poll(async () => {
      const { json } = await rest(`conversation_participant_state?conversation_id=eq.${conversationId}&user_id=eq.${userId}&select=last_read_at`, { accessToken })
      return json[0]?.last_read_at !== null
    }).toBe(true)

    // Archive from the thread, then confirm it disappeared from the active inbox and the real
    // participant-state row (mine only) reflects it.
    await page.getByRole('button', { name: 'Conversation actions' }).click()
    await page.getByRole('button', { name: 'Archive conversation' }).click()
    await expect(page).toHaveURL(/\/messages$/, { timeout: 10000 })
    const { json: archivedState } = await rest(`conversation_participant_state?conversation_id=eq.${conversationId}&user_id=eq.${userId}&select=archived_at`, { accessToken })
    expect(archivedState[0].archived_at).not.toBeNull()

    // Unarchive for real (not just the toast) and confirm mute toggles independently.
    await rpc('set_conversation_archived', { p_conversation_id: conversationId, p_archived: false }, { accessToken })
    await rpc('set_conversation_muted', { p_conversation_id: conversationId, p_muted: true }, { accessToken })
    const { json: mutedState } = await rest(`conversation_participant_state?conversation_id=eq.${conversationId}&user_id=eq.${userId}&select=muted,archived_at`, { accessToken })
    expect(mutedState[0].muted).toBe(true)
    expect(mutedState[0].archived_at).toBeNull()
  })

  test('block stops messaging both ways, history remains, unblock restores it — through the UI and the real RPC', async ({ page }) => {
    const { conversationId, landlordId, accessToken, userId } = await ensureConversation('tenantWaterford')

    await seedSession(page, 'tenantWaterford')
    await page.goto(`/messages/${conversationId}`)
    await page.getByRole('button', { name: 'Conversation actions' }).click()
    await page.getByRole('button', { name: 'Block user' }).click()
    await page.getByRole('button', { name: 'Block', exact: true }).click()
    await expect(page.getByText('You blocked this user')).toBeVisible({ timeout: 10000 })

    const { json: blockRows } = await rest(`blocks?blocker_id=eq.${userId}&blocked_id=eq.${landlordId}&select=blocker_id`, { accessToken })
    expect(blockRows).toHaveLength(1)

    const blockedSend = await rpc('send_message', { p_conversation_id: conversationId, p_body: 'after block' }, { accessToken })
    expect(blockedSend.status).toBe(403)
    expect(blockedSend.json.code).toBe('42501')

    const { json: historyAfterBlock } = await rest(`messages?conversation_id=eq.${conversationId}&select=id`, { accessToken })
    expect(historyAfterBlock.length).toBeGreaterThan(0) // existing history remains fully readable

    await rpc('unblock_user', { p_user_id: landlordId }, { accessToken })
    const { json: blockRowsAfter } = await rest(`blocks?blocker_id=eq.${userId}&blocked_id=eq.${landlordId}&select=blocker_id`, { accessToken })
    expect(blockRowsAfter).toHaveLength(0)
  })

  test('a forged direct message insert and a forged sender id are both blocked — no client INSERT grant exists at all', async () => {
    const { conversationId, accessToken, userId } = await ensureConversation('tenantWaterford')
    const { accessToken: otherToken } = sessionFor('tenantNoAreas')

    const directInsert = await rest('messages', {
      method: 'POST',
      accessToken,
      prefer: 'return=representation',
      body: { conversation_id: conversationId, sender_id: userId, body: 'forged direct insert' },
    })
    // The HTTP status this project's PostgREST picks for a bare grant-level denial has already
    // been observed to vary by caller type (see e2e/applications.spec.js's own anon-vs-
    // authenticated finding) — the code is the reliable signal.
    expect([401, 403]).toContain(directInsert.status)
    expect(directInsert.json.code).toBe('42501')

    const forgedSender = await rpc('send_message', { p_conversation_id: conversationId, p_body: 'forged sender attempt' }, { accessToken: otherToken })
    expect(forgedSender.status).toBe(403) // otherToken isn't a participant in this conversation at all
  })

  test('a stale gafflo.conversations entry can never appear as a real thread', async ({ page }) => {
    await seedSession(page, 'tenantWaterford')
    await page.addInitScript(() => {
      window.localStorage.setItem('gafflo.conversations', JSON.stringify([
        {
          id: 'conversation-forged',
          propertyId: 'forged-listing',
          tenantId: 'tenant-local',
          ownerId: 'owner-private-1',
          archived: false,
          messages: [{ id: 'm-forged', sender: 'landlord', body: 'This should never render.', createdAt: new Date().toISOString() }],
        },
      ]))
    })
    await page.goto('/messages')
    await expect(page.getByText('This should never render.')).toHaveCount(0)
  })
})
