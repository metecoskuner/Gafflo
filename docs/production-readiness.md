# Production readiness

The single source of truth for taking Gafflo from `gafflo-dev` toward a real closed beta and,
later, public launch. Produced by Stage AF's full-repository audit (2026-08-24). Supersedes the
scattered checklist bullets previously spread across `docs/dev-qa.md` — that file now only covers
local developer workflow and links here for anything launch-related.

Every item is tagged with where the work happens:

`[CODE]` repo-local · `[SUPABASE]` dashboard/project config · `[VERCEL]` deployment config ·
`[DNS]` domain configuration · `[EMAIL]` sender/SMTP configuration · `[GITHUB]` repo/CI settings ·
`[LEGAL]` founder/legal decision · `[OPS]` operational process · `[DEFERRED]` not required for
closed beta.

Anything marked **MANUAL/EXTERNAL** was not and could not be verified from this repository — it
requires access to a dashboard, registrar, or provider this environment doesn't have.

---

## Closed beta gate

Required before inviting any real, non-team user — a small, trusted, controlled group.

1. `[SUPABASE]` **MANUAL/EXTERNAL** — Confirm Auth → URL Configuration's Site URL and Redirect
   URL allow-list actually include every origin beta testers will use (local dev origin at
   minimum; the beta's real access URL). `supabase/config.toml`'s `[auth]` block only governs a
   local `supabase start` stack, not necessarily the hosted `gafflo-dev` project — this cannot be
   confirmed from the repo. See "Auth" below for the exact dashboard steps.
2. `[SUPABASE]` **MANUAL/EXTERNAL** — Configure a real SMTP sender for Supabase Auth's magic-link
   emails (see "Email delivery" below). The Supabase default email sender is not appropriate for
   anything beyond a handful of manual test sign-ins — low deliverability, easily lands in spam,
   not something a beta's onboarding should depend on.
3. `[OPS]` Decide on a real support inbox and set `VITE_SUPPORT_EMAIL` in the deployment
   platform's environment variables. `/contact` and the Privacy Policy already show it
   automatically once set (Stage AE) — no code change needed.
4. `[OPS]` Confirm the one existing moderator (or a new one) has real Auth credentials and can
   reach `/moderator` — currently a single trusted-operator process (see "Moderation" below).
   Acceptable for a closed beta with one operator; document who that is.
5. `[VERCEL]` **MANUAL/EXTERNAL** — Confirm the Vercel project's Production environment variables
   are set independently from any local `.env.local`, and are NOT copy-pasted from a `gafflo-dev`
   personal setup without deliberate intent (see "Environment separation" below).
6. `[CODE]` Done — `ErrorBoundary` (Stage AC) and the CI lint/test/build gate (Stage AC/AC1) are
   already in place; verified again in this stage.
7. `[OPS]` Do at least one full real-auth manual QA pass (`VITE_DEV_BYPASS_AUTH` unset) across
   both tenant and landlord journeys before the first real invite. Dev-bypass has never been used
   for this in any prior stage's testing.

## Public launch gate

Required before open, unlimited sign-ups.

8. `[SUPABASE]` A dedicated **production Supabase project**, separate from `gafflo-dev`, with its
   own database, Storage bucket, and Auth users — see "Migration reproducibility" below for how to
   bootstrap it from this repo's migrations.
9. `[EMAIL]` `[DNS]` A real sender domain with SPF, DKIM, and (recommended) DMARC configured — see
   "Email delivery" below for the exact checklist. The Supabase default sender must not be used at
   any real scale (shared reputation, aggressive rate limits, easy spam-folder landing).
10. `[LEGAL]` **MANUAL/EXTERNAL** — Professional Irish-law review of Terms, Privacy, Fair Housing,
    and Acceptable Use before relying on them at public scale. This audit did not rewrite any legal
    text and is not a substitute for that review — see "Legal" below for specifics worth raising.
11. `[LEGAL]` **MANUAL/EXTERNAL** — A registered company name, company number, and postal address
    for the Privacy Policy/Terms, if Irish/EU consumer law requires them for this business
    structure. Not invented here — flagged for founder/legal input.
12. `[CODE]` `[OPS]` A real, tested Data Subject Request procedure — see the runbook below. The
    current state (a real right, fulfilled manually per-request) is honest and legal, but needs a
    rehearsed procedure before public volume makes ad hoc handling risky.
13. `[VERCEL]` Promote `Content-Security-Policy-Report-Only` (shipped this stage) to enforcing
    `Content-Security-Policy` once a real signed-in session against production has been observed
    with zero reported violations — see "Deployment / CSP" below for the exact promotion steps.
14. `[GITHUB]` Add branch protection requiring the CI check to pass before merging to `main`, once
    the team is larger than one person merging their own reviewed work.
15. `[OPS]` Real payment/subscription infrastructure before Gafflo+, Landlord Plus, Boost, or any
    other listing product can actually be sold — explicitly out of scope for this stage and every
    prior one; every entitlement check still runs against the free plan today.
16. `[LEGAL]` Fixed-term/temporary stays remain deferred pending legal review — unchanged.
17. `[DEFERRED]` A dedicated production error-tracking/monitoring service (e.g. Sentry) — not
    added in this stage per its own explicit non-goals. `ErrorBoundary` + CI are the current
    baseline; revisit once a P0 issue or real user-reported incident makes the gap costly.
18. `[DONE-STAGE-AG]` E2E test-fixture architecture rework — see "CI / E2E" below. Smoke tests now
    run with zero Supabase Auth signups, and the full integration setup uses stable fixture
    accounts plus five throwaway signups per run after one-time stable-account provisioning.

---

## Launch-surface inventory

| Area | Real today | Preview-only | Dev-only | Missing / needs external config |
|---|---|---|---|---|
| **Auth** | Real Supabase magic-link (OTP) sign-in, no passwords, session owned entirely by supabase-js | — | Dev-bypass (`VITE_DEV_BYPASS_AUTH`, empirically confirmed impossible in a production build — see below) | Redirect URL allow-list confirmation (MANUAL) |
| **Database** | 14 migrations, RLS on every real table, 74/74 SECURITY DEFINER functions search_path-pinned | — | — | A verified fresh-project bootstrap (Docker/Supabase CLI unavailable in this environment) |
| **Storage** | Private `listing-photos` bucket, RLS on `storage.objects`, signed URLs only, 2 MB/file + MIME type enforced server-side at the bucket level | — | — | Production bucket starts empty by construction (created by the same migration) |
| **Frontend** | React 19/Vite 8 SPA, ErrorBoundary, CI (lint/test/build), zero `npm audit` findings | Gafflo+/Landlord Plus/Boost UI, honestly labeled "Coming soon" | — | Code-splitting (753 KB single chunk — perf, not security) |
| **Deployment** | Vercel, SPA rewrite, this stage adds security headers + CSP (Report-Only) | — | — | Custom production domain, HSTS `preload` submission (deliberate later step) |
| **Email** | `signInWithOtp` sends via whatever Supabase Auth's configured sender is | — | — | Custom sender domain + SPF/DKIM/DMARC (MANUAL/EXTERNAL) |
| **Security** | No `grant execute ... to public/anon` on any function; no `create extension` dependency beyond Postgres core `gen_random_uuid()` | — | — | — |
| **Privacy** | Terms/Privacy/Fair Housing/Acceptable Use/Contact all real, honest, GDPR-appropriate copy | — | — | Solicitor review (LEGAL), company registration details (LEGAL) |
| **Moderation** | Real `am_i_moderator()`/`is_caller_moderator()` gating, every moderator RPC independently enforces its own check server-side | — | — | Admin UI to grant/revoke `platform_role` (currently manual DB operation) |
| **Testing** | 158 Vitest unit tests, 11 pgTAP suites across 14 migrations, 12 Playwright e2e specs (~3,930 lines), CI runs lint+test+build on every PR | Zero-signup smoke Playwright config; integration setup reduced from 21 to 5 setup signups per run after stable-account provisioning | Full integration E2E still needs real Supabase creds and still creates a small number of real Auth users | Add smoke E2E to CI first; run reduced integration subset on schedule/manual trigger, not every push |
| **Observability** | `console.error` on caught render crashes (dev and prod both) | — | — | Real error-tracking/monitoring service (deliberately deferred) |
| **Operations** | This document; `docs/dev-qa.md` for local dev | — | — | Data Subject Request rehearsal, moderator bootstrap procedure |

---

## Authentication

**Actual behavior, verified from source** (not from old stage reports — read directly from
`src/context/AuthProvider.jsx`, `src/components/AuthGate.jsx`, `src/config/devAuthBypass.js`):

- **Sign-in method:** real Supabase magic-link (`supabase.auth.signInWithOtp({ email, options: {
  emailRedirectTo: window.location.origin } })`). **No password is part of normal product auth at
  any point.** Any documentation or comment that ever said "email/password" was stale; none exists
  in the current app copy (confirmed by re-reading `Auth.jsx` fresh this stage — it correctly says
  "Enter your email... No password needed.").
- **Redirect target:** `window.location.origin`, computed at runtime, not hardcoded — works
  unchanged on localhost, any Vite preview port, or a real deployed origin without a code change.
- **Session persistence:** entirely owned by `@supabase/supabase-js`'s own client (its own
  localStorage key, its own refresh scheduling). `AuthProvider` only mirrors
  `getSession()`/`onAuthStateChange()` into React state — it never reads or writes session storage
  directly.
