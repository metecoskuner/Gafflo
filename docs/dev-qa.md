# Development & QA guide

Detail behind the top-level [README.md](../README.md): environment variables, dev-bypass mode,
testing, seed data, and what's still pending before production.

## Environment variables

Copy `.env.example` to `.env.local` (never commit `.env.local` — `.gitignore` already excludes it).

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Yes | The Supabase project URL. Client-safe, bundled into the frontend. |
| `VITE_SUPABASE_ANON_KEY` | Yes | The publishable anon key — safe to ship, never the `service_role` key. |
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

## Seed / dev data

The `gafflo-dev` Supabase project (used for local development) has a dedicated seed landlord
account and 20 seed listings across Dublin, used to populate Discover/Browse during local UI work
and manual QA. This is fixture data for local/dev use only — it is not committed to this repo as a
script, and no credentials for it are ever included here or in any file under version control.

## Production readiness — still pending

This app is real Supabase-backed (not a mock/demo build), but the following still need to happen
before a genuine production launch:

- **Secrets rotation** — every key currently used for local development must be rotated before
  going live; nothing used during development should carry into production as-is.
- **Production Supabase project / environment separation** — `gafflo-dev` is a development
  project; production needs its own project, its own env vars, and no shared state with dev.
- **Real payment/subscription infrastructure** before Gafflo+, Landlord Plus, or any listing
  product (Boost, Single Listing Plus, Extra Listing Slot) can actually be sold.
- **Legal review** before fixed-term stays can ship.
- **Privacy/GDPR** — account deletion, data export, and retention policy still need to be defined
  and implemented.
- **Monitoring / error reporting** — no production error-tracking or uptime monitoring is wired up
  yet.
- **Final real-auth manual QA** — a full manual pass with real Supabase Auth (dev-bypass mode off)
  across both tenant and landlord paths before launch.
