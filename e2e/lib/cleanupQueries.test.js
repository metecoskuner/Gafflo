import { describe, expect, it } from 'vitest'
import {
  PROTECTED_EMAILS,
  assertNoProtectedEmails,
  buildCleanupPhases,
  buildResolveEmailsSql,
  buildStoragePathsQuery,
  isValidUuid,
} from './cleanupQueries.js'

const VALID_ID = '11111111-1111-1111-1111-111111111111'
const VALID_ID_2 = '22222222-2222-2222-2222-222222222222'

describe('isValidUuid', () => {
  it('accepts a real UUID', () => {
    expect(isValidUuid(VALID_ID)).toBe(true)
    expect(isValidUuid(VALID_ID.toUpperCase())).toBe(true)
  })

  it('rejects non-UUID input, including SQL-injection-shaped strings', () => {
    expect(isValidUuid('not-a-uuid')).toBe(false)
    expect(isValidUuid("'; drop table auth.users; --")).toBe(false)
    expect(isValidUuid('')).toBe(false)
    expect(isValidUuid(null)).toBe(false)
    expect(isValidUuid(undefined)).toBe(false)
    expect(isValidUuid(123)).toBe(false)
  })
})

describe('buildCleanupPhases', () => {
  it('refuses to build any SQL if given a non-UUID id', () => {
    expect(() => buildCleanupPhases(['not-a-uuid'])).toThrow(/not a UUID/)
    expect(() => buildCleanupPhases([VALID_ID, "'; drop table listings; --"])).toThrow(/not a UUID/)
  })

  it('produces every phase the Stage R2 live cleanup proved necessary, in the proven safe order', () => {
    const phases = buildCleanupPhases([VALID_ID])
    const names = phases.map((p) => p.name)
    expect(names).toEqual([
      'messages',
      'clear_confirmed_slot_id',
      'viewing_slots',
      'viewing_proposals',
      'notifications',
      'listing_views',
      'listing_reports',
      'saved_listings',
      'smart_match_decisions',
      'smart_match_daily_usage',
      'blocks',
      'application_status_events',
      'null_dangling_notification_refs',
      'applications',
      'conversation_participant_state',
      'conversations',
      'moderation_actions',
      'listings',
      'auth_users',
    ])
  })

  it('clears confirmed_slot_id before deleting viewing_slots (breaks the circular FK found live in Stage R2)', () => {
    const names = buildCleanupPhases([VALID_ID]).map((p) => p.name)
    expect(names.indexOf('clear_confirmed_slot_id')).toBeLessThan(names.indexOf('viewing_slots'))
  })

  it('deletes application_status_events before applications, and conversation_participant_state before conversations', () => {
    const names = buildCleanupPhases([VALID_ID]).map((p) => p.name)
    expect(names.indexOf('application_status_events')).toBeLessThan(names.indexOf('applications'))
    expect(names.indexOf('conversation_participant_state')).toBeLessThan(names.indexOf('conversations'))
  })

  it('deletes auth_users last, after listings', () => {
    const names = buildCleanupPhases([VALID_ID]).map((p) => p.name)
    expect(names.at(-1)).toBe('auth_users')
    expect(names.indexOf('listings')).toBeLessThan(names.indexOf('auth_users'))
  })

  it('embeds every provided id into each phase as a real uuid[] literal, not string-concatenated ad hoc', () => {
    const phases = buildCleanupPhases([VALID_ID, VALID_ID_2])
    for (const phase of phases) {
      expect(phase.sql).toContain(`ARRAY['${VALID_ID}','${VALID_ID_2}']::uuid[]`)
    }
  })

  it('every phase is scoped by id — never a bare, unscoped DELETE', () => {
    for (const phase of buildCleanupPhases([VALID_ID])) {
      expect(phase.sql.toLowerCase()).toMatch(/where/)
    }
  })
})

describe('buildResolveEmailsSql', () => {
  it('never matches every row when given an empty list', () => {
    const sql = buildResolveEmailsSql([])
    expect(sql).toMatch(/where false/i)
  })

  it('escapes a single quote in an email rather than breaking out of the string literal', () => {
    const sql = buildResolveEmailsSql(["weird'email@example.com"])
    expect(sql).toContain("weird''email@example.com")
    expect(sql).not.toContain("weird'email@example.com'")
  })

  it('rejects a value containing control characters', () => {
    expect(() => buildResolveEmailsSql(['bad\nemail@example.com'])).toThrow(/unsafe string/)
  })
})

describe('buildStoragePathsQuery', () => {
  it('scopes to the listing-photos bucket and the given throwaway ids', () => {
    const sql = buildStoragePathsQuery([VALID_ID])
    expect(sql).toContain("bucket_id = 'listing-photos'")
    expect(sql).toContain(`ARRAY['${VALID_ID}']::uuid[]`)
  })
})

describe('PROTECTED_EMAILS / assertNoProtectedEmails', () => {
  it('lists exactly the seed landlord and the stable moderator — never a real person\'s email', () => {
    expect(PROTECTED_EMAILS).toEqual(['dev-seed-landlord@gafflo.test', 'gafflo-e2e-stable-moderator@example.com'])
  })

  it('throws if a resolved row is the seed landlord', () => {
    expect(() =>
      assertNoProtectedEmails([{ id: VALID_ID, email: 'dev-seed-landlord@gafflo.test' }]),
    ).toThrow(/ABORT/)
  })

  it('throws if a resolved row is the stable moderator', () => {
    expect(() =>
      assertNoProtectedEmails([{ id: VALID_ID, email: 'gafflo-e2e-stable-moderator@example.com' }]),
    ).toThrow(/ABORT/)
  })

  it('does not throw for ordinary throwaway emails', () => {
    expect(() =>
      assertNoProtectedEmails([{ id: VALID_ID, email: 'gafflo-e2e-tenantDefault-1787347978608@example.com' }]),
    ).not.toThrow()
  })

  it('does not throw for an empty resolved set', () => {
    expect(() => assertNoProtectedEmails([])).not.toThrow()
  })
})