- **Sign-out:** real `supabase.auth.signOut()` in production; a local-only state clear in
  dev-bypass (never calls Supabase).
- **Account creation / onboarding:** `signUp`/`signInWithOtp` creates the `auth.users` row; a
  database trigger (Phase 1A) creates a matching `profiles` row. Role selection and the two-field
  onboarding (target city + looking-for, or landlord display name) happen entirely client-side
  after that, writing to `tenant_profiles`/`landlord_profiles` via guarded RPCs.
- **Dev bypass:** gated on `import.meta.env.DEV && VITE_DEV_BYPASS_AUTH === 'true'`. **Empirically
  re-confirmed this stage, not just read from source:** a real `npm run build` output, served and
  loaded in a browser with `VITE_DEV_BYPASS_AUTH=true` still present in the env, rendered the real
  sign-in screen — not the dev-bypass role-selection flow. `import.meta.env.DEV` is hardcoded
  `false` by Vite for every production build regardless of what any `.env` file contains, so this
  cannot leak into a deployed build by accident.
- **Error detail:** `Auth.jsx`'s `humanizeAuthError()` maps known Supabase error patterns (rate
  limit, cooldown, invalid email) to plain user copy and falls through to one generic message for
  anything else — no raw Supabase/Postgres error text ever reaches the sign-in screen.

