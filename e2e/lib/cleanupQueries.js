// Pure SQL-string builders for e2e/global-teardown.js — no DB/network access in this file, so
// every function here is directly unit-testable. The deletion order and exact table set below
// were proven live against gafflo-dev during the Stage R2 one-off historical cleanup, including
// three tables (application_status_events, conversation_participant_state,
// smart_match_daily_usage) that weren't in the original audit and only surfaced as real FK
// errors during execution — see the Stage R2 report. Getting this order wrong doesn't corrupt
// data (every statement is a plain DELETE inside a transaction the caller controls), it just
// aborts with a foreign-key-violation error, which is a safe failure mode, not a silent one.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isValidUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value)
}

// Two identities that must never be deleted by this run-scoped mechanism even if a bug
// somehow got one of them into a resolved id list: the permanent dev seed landlord and the one
// stable, reused-not-recreated e2e moderator. Real personal accounts (e.g. a developer's own
// email used for manual testing) are deliberately not listed here — they can't be, since who
// that is varies by person/environment. Their real protection is structural: global-teardown.js
// only ever resolves ids from emails literally present in the current run's manifest, and a real
// developer's personal account is never written there (it's never created via signUp() by
// global-setup.js or e2e/auth.spec.js). This list is a belt-and-suspenders check on top of that,
// not the primary mechanism.
export const PROTECTED_EMAILS = ['dev-seed-landlord@gafflo.test', 'gafflo-e2e-stable-moderator@example.com']

function assertValidUuids(ids) {
  const bad = ids.find((id) => !isValidUuid(id))
  if (bad !== undefined) throw new Error(`cleanupQueries: refusing to build SQL — not a UUID: ${JSON.stringify(bad)}`)
}

function uuidArrayLiteral(ids) {
  assertValidUuids(ids)
  return `ARRAY[${ids.map((id) => `'${id}'`).join(',')}]::uuid[]`
}

