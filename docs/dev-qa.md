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

## Supabase Auth redirect / Site URL checklist (Stage AC)

Real sign-in is a magic link: `signInWithEmail()` (`src/context/AuthProvider.jsx`) calls
`supabase.auth.signInWithOtp()` with `emailRedirectTo: window.location.origin` — that's already
portable (it always points at whatever origin the app is actually running on), so **the code needs
no change here**. What has to be correct is Supabase's own side: it will only honor a redirect to
an origin that's on the project's allow-list.

**Important — `supabase/config.toml` is not necessarily what governs this.** That file (`site_url
= "http://127.0.0.1:3000"`, `additional_redirect_urls = ["https://127.0.0.1:3000"]`) is the config
for a fully local `supabase start` stack. This project's `.env.local` points `VITE_SUPABASE_URL` at
a **hosted** project (`https://abktlxyyfqkizlxfzziv.supabase.co`, i.e. `gafflo-dev`), so local
dev already talks to the hosted project directly — `config.toml`'s `[auth]` block only applies if
someone runs `supabase start` locally, which this workflow doesn't require. Whether it's ever been
pushed to the hosted project (`supabase config push`) is not something this repo can confirm.
Also note the `127.0.0.1:3000` value doesn't match this app's actual dev port anyway — Vite serves
on `5173` (`http://localhost:5173`), not `3000`.

**This cannot be verified or fixed from the repo — it requires a manual dashboard check.** Exact
steps for whoever has access to the `gafflo-dev` (and later, production) Supabase project:

1. Open **Supabase Dashboard → Authentication → URL Configuration** for the project.
2. **Site URL** should be set to the app's primary origin:
   - Local dev: `http://localhost:5173`
   - Production: *(placeholder — set once a real domain exists, e.g. `https://app.gafflo.ie`)*
3. **Redirect URLs** (the allow-list magic-link callbacks are checked against) needs every real
   origin testers/users will actually open the link from — at minimum local dev and the production
   domain above.
4. **Vercel preview-URL caveat:** every PR/branch on Vercel gets its own unique
   `https://gafflo-<hash>-<team>.vercel.app` preview URL. Supabase's redirect allow-list can't
   practically track a new URL per PR, so a magic link sent while testing on a preview deployment
   will not redirect back correctly unless that exact preview URL is added first. Until there's a
   stable staging domain, verify real-auth flows either on local dev or on the production domain
   itself — not on ad-hoc preview URLs.
5. Re-confirm this checklist any time the production domain changes (custom domain setup, moving
   off the default Vercel domain, etc.).

## Production vs. development Supabase separation

`gafflo-dev` (the project `.env.local` points at today) is a **development project — it is not,
and must never silently become, production.** Checklist before any public launch:

- **A separate Supabase project is required for production.** Do not point a production deployment
  at `gafflo-dev`.
- **Separate `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`** — production's values are configured
  as the deployment platform's own env vars (e.g. Vercel project settings), never copied from
  `.env.local` or committed anywhere in this repo.
- **Separate Storage bucket state** — the production `listing-photos` bucket must start empty, not
  inherit any images uploaded during dev/QA/e2e runs against `gafflo-dev`.
- **Seed/test data must not be copied blindly.** The seed landlord and seed listings (see below)
  and every e2e throwaway identity are dev fixtures for local QA — none of it is real inventory or
  real users, and none of it belongs in a production database.
- **`service_role` / `SUPABASE_DB_URL` are server-side or CI-only**, and already treated that way
  in this codebase (`e2e/global-teardown.js`'s optional cleanup is the only place either is read,
  both via plain process env vars, never `.env.local` — see `docs/dev-qa.md`'s own testing section
  above). That discipline must hold for production the same way: neither value is ever bundled into
  the frontend or exposed to a browser.

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
- **Production Supabase project / environment separation** — see the checklist above.
  `gafflo-dev` is a development project and must never become production by default.
- **Auth redirect / Site URL configuration** — see the checklist above. Needs a manual dashboard
  check; cannot be confirmed or fixed from this repo.
- **A real support/contact channel.** `src/pages/PrivacyPolicy.jsx` (the "Your rights" section,
  and the closing "Contact" section) tells users to "email us" / use "our support address from
  within the app" for GDPR access/correction/deletion/export requests — but no support email,
  contact page, or mailto link exists anywhere in the app today (verified: nothing in `src/`
  matches a support address). This is a real promise-vs-reality gap, not yet a fake placeholder —
  a real address/route needs to be decided on and wired in before beta, and until then this page
  is telling users to do something they currently have no way to do.
- **Real payment/subscription infrastructure** before Gafflo+, Landlord Plus, or any listing
  product (Boost, Single Listing Plus, Extra Listing Slot) can actually be sold.
- **Legal review** before fixed-term stays can ship.
- **Privacy/GDPR** — self-service account deletion and data export still need to be built; today
  the Privacy Policy is honest that this is a manual, request-by-request process, not automated.
- **Monitoring / error reporting** — a top-level `ErrorBoundary` (Stage AC) now shows a calm
  fallback instead of a blank screen on a render crash, and CI now runs lint/test/build on every
  PR (Stage AC) — but there is still no production error-tracking/crash-reporting service (e.g.
  Sentry) or uptime monitoring wired up.
- **Final real-auth manual QA** — a full manual pass with real Supabase Auth (dev-bypass mode off)
  across both tenant and landlord paths before launch.