**Required manual check — MANUAL/EXTERNAL, cannot be verified from the repo:**

Open **Supabase Dashboard → Authentication → URL Configuration** for `gafflo-dev` (and, later, the
real production project) and confirm:
- **Site URL** is set to the app's actual primary origin for that project.
- **Redirect URLs** includes every real origin testers/users will open the magic link from.
- Repeat this check whenever the production domain changes (first custom domain, moving off the
  default Vercel domain, adding a staging domain).

`supabase/config.toml`'s `[auth]` `site_url`/`additional_redirect_urls` values (`127.0.0.1:3000`)
only apply to a local `supabase start` stack, which this project's workflow doesn't use — do not
treat that file as proof the hosted project's redirect allow-list is correct.

---

## Email delivery

Auth email delivery is a real production dependency — magic-link sign-in doesn't work if the email
never arrives or lands in spam. No real test emails were sent during this audit.

**Exact production checklist** (do not invent a provider — these are choices, not a decision made
here):

- `[EMAIL]` A custom sender domain (e.g. `mail.gafflo.ie`), not Supabase's shared default sender.
- `[DNS]` SPF record authorizing the chosen provider to send on that domain's behalf.
- `[DNS]` DKIM signing configured and verified for the sending domain.
- `[DNS]` DMARC record recommended (start with `p=none` for monitoring, tighten later) — reduces
  spoofing risk and improves deliverability signal.
- `[SUPABASE]` Custom SMTP configured in Auth settings (`supabase/config.toml` has a commented
  `[auth.email.smtp]` block as a local-only template; the hosted project's real SMTP config is set
  via the Dashboard, not this file). Common choices: Resend, Postmark, AWS SES — pick one, none is
  configured today.
- `[EMAIL]` A clear **From name** and **From address** (e.g. "Gafflo <noreply@mail.gafflo.ie>").
- `[OPS]` A monitored **reply-to/support** address — this is exactly `VITE_SUPPORT_EMAIL` /
  `/contact`, already wired (Stage AE); just needs a real value.
- `[SUPABASE]` Review the magic-link email template for clear copy and correct branding.
- `[SUPABASE]` Confirm OTP/link **expiration** behavior is reasonable (Supabase default: 1 hour) —
  matches `Auth.jsx`'s own copy ("can take a minute or two to arrive").
- `[OPS]` A plan for **bounce handling** — at minimum, know where bounce/complaint webhooks from
  the chosen provider go, even if just a monitored inbox at first.
