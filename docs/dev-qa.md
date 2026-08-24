# Development & QA guide

Detail behind the top-level [README.md](../README.md): environment variables, dev-bypass mode,
testing, and seed data — everything needed to run and test Gafflo locally.

For anything about taking Gafflo toward a real beta or public launch — the auth redirect
checklist, prod/dev Supabase separation, moderator bootstrap, support-email rollout, security
headers, GDPR runbook, and the full closed-beta/public-launch gate — see
[docs/production-readiness.md](production-readiness.md), the single source of truth for that.
This file stays focused on local developer workflow.

## Environment variables

Copy `.env.example` to `.env.local` (never commit `.env.local` — `.gitignore` already excludes it).

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Yes | The Supabase project URL. Client-safe, bundled into the frontend. |
| `VITE_SUPABASE_ANON_KEY` | Yes | The publishable anon key — safe to ship, never the `service_role` key. |
| `VITE_SUPPORT_EMAIL` | No (required before public launch) | Public support contact address, shown on `/contact` and the Privacy Policy. Not a secret — see "Support contact" below. |
| `VITE_DEV_BYPASS_AUTH` | No | `true` to enable dev-bypass mode locally (see below). Leave unset for real auth. |
| `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL` | No | Placeholders only — not used yet, no Edge Functions exist. |

Any variable exposed to the browser **must** be prefixed `VITE_` — Vite inlines every `VITE_`
value into the shipped client bundle, so a server-only secret must never carry that prefix.

## Dev-bypass mode

`VITE_DEV_BYPASS_AUTH=true` lets you click through the full app shell (role selection, onboarding,
dashboard, discover, profile, etc.) without completing the real Supabase email/password sign-in on
every reload.

**What it does:**
- Fakes local React profile state (`src/config/devAuthBypass.js`) so `ProfileGate` resolves and the
  app renders past onboarding, using an obviously-fake profile (`dev-bypass@localhost`).
- Mirrors that fake state into `sessionStorage` so a direct URL or reload doesn't bounce you back
  to role selection — tab-scoped, cleared on sign-out or when the tab closes.
- Shows a persistent amber banner ("Dev auth bypass active…") the whole time it's on.