// Single-quote doubling is standard SQL string escaping; rejecting control characters is
// defense in depth for values that, in practice, only ever come from our own deterministic
// `gafflo-e2e-...@...` email generation, never from anything a person typed.
function escapeSqlString(value) {
  // Deliberate: reject every control character (including tab/newline/CR — no legitimate email
  // or id needs one) in a value about to be embedded in a raw SQL literal.
  // eslint-disable-next-line no-control-regex
  if (typeof value !== 'string' || /[\x00-\x1f]/.test(value)) {
    throw new Error(`cleanupQueries: refusing to build SQL — unsafe string: ${JSON.stringify(value)}`)
  }
  return value.replace(/'/g, "''")
}

function textArrayLiteral(values) {
  return `ARRAY[${values.map((v) => `'${escapeSqlString(v)}'`).join(',')}]::text[]`
}

// Resolves this run's manifest emails to real, current auth.users ids. Deliberately re-resolved
// fresh every time rather than trusting any id captured earlier in the run — the email is the
// one thing that's genuinely stable and unique.
export function buildResolveEmailsSql(emails) {
  if (!emails.length) return `select id, email from auth.users where false;`
  return `select id, email from auth.users where email = any(${textArrayLiteral(emails)});`
}

// Throws if any resolved row is one of the two permanently-protected identities. Called after
// buildResolveEmailsSql's results come back, before any deletion SQL is built or run.
export function assertNoProtectedEmails(resolvedRows) {
  const hit = resolvedRows.find((row) => PROTECTED_EMAILS.includes(row.email))
  if (hit) throw new Error(`cleanupQueries: ABORT — a protected account resolved into the cleanup set: ${hit.email}`)
}

// Storage paths for this run's throwaway-owned listings' photos — must be captured before the
// 'listings' deletion phase runs (listing_images cascades away with its parent listing).
export function buildStoragePathsQuery(throwawayIds) {
  const arr = uuidArrayLiteral(throwawayIds)
  return (
    `select o.name from storage.objects o where o.bucket_id = 'listing-photos' ` +
    `and split_part(o.name, '/', 1)::uuid in (select id from public.listings where owner_id = any(${arr}));`
  )
}

// Ordered list of { name, sql } phases. Every statement is scoped exclusively to throwawayIds —
// no LIKE-pattern matching anywhere in this file. Intended to run inside one transaction so a
// mid-sequence failure (e.g. a future schema change reintroducing an unhandled FK) rolls back
// cleanly instead of leaving partial cleanup.
export function buildCleanupPhases(throwawayIds) {
  const ids = uuidArrayLiteral(throwawayIds)
  return [
    {
      name: 'messages',
      sql:
        `delete from public.messages m where m.sender_id = any(${ids}) ` +
        `or m.conversation_id in (select id from public.conversations c where c.tenant_id = any(${ids}) or c.landlord_id = any(${ids}));`,
    },
    {
      name: 'clear_confirmed_slot_id',
      sql: `update public.viewing_proposals vp set confirmed_slot_id = null where vp.landlord_id = any(${ids}) or vp.tenant_id = any(${ids});`,
    },
    {
      name: 'viewing_slots',
      sql: `delete from public.viewing_slots vs where vs.proposal_id in (select id from public.viewing_proposals vp where vp.landlord_id = any(${ids}) or vp.tenant_id = any(${ids}));`,
    },
    {
      name: 'viewing_proposals',
      sql: `delete from public.viewing_proposals vp where vp.landlord_id = any(${ids}) or vp.tenant_id = any(${ids});`,
    },
    { name: 'notifications', sql: `delete from public.notifications n where n.user_id = any(${ids});` },
    { name: 'listing_views', sql: `delete from public.listing_views lv where lv.viewer_id = any(${ids});` },
    {
      name: 'listing_reports',
      sql: `delete from public.listing_reports lr where lr.reporter_id = any(${ids}) or lr.reviewed_by = any(${ids});`,
    },
    { name: 'saved_listings', sql: `delete from public.saved_listings sl where sl.tenant_id = any(${ids});` },
    { name: 'smart_match_decisions', sql: `delete from public.smart_match_decisions smd where smd.tenant_id = any(${ids});` },
    { name: 'smart_match_daily_usage', sql: `delete from public.smart_match_daily_usage smdu where smdu.tenant_id = any(${ids});` },
    { name: 'blocks', sql: `delete from public.blocks b where b.blocker_id = any(${ids}) or b.blocked_id = any(${ids});` },
    {
      name: 'application_status_events',
      sql:
        `delete from public.application_status_events ase where ase.application_id in ` +
        `(select a.id from public.applications a where a.tenant_id = any(${ids}) or a.listing_id in (select id from public.listings l where l.owner_id = any(${ids}))) ` +
        `or ase.actor_id = any(${ids});`,
    },
    {
      name: 'null_dangling_notification_refs',
      sql:
        `update public.notifications n set ` +
        `listing_id = case when n.listing_id in (select id from public.listings where owner_id = any(${ids})) then null else n.listing_id end, ` +
        `application_id = case when n.application_id in (select a.id from public.applications a where a.tenant_id = any(${ids}) or a.listing_id in (select id from public.listings l where l.owner_id = any(${ids}))) then null else n.application_id end, ` +
        `conversation_id = case when n.conversation_id in (select c.id from public.conversations c where c.tenant_id = any(${ids}) or c.landlord_id = any(${ids})) then null else n.conversation_id end ` +
        `where n.listing_id in (select id from public.listings where owner_id = any(${ids})) ` +
        `or n.application_id in (select a.id from public.applications a where a.tenant_id = any(${ids}) or a.listing_id in (select id from public.listings l where l.owner_id = any(${ids}))) ` +
        `or n.conversation_id in (select c.id from public.conversations c where c.tenant_id = any(${ids}) or c.landlord_id = any(${ids}));`,
    },
    {
      name: 'applications',
      sql: `delete from public.applications a where a.tenant_id = any(${ids}) or a.listing_id in (select id from public.listings l where l.owner_id = any(${ids}));`,
    },
    {
      name: 'conversation_participant_state',
      sql:
        `delete from public.conversation_participant_state cps where cps.user_id = any(${ids}) ` +
        `or cps.conversation_id in (select id from public.conversations c where c.tenant_id = any(${ids}) or c.landlord_id = any(${ids}));`,
    },
    { name: 'conversations', sql: `delete from public.conversations c where c.tenant_id = any(${ids}) or c.landlord_id = any(${ids});` },
    { name: 'moderation_actions', sql: `delete from public.moderation_actions ma where ma.actor_id = any(${ids});` },
    { name: 'listings', sql: `delete from public.listings l where l.owner_id = any(${ids});` },
    { name: 'auth_users', sql: `delete from auth.users u where u.id = any(${ids});` },
  ]
}