- `[SUPABASE]` Set a **reasonable Auth rate-limit** for the real project (local config defaults:
  `email_sent = 2`/hour, `sign_in_sign_ups = 30`/5min/IP — these are local-CLI defaults; the hosted
  project's real limits are set in the Dashboard and were not verified from the repo).

---

## Environment separation (dev vs. production)

`gafflo-dev` must remain development-only. What the repo already gets right, verified this stage:

- Exactly 4 real `import.meta.env` reads in the entire `src/` tree
  (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_DEV_BYPASS_AUTH`, `VITE_SUPPORT_EMAIL`) —
  **zero sensitive values are ever expected through a `VITE_` variable.**
- `.env.example` documents every real variable accurately, with no misleading names, and marks
  server-only placeholders (`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`) as commented-out and
  explicitly "not used yet."
- `.gitignore` excludes every env file except `.env.example`; confirmed clean this stage (see
  "Secret hygiene" below).

**What's still a manual/operational risk, not a code one:** nothing in this repo prevents someone
from pasting `gafflo-dev`'s URL/key into Vercel's *Production* environment variables by mistake —
that's an operational step, not something a client-side SPA can self-enforce (there's no server
runtime here to validate against). No code-level environment-identity guard was added this stage:
the only mechanisms considered (a hardcoded dev-project-ref comparison, or a console warning shown
to real users on every load) were rejected as fragile or unprofessional for a production SPA,
respectively — a fragile guard is worse than no guard once someone edits it or it silently drifts.
**The robust guard here is operational:** keep Vercel's Preview and Production environment variable
groups distinct and named clearly, and make "confirm the Production env vars point at the
production Supabase project" an explicit step in the deploy checklist (item 5 above).

---

## Migration reproducibility

**Verdict: cannot be empirically proven in this environment — Docker and the Supabase CLI are both
unavailable here** (`which docker` / `which supabase` both fail; `npx supabase --version` works,
confirming the CLI itself is obtainable via `npx`, but `supabase start` needs Docker to run the
local Postgres/Auth/Storage stack, which this sandbox does not have). This audit did not fake a
bootstrap result.

**What was verified instead — a full static read of all 14 migrations, chronologically, looking
specifically for the failure modes that would break a fresh-project bootstrap:**

- **No `CREATE EXTENSION` dependency at all.** UUIDs use `gen_random_uuid()`, built into Postgres
  core since v13 — every Supabase project runs Postgres 13+, so this needs nothing pre-installed.
- **Storage bucket is created by migration, not by hand.** `insert into storage.buckets (...) on
  conflict (id) do nothing` (migration `20260818003359`) — idempotent, reproducible, no manual
  Dashboard step required for the bucket to exist.
- **No migration assumes a pre-existing seed user or manually-created object.** The one
  `auth.users` dependency is the standard Supabase-managed trigger pattern (a trigger on
  `auth.users` creates a `profiles` row on signup) — this exists on every fresh Supabase project by
  construction, not something these migrations have to create themselves.
- **A real, historical `CREATE OR REPLACE` regression was found and is already fixed.** Migration
  `20260821130000_legal_trust_safety.sql` re-defined `request_listing_review()` on top of an
  *older* version of the function than the one actually live at the time (added by
  `20260818201747_enforce_platform_status.sql`), silently dropping an `is_caller_active()`
  suspended-account check in the process. The most recent migration,
  `20260822120000_restore_active_check_on_review.sql`, restores it — its own comment documents
  the exact mistake. **The final cumulative state (all 14 migrations applied in order) is
  correct**, and `supabase/tests/platform_status_enforcement_test.sql` specifically exercises this
  exact function under a suspended account, so a future regression of the same kind would be
  caught by the existing pgTAP suite. This is real, concrete evidence that `CREATE OR REPLACE`
  across sequential migrations is a genuine risk *in this repository's history* — worth a
  deliberate migration-review habit going forward (diff a function's live definition before
  `CREATE OR REPLACE`-ing it), not a reason to distrust the current final state.

**Recommended canonical migration mechanism:** the Supabase CLI (`supabase db push` /
`supabase migration up` against a linked project), pinned via `npx supabase@<version>` rather than
relying on a machine having it globally installed — this is both the officially supported path and
avoids the "applied by hand with psql because the CLI wasn't installed" pattern this project has
used historically, which leaves no automatic record of exactly what ran. A CI-driven migration
step (apply on merge to `main`, against a real linked project) is the natural next step once a real
production project exists, but is out of scope to build in this stage since it needs a real project
to target and a service-role-equivalent CI secret this stage was explicitly told not to create.

**Exact future verification command**, once Docker + the Supabase CLI are available:

```bash
npx supabase init          # if not already a supabase-linked repo locally
npx supabase start         # spins up a fully local, empty Postgres/Auth/Storage stack
npx supabase db reset      # applies every migration in supabase/migrations/ in order, from empty
npx supabase test db       # runs every *_test.sql pgTAP suite against the freshly-bootstrapped DB
```

A clean run of all four commands, with every pgTAP suite passing, is the actual proof this audit
could not produce here.

---

## Database / RLS / RPC security

**Verdict: no privilege escalation or privacy leak found. No schema change made this stage** — the
static review found the existing design already correct and did not need one.

Evidence, gathered by reading the migrations directly rather than trusting prior stage reports:

- **Every `SECURITY DEFINER` function has its `search_path` pinned — 74 for 74, verified per-file,
  not just in aggregate.** No search-path-hijacking exposure exists anywhere in the schema.
- **Zero `grant execute ... to public` and zero `grant execute ... to anon`** on any function in
  any migration — every real RPC requires at least `authenticated`.
- **Every moderator RPC independently re-checks `is_caller_moderator()` (or `am_i_moderator()`'s
  own `auth.uid()` + role check) inside its own function body**, in addition to an
  `authenticated`-only grant — confirmed directly in `20260821150000_moderator_workspace.sql`.
  Frontend hiding of the `/moderator` route and its Profile entry point is genuinely UX-only; the
  real enforcement does not depend on it at all.
- **Smart Match `Interested` decisions and saved listings have no landlord-visible RLS policy at
  all** on `smart_match_decisions`/`saved_listings`/`smart_match_daily_usage` — confirmed via the
  migration's own header comment: *"No landlord-visible policy exists on any of these three tables
  at all... Saved/Smart Match has no landlord side by product design."*
- **Listing views are aggregate-only, by grant, not just by RLS.** `revoke select, insert, update,
  delete on public.listing_views from anon, authenticated` — even a hypothetical RLS bug couldn't
  expose viewer identity, because there is no grant to select from the table as a client role at
  all. A landlord only ever sees a count through a `SECURITY DEFINER` RPC. The migration's own
  comment states directly: *"Smart Match Interested remains private and is not part of landlord
  analytics, directly or indirectly."*
- **Moderators have zero RLS-granted read access to conversations, messages, or
  conversation_participant_state** — no policy of any kind exists for them on any of the four
  messaging tables. A moderator's only path to anything message-related is the separate,
  report-specific surface (`listing_reports`, which also excludes `reporter_id` from what the
  frontend adapter ever surfaces — confirmed in `src/config/moderationAdapter.js`).
- **`listing_reports` has zero client grant of any kind, including SELECT**, and the table comment
  states outright: *"a landlord has no way to see a report, or that one exists, through any
  client-reachable surface, directly or indirectly (no notification is ever created either)."*
  `report_listing()` has no plan/entitlement gate — only a self-report check and a ban check —
  confirming reporting stays free.
- **Viewing state changes only ever happen through `SECURITY DEFINER` RPCs** (e.g.
  `propose_viewing()`) — zero client insert/update/delete policy exists on `viewing_proposals` or
  `viewing_slots`; every value the client could try to forge (landlord/tenant id, status,
  timestamps) is derived server-side.
- **The tenant's second unsolicited message is gated at the RPC level, not just the frontend.** The
  messaging migration's own header comment explicitly overrides the old frontend mock's looser
  rule: *"only a real landlord-authored message unlocks further tenant messages here — status
  changes never do."* This is stricter than, and the actual authority over, anything in
  `src/utils/messagingRules.js`.
- **Exact private address is not automatically exposed.** `listings`' base-table column grants for
  `authenticated`/`anon` are a safe allowlist that excludes `exact_address`, `eircode`,
  `rejection_reason`, `removed_reason`, and internal moderation timestamps — full-detail reads
  (an owner's own address, a moderator's review view) only happen through `SECURITY DEFINER`
  functions that aren't limited by that grant.

No P0/P1 database finding — nothing in this section required a migration.

---

## Storage

- **Bucket:** `listing-photos`, private (`public: false`), created idempotently by migration.
- **Server-enforced, not just client-side:** the bucket's own `file_size_limit` (2,097,152 bytes =
  2 MB) and `allowed_mime_types` (`image/jpeg`, `image/png`, `image/webp`) are configured at the
  Supabase Storage level — matches the client-side validation in
  `src/config/photoMetadata.js`/`CreateListing.jsx` exactly, but isn't *only* enforced there.
- **Read/write/delete are all governed by RLS on `storage.objects`**, keyed off the
  `{listing_id}/{image_id}.{ext}` path convention parsed back to the real `listings` table's own
  `status`/`owner_id` — the same access-control model as every other table, not a separate system:
  published listings' photos are readable by `anon`/`authenticated`; an owner can read/write/delete
  their own listing's photos regardless of status; a moderator can read any listing's photos.
- **URLs are signed, not public/permanent** — `listingsService.js` uses
  `supabase.storage.from(BUCKET).createSignedUrls(...)`, matching the private bucket. There is no
  code path that constructs a permanent public Storage URL.
- **Orphaned uploads:** `listingsService.js`'s own upload path removes the just-uploaded Storage
  object if the follow-up `register_listing_image()` RPC call fails, rather than leaving an
  unregistered file behind — a deliberate cleanup-on-failure pattern, not something this stage
  needed to add.
- **Future production bucket:** created automatically by the same migration the moment it's applied
  to a fresh project — no manual Dashboard bucket-creation step is required, and it starts
  genuinely empty (no dev images to carry over, and none should be).

No redesign needed — no launch-blocking defect found.

---

## Privacy / GDPR operational truthfulness

The Privacy Policy tells users they can request access, correction, deletion, or a copy of their
data, and that this is currently a manual (not self-service) process. **This audit did not rewrite
that copy** — it checked whether the product can actually fulfill it.

### Data Subject Request runbook

**A. Can a user currently be fully deleted safely with one operation?** No — a naive `DELETE FROM
auth.users` or `DELETE FROM profiles` fails outright for any account with real activity, because of
the FK constraints below. Only a genuinely untouched, brand-new account (zero rows anywhere else)
could cascade-delete cleanly today.

**B. Exact FK constraints that block naive deletion** (every `references public.profiles (...)`
across all 14 migrations, checked for its `ON DELETE` clause):

| Referencing column | Table | `ON DELETE` behavior |
|---|---|---|
| `tenant_profiles.profile_id`, `landlord_profiles.profile_id` | Phase 1A | `CASCADE` — deletes cleanly |
| `listings.owner_id` | Listings | none (`NO ACTION`) — **blocks** |
| `moderation_actions.actor_id` | Moderation | none — **blocks** |
| `moderation_actions.target_user_id` | Moderation | `SET NULL` — does not block, preserves audit trail |
| `viewing_proposals.landlord_id`/`tenant_id` | Viewings | none — **blocks** |
| `applications.tenant_id`, `application_status_events.actor_id` | Applications | none — **blocks** |
| `listing_reports.reporter_id`/`reviewed_by` | Reports | none — **blocks** |
| `conversations.tenant_id`/`landlord_id`, `conversation_participant_state.user_id`, `messages.sender_id`, `blocks.blocker_id`/`blocked_id` | Messaging | none — **blocks** |
| `listing_views.viewer_id` | Analytics | none — **blocks** |
| `saved_listings.tenant_id`, `smart_match_decisions.tenant_id`, `smart_match_daily_usage.tenant_id` | Smart Match | none — **blocks** |
| `notifications.user_id` | Notifications | none — **blocks** |

`profiles.id` itself cascades from `auth.users` — so deleting the `auth.users` row is the right
*eventual* trigger, but only after everything above is handled.

**C. Delete vs. anonymize vs. retain — a recommendation, not a decision made here:**
- **Retain, anonymized:** messages the user sent to another real party, and application/viewing
  history the *other* party still legitimately needs to see (deleting these out from under an
  active conversation partner or landlord would corrupt their own history). Anonymize the deleted
  user's reference (a "Deleted user" display name), don't hard-delete the row.
- **Retain as-is (already anonymous to the counterparty):** `listing_reports` — the reporter's
  identity is already never exposed to anyone but a moderator; the report itself is a legitimate
  trust & safety record.
- **Delete outright:** the user's own `saved_listings`, `smart_match_decisions`,
  `smart_match_daily_usage`, `notifications`, `listing_views` rows — all strictly private to that
  one user already, nothing else references them.
- **Delete outright:** the user's own `listings` and `listing_images`/Storage objects, if a
  landlord — unless a published listing has active applications from other tenants, in which case
  the same anonymize-not-delete logic applies to avoid corrupting an applicant's own history.
- This table is a **recommendation** for whoever builds the real procedure — it is a product/data
  decision, not something this audit unilaterally implemented as a live RPC (an actual "delete
  everything" function is explicitly the kind of risky, casually-shipped capability Stage AF was
  told to avoid).

**D. Manual export today:** no export RPC exists. A trusted operator with `service_role`/DB access
would query each table above filtered by the user's `profiles.id`, compile the results, and send
them to the requester — the same real, honest "manual process" the Privacy Policy already
describes. This is operationally slow but genuinely fulfills the stated right.

**E. Storage objects:** enumerate the user's `listings` → their `listing_images.storage_path`
values → remove those objects via the Storage REST API's own delete endpoint (the same pattern
already proven in `e2e/global-teardown.js`'s existing, working storage-cleanup code — a real
precedent to reuse, not a new mechanism to invent).

**F. Audit trail after a deletion request:** follow `moderation_actions.target_user_id`'s own
`SET NULL` philosophy — keep a record that *a request was fulfilled* (date, request reference)
without retaining the deleted user's actual PII in it, external to the app's live tables (a simple
ops log/ticket, not a new database table, for this stage of the product).

**Verdict: the Privacy Policy's promise is currently fulfillable, honestly, by a careful manual
procedure — not by a one-line delete.** No P0 finding here; the gap is operational rehearsal, not a
broken promise.

---

## Support / legal configuration

Verified fresh this stage (Stage AE built this; this audit re-checked it, not just re-read the
Stage AE report):

- `src/config/support.js`'s `getSupportEmail()` remains the single source of truth, reading
  `VITE_SUPPORT_EMAIL` and returning `null` (never a fabricated address) when unset.
- `/contact` is reachable signed-out (registered in `App.jsx`'s public-static-page map alongside
  the four legal pages, zero provider dependency).
- Privacy Policy's "Your rights" and "Contact" sections both branch correctly on whether an
  address is configured; GDPR rights language itself is identical either way.
- No fabricated support email exists anywhere in the repo (re-confirmed via a fresh grep this
  stage).
- Classify a real support inbox + `VITE_SUPPORT_EMAIL` as a **closed beta gate** requirement (item
  3 above), not merely a launch-day nice-to-have — a beta with no real support channel is exactly
  the promise-vs-reality gap Stage AB originally flagged.

**Legal review:** `[LEGAL]` **MANUAL/EXTERNAL.** This audit is not legal counsel and did not rewrite
any policy text. Worth raising with a solicitor specifically: the Fair Housing Policy's grounds
list (matching Ireland's Equal Status Acts), the GDPR "Your rights" section's manual-fulfillment
framing, and whether the current company-identity gap (no registered name/number/address anywhere
in the Privacy Policy) needs filling before any public launch.

---

## Moderation / admin operations

- **Granted:** manually, out-of-band, via direct DB access — setting `profiles.platform_role` to
  `'moderator'` or `'admin'`. No client write path exists for this at all (no RPC grants any client
  role the ability to write `platform_role`).
- **Revoked:** the same way — manual DB operation. No revocation UI exists.
- **Self-elevation:** not possible — confirmed no RPC or client-writable column touches
  `platform_role`.
- **Independent RPC enforcement:** confirmed yes (see the DB security section above) —
  `am_i_moderator()` and every moderator action RPC re-check server-side regardless of what the
  frontend shows or hides.
- **Audit trail for moderator actions themselves:** `moderation_actions` records `actor_id` (who),
  the action, and a timestamp — a real record exists once an action is taken. What has **no** audit
  trail is the *granting/revoking of the moderator role itself* — that's a raw DB update with no
  logging beyond whatever the operator's own DB client/shell history happens to retain.
- **Personal information exposure in reports:** `listing_reports` never exposes `reporter_id` to a
  landlord (confirmed above); a moderator does see it, which is correct and necessary for handling
  a report responsibly.

**Severity by scale:**
- **Small closed beta, one trusted operator:** low severity. A single person with direct DB access
  granting themselves/one other person moderator status, with no audit trail for that specific
  action, is a reasonable, low-risk process at this scale.
- **Public launch / multiple moderators:** medium severity. No audit trail for who has moderator
  access or when it changed becomes a real operational gap once more than one or two trusted people
  are involved.

**Recommended smallest next stage** (not built here — this audit explicitly avoided building an
admin system): a narrow `grant_moderator(profile_id)` / `revoke_moderator(profile_id)` RPC pair,
callable only by an existing `admin` (not just any `moderator`), that writes to a new lightweight
`platform_role_audit` table logging who changed whose role and when. Small, additive, testable —
not a "giant admin system."

---

## Deployment / Vercel

- **SPA rewrite:** unchanged, `"source": "/(.*)", "destination": "/"` — confirmed this still
  correctly supports direct-URL loads of React Router routes (e.g. reloading `/discover` or
  `/properties/:id` directly), which is exactly what an SPA rewrite exists for.
- **Security headers — added this stage** (`vercel.json`), all applied to every response:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()` — none of
    these are used by the app; explicitly denying them costs nothing.
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains` — safe because Vercel serves
    HTTPS-only by construction; `preload` deliberately *not* included (that's a stronger,
    harder-to-reverse commitment better made by a human with DNS control once a final production
    domain is set).
  - `Content-Security-Policy-Report-Only` (**not enforcing yet** — see below).
- **Content-Security-Policy — shipped in Report-Only mode, not enforcing, on purpose:**
  ```
  default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
  img-src 'self' data: https://images.unsplash.com https://*.supabase.co;
  connect-src 'self' https://*.supabase.co; font-src 'self';
  base-uri 'self'; form-action 'self'; frame-ancestors 'none';
  ```
  Derived from an actual, exhaustive grep of every external origin the app references
  (`images.unsplash.com` — the one hardcoded fallback listing image in `CreateListing.jsx` — and
  the Supabase project's own domain, covered as a wildcard since the specific project subdomain
  differs between `gafflo-dev` and any future production project and shouldn't be hardcoded here).
  `index.html` has zero external `<script>`/`<link>` tags to account for.

  **What was actually verified this stage, live, against a real production build:** a real
  `npm run build` output, served and loaded in a browser with this exact CSP applied as a response
  header, rendered the sign-in screen correctly — styles applied, the app's own logo image loaded,
  React mounted and ran with zero CSP violations reported. The only console message was Chrome
  correctly noting that `frame-ancestors` is ignored when delivered via a `<meta>` tag (used only
  for that specific test method) — irrelevant once delivered as a real HTTP header via `vercel.json`,
  which is how it's actually shipped.

  **What was not verified:** `connect-src`/`img-src` against a real authenticated session's
  Supabase REST calls and signed Storage image URLs in a production (non-dev-bypass) context — that
  would require completing a real magic-link sign-in, which this stage deliberately avoided per its
  own instruction not to create unnecessary Auth traffic. This is exactly why the policy ships in
  **Report-Only** mode: it can never break real functionality, while still logging any real
  violation to the browser console for a human to review.

  **Promotion procedure** (do this before public launch, item 13 above): after deploying, sign in
  for real once, use Discover/Browse (loads a Supabase-signed listing photo) and open a property
  detail. Check the browser console for any `Content-Security-Policy-Report-Only` violation
  message. If none appear, change the header key from `Content-Security-Policy-Report-Only` to
  `Content-Security-Policy` in `vercel.json` and redeploy — the directive values themselves don't
  need to change.
- **Source maps:** not explicitly disabled — `vite build`'s default is no source maps
  (`build.sourcemap` unset = `false`), confirmed by the absence of `.map` files in a `dist/` build
  performed during this audit. Nothing to change.
- **Production build mode:** confirmed `import.meta.env.PROD` is `true`/`DEV` is `false` for any
  `vite build` output, regardless of `.env.local` contents (see "Authentication" above for the
  live-tested proof this makes dev-bypass impossible in production).

---

## CI / E2E

- **Current CI** (`.github/workflows/ci.yml`): `npm ci` → lint → unit tests → build, on every PR
  and push to `main`. Confirmed this is an honest minimum: it catches syntax/type errors, lint
  violations, all 158 Vitest assertions, and a real production build failure — everything that
  doesn't require live Supabase credentials or create real Auth traffic. `npm audit` run this
  stage: **zero vulnerabilities at any severity.**
- **E2E split as of Stage AG:** `npm run test:e2e:smoke` uses `playwright.smoke.config.js`, has no
  Playwright global setup, and runs signed-out public-route/auth-gate checks with **zero** Supabase
  Auth signups. `npm run test:e2e` / `npm run test:e2e:integration` remains the real-Supabase
  integration suite.
- **Integration fixture volume as of Stage AG:** `e2e/global-setup.js` now signs into stable,
  reusable fixture accounts and resets their own profile rows in place via anon-key authenticated
  requests using process-only `GAFFLO_E2E_STABLE_PASSWORD` (not `.env.local`, not committed). The
  old setup performed **21 real Supabase Auth signups per run** (20 named fixture identities + 1
  default session). After one-time stable-account provisioning, the new setup performs **5 real
  setup signups per run** (the four genuinely fresh onboarding accounts plus the
  Fair-Housing/listing-owner account whose acknowledgement state is intentionally one-way). The
  auth spec can still create one additional magic-link user inside its real OTP test when Supabase
  accepts that request.
- **Cleanup:** opt-in only (`GAFFLO_E2E_CLEANUP_DB_URL`/`_SERVICE_ROLE_KEY`), never automatic —
  confirmed this remains a deliberate, safe default (never destructive without an explicit env var)
  rather than a gap; `global-teardown.js` never throws, so a cleanup failure can never be reported
  as a test failure.
- **Persistent moderator identity:** `moderatorStable` is signed into (not signed up) every run,
  gated behind `GAFFLO_E2E_MODERATOR_PASSWORD` — a real, permanent secret never written to any file
  in this repo, confirmed via a fresh grep this stage.

**CI recommendation after Stage AG:** add `npm run test:e2e:smoke` to CI first if live Supabase
credentials are available in the CI environment; it is safe for every PR/push from an Auth-volume
perspective because it creates no accounts. Keep the full integration suite off every-push CI.
Once the stable fixture accounts have been provisioned in `gafflo-dev`, a reduced integration
subset can reasonably run on a schedule or manual workflow with `GAFFLO_E2E_STABLE_PASSWORD` stored
as a CI secret, but not on every push: five real setup signups plus the auth spec's possible OTP
user is a large reduction, not zero.

---

## Runtime resilience / observability

- **React render crashes:** caught by `ErrorBoundary` (Stage AC), wrapping the entire authenticated
  app shell. Shows a calm, on-brand fallback; never renders the error object or stack trace to the
  screen; still `console.error`s for dev visibility. **What it does not cover** (a real limit of
  React error boundaries, not a gap specific to this implementation): errors inside event handlers,
  async code (a rejected promise that isn't awaited into a caught render path), and errors during
  server-side rendering (irrelevant here — this is a pure client SPA).
- **Failed Supabase reads/writes:** consistently normalized through per-domain `describe*Error()`
  helpers (`applicationErrors.js`, `messagingErrors.js`, `viewingErrors.js`, `engagementErrors.js`)
  that map known SQLSTATE/message combinations to plain user copy and fall through to one generic,
  non-technical message for anything unrecognized — no raw Postgres/PostgREST internals ever reach
  the UI through this path.
- **Offline/network errors:** not specially handled beyond the generic fallback above — a real gap,
  but Low severity for a closed beta (a failed fetch surfaces as "something went wrong," not a
  crash or a hang).
- **Expired session:** `AuthProvider`'s `onAuthStateChange` listener updates `session`/`user`
  reactively; an expired session becomes `user: null`, which `AuthGate` correctly routes back to
  the real sign-in screen.
- **Loading states:** `AuthGate`/`ProfileGate` both show a calm branded spinner, not a blank screen,
  while resolving.
- **Route 404s:** the catch-all route (`<Route path="*" element={<Navigate to={homeRoute}
  replace />} />`) redirects to the user's home route rather than showing a dedicated 404 page — a
  deliberate, reasonable choice for a role-gated SPA where an arbitrary unknown path is more likely
  a stale bookmark than something worth a dedicated error page.
- **Direct URL reloads:** confirmed working for both public legal/contact pages and, once
  onboarded, the authenticated app shell (dev-bypass's own sessionStorage persistence handles the
  reload case for local testing; real sessions persist via supabase-js's own storage regardless).
- **Empty states:** consistently present across Applications, Messages, Saved, Applicants,
  Notifications — not re-audited page-by-page this stage since this was already covered by
  Stage Z's dedicated QA sweep.

**What's missing, and the actual decision this creates:** no production error-tracking/monitoring
service is wired up. This audit did **not** add one — every third-party observability SDK is
explicitly out of scope for this stage unless a P0 issue made it unavoidable, and none was found.
The real gap: a crash or a silent failure in production today is only visible if a user reports it.
Adding a service (Sentry or similar) is a real vendor/privacy-policy decision — it means a new
third party processes at least error metadata, which the current Privacy Policy's "we do not share
your data with third parties except... a service provider... processes it on our behalf" language
would need to explicitly cover if one is added. Flag this as the first thing to revisit once beta
traffic makes silent failures costly.

---

## Product truthfulness

Re-confirmed this stage via a fresh repo-wide grep (not carried over from an old report): no
user-facing copy claims "verified," "secure," "instant," "unlimited," identity verification,
background/income checks, or payment/deposit protection anywhere it isn't real. The one "secure"
match in the entire `src/pages/`/`src/components/` tree is the Terms of Service telling the *user*
to keep their *own* account credentials secure — a user obligation, not a product claim. Trust
badges (`getTrustSignals`/`getTrustStatusLabel` in `src/config/rentalJourney.js`) are entirely
data-driven off real profile/listing verification columns and explicitly suppress themselves for
any listing still carrying `internalDemoState` — no fabricated "Verified" label is possible.
Gafflo+/Landlord Plus/Boost remain honestly labeled "Coming soon"/"not available to purchase yet"
everywhere they appear (re-confirmed, not just cited from Stage AB).

No findings, no changes needed.

---

## Secret hygiene

Repository-level scan performed this stage (current tracked files only — historical credential
exposure, if any, is a separate operational question this stage cannot answer and was not asked
to):

- No `service_role`-shaped key, no `sk_live_`/`sk_test_` pattern, no AWS-style access key, no PEM
  private key block, no `postgres://user:pass@host` connection string, no JWT-shaped secret found
  anywhere in tracked files.
- No committed `.env`/`.env.local`/`.env.*` file besides `.env.example`.
- No committed E2E auth fixture (`e2e/.auth/`, `state.json`, `session.json`, `identities.json`) —
  all correctly `.gitignore`d.
- **Every reference to "service_role" in tracked files is a comment or a variable name reading
  from `process.env`** (`e2e/global-teardown.js`, `.env.example`'s commented placeholder) — never
  a literal value.

**Verdict: current repository state is clean.** This does not prove no credential was ever
committed and later removed from history, or exposed some other way — that's a distinct,
separate pre-production action (credential rotation), explicitly out of scope for this stage's
"do not rotate credentials" rule.

---

## What Stage AF deliberately did not do

Per its own explicit non-goals: no Stripe/Gafflo+/Landlord Plus/Boost payment work, no map view,
no listing popularity counts, no fixed-term stays, no roommate matching, no document/ID
verification, no push notifications, no marketing analytics SDK, no third-party observability SDK,
no SEO or landing-page redesign, no unrelated UI polish, no new marketplace features, and no
alteration of any of the core product/privacy invariants listed in its own instructions — every one
of which was independently re-verified against current source this stage (see "Database / RLS /
RPC security" above), not assumed from memory.