**What it does not do:**
- It never calls any real `supabase.auth` sign-in method, issues no token, stores no credential.
- It cannot bypass Row Level Security. Every real `supabase.from()`/`rpc()` call the app makes
  while it's on is still a genuine, unauthenticated request — still fully governed by real RLS —
  so most backend writes will fail (surfaced as "This needs a real sign-in — local preview can't
  save changes.").
- It only activates when Vite itself is running in dev mode. A `vite build` production bundle
  hardcodes the check to `false` regardless of what a stray `.env` contains, so it can never
  activate in a deployed build.

**Switching to real-auth testing:** unset `VITE_DEV_BYPASS_AUTH` (or set it to anything other than
`true`) in `.env.local` and restart `npm run dev`. You'll get the real sign-in screen and a real
Supabase session, with real RLS-backed reads and writes.

## Testing

```bash
npm run lint   # ESLint
npm run test   # Vitest unit tests
npm run build  # production build
```

### End-to-end (Playwright)

```bash
npm run test:e2e
```

- Needs real Supabase credentials in `.env.local` (`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
  for the `gafflo-dev` project) — `e2e/global-setup.js` creates real, throwaway signups (via the
  public signup endpoint, same anon key the app itself uses — never `service_role`) to seed
  authenticated sessions and a fixed set of named tenant/landlord fixture identities.
- One test file (`e2e/moderator-workspace.spec.js`) needs a real, persistent moderator account;
  run it with `GAFFLO_E2E_MODERATOR_PASSWORD=... npx playwright test e2e/moderator-workspace.spec.js`.
  Every other spec runs fine without this set.
- Because these are real signups against Supabase Auth, running the full suite back-to-back too
  quickly (or in tight CI loops) can hit Supabase's own auth rate limits — if a run fails with
  signup errors, wait a bit and retry rather than assuming the app is broken.
- **Cleanup is opt-in, not automatic.** By default, throwaway identities and their data are left in
  the database after a run — every other part of the suite works fine without cleanup. To actually
  delete them, set `GAFFLO_E2E_CLEANUP_DB_URL` (and `GAFFLO_E2E_CLEANUP_SERVICE_ROLE_KEY` to also
  remove their uploaded Storage objects); `GAFFLO_E2E_CLEANUP_DRY_RUN=true` previews what would be
  deleted without deleting anything. `e2e/global-teardown.js` never throws — a cleanup failure is
  logged and safely skipped, never reported as a test failure.

## Supabase Auth redirect / Site URL, and prod/dev separation

Both moved to [docs/production-readiness.md](production-readiness.md) (the "Authentication" and
"Environment separation" sections) as of Stage AF, alongside the rest of the launch checklist —
kept here before only because no dedicated launch doc existed yet. Short version for local dev:
real sign-in is a magic link (`signInWithEmail()` in `src/context/AuthProvider.jsx`, using
`emailRedirectTo: window.location.origin` — already portable, no code change ever needed there);
what has to be correct is Supabase's own Authentication → URL Configuration allow-list, which is a
dashboard setting this repo cannot confirm or fix.

## Seed / dev data

The `gafflo-dev` Supabase project (used for local development) has a dedicated seed landlord
account and 20 seed listings across Dublin, used to populate Discover/Browse during local UI work
and manual QA. This is fixture data for local/dev use only — it is not committed to this repo as a
script, and no credentials for it are ever included here or in any file under version control.

## Moderator access (Stage AD)

The `/moderator` workspace (`src/pages/ModeratorWorkspace.jsx`) exists and works, but access to it
is deliberately invisible to almost everyone — here's exactly how it's gated and why.

**How someone becomes a moderator:** a moderator signs in through the completely normal auth flow
(the same magic-link screen every tenant/landlord uses — see `src/pages/Auth.jsx`). There is no
separate moderator login, no special URL to request access, and **no self-service way for a user to
grant themselves moderator status.** Whether an account is a moderator is a `profiles.platform_role`
value that only a trusted admin/DB operation can set — out-of-band, directly against the database,
today. There is no admin UI for this yet (see "Production readiness" below).

**How access is enforced:** the frontend never reads `platform_role` directly. `useIsModerator()`
(`src/context/ModeratorProvider.jsx`) calls the real backend RPC `am_i_moderator()`
(`src/services/moderationService.js`), which returns a single boolean and nothing else — no role
name, no other account's data. That boolean gates two things, both purely presentational:
1. The `/moderator` route itself (`src/App.jsx`'s `ModeratorRoute`) — real enforcement is still
   every moderator RPC's own `is_caller_moderator()` check on the backend; the frontend gate is
   about UX (not landing a non-moderator on the workspace), not the actual security boundary.
2. A "Moderator workspace" entry point on the Profile page (`src/pages/Profile.jsx`'s
   `ModeratorLinkSection`) — renders nothing at all for anyone else, including while the check is
   still loading, so it can never flash into view for a non-moderator.

**Current non-moderator behavior at `/moderator` (deliberately left unchanged this stage):** a
signed-in non-moderator (or a signed-out visitor) who opens `/moderator` directly is redirected
away to their normal home route immediately — no in-place "access denied" message is shown at that
URL. This was a deliberate Stage K decision, exercised by `e2e/moderator-workspace.spec.js`'s own
assertions (`not.toHaveURL(/\/moderator$/)` — a non-moderator must never be left sitting on a
blocked/blank `/moderator` screen). Changing that to an in-place "Moderator access is required"
message would fight that existing, tested design and risk leaking that the route exists at all to
someone probing it. Since normal users never see a link to `/moderator` anywhere (it only ever
renders for a confirmed moderator), the realistic audience for this "confusion" is a developer or a
moderator testing their own access — low enough stakes that this stage left the behavior as-is
rather than making a security-adjacent routing change. What *was* improved: the brief loading state
while `am_i_moderator()` resolves used to render nothing (a blank flash); it now shows a small
spinner, matching the loading treatment used elsewhere in the app (`AuthGate`/`ProfileGate`).

**Testing:** a stable, real, persistent moderator account is used by `e2e/moderator-workspace.spec.js`
(signed into via `GAFFLO_E2E_MODERATOR_PASSWORD`, never signed up fresh — see the Testing section
above). Its password is a real secret and is never written down in this repo, in any doc, or in
`.env.local` — only ever supplied as a one-off process env var for the single test run that needs
it.

**Before public launch:** see [docs/production-readiness.md](production-readiness.md)'s
"Moderation / admin operations" section for the severity assessment and the smallest recommended
next step (a narrow, audited grant/revoke RPC pair) — not built in this stage.

## Support contact (Stage AE)

Every place the app says or implies "contact support" now reads from one source of truth:
`getSupportEmail()` in `src/config/support.js`, which returns `VITE_SUPPORT_EMAIL` (trimmed) or
`null` — never a fabricated address.

**This is public config, not a secret.** Like `VITE_SUPABASE_URL`, any `VITE_`-prefixed variable
is inlined into the shipped client bundle and visible to anyone who opens dev tools. Set it as a
plain environment variable wherever the app is deployed (e.g. a Vercel project setting) — it never
belongs in anything treated as sensitive.

**Unset today** (`gafflo-dev`'s `.env.local` has no `VITE_SUPPORT_EMAIL`), so right now:
- `/contact` (linked from Footer, Profile's Legal section, and the sign-in screen) shows a
  professional "being finalized ahead of public launch" message instead of a fake address.
- The Privacy Policy's "Your rights" and "Contact" sections point to `/contact` instead of
  promising an email that doesn't exist — the GDPR rights themselves are stated identically either
  way; only *how to actually invoke them* changes based on whether an address is configured.
- The generic "Contact support if this seems wrong" copy shown when a suspended account can't take
  an action (`src/config/{application,messaging,viewing,engagement}Errors.js`) doesn't name a
  channel either way, so it's already honest — `/contact` is reachable from Footer regardless.

**Once a real address is configured** (`VITE_SUPPORT_EMAIL=...`), all of the above automatically
switch to showing a real `mailto:` link — no further code change needed. Full rollout checklist:
[docs/production-readiness.md](production-readiness.md)'s closed-beta gate, item 3.

## Production readiness

Everything about taking Gafflo toward a real beta or public launch — secrets rotation, Supabase
project separation, auth redirect config, migration reproducibility, the RLS/RPC security audit,
storage, the GDPR data-subject-request runbook, moderator bootstrap, deployment/CSP headers,
CI/E2E strategy, and the full closed-beta vs. public-launch gate — now lives entirely in
[docs/production-readiness.md](production-readiness.md), produced by Stage AF's full-repository
audit. This file no longer duplicates that checklist.
