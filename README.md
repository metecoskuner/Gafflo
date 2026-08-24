# Gafflo

Gafflo is a mobile-first rental marketplace for tenants and landlords in Ireland: tenant rental
profiles, Smart Match recommendations, listing creation and review, applications, messaging,
viewings and a moderator workspace — all backed by a real Supabase project, not mock data.

## Architecture

- **Frontend** — React 19, Vite, Tailwind CSS, React Router.
- **Backend** — [Supabase](https://supabase.com): Postgres, real email/password Auth, Row Level
  Security on every table, SECURITY DEFINER RPCs for guarded writes (applications, viewings,
  moderation, analytics, etc.), and Storage for listing photos.
- Every real read/write goes through the one shared client in `src/lib/supabase.js` and is subject
  to RLS — the frontend has no privileged access path. There is no local fixture/mock data layer;
  all marketplace data is real rows in the connected Supabase project.
- **Dev-bypass mode** (`VITE_DEV_BYPASS_AUTH=true`, local dev only) skips the real sign-in screen
  by faking local React profile state so you can click through the app shell without an account.
  It is **local UI inspection only** — it never touches real Supabase auth, issues no session, and
  cannot bypass RLS. Real reads/writes still run as a genuine unauthenticated request, so most
  backend writes will fail while it's on. See [docs/dev-qa.md](docs/dev-qa.md) for the full
  explanation and how to switch to real-auth testing.

## Product areas

- **Tenant** — onboarding (target city + what you're looking for), a rental profile (budget,
  move-in date, household, preferences, application readiness), Discover with **Smart Match**
  (ranked recommendations with a Rental Fit score and reasons) and **Browse** (the full list),
  saved listings, application tracking, messaging and viewing scheduling.
- **Landlord** — onboarding, property management, a listing creation/edit flow with photo upload
  (JPEG/PNG/WEBP, up to 8 photos per listing, 2 MB max per image), a review pipeline
  (draft → in review → published, or needs changes), applicants, messaging, viewings, and
  per-listing analytics (unique views, saves, applications, enquiries, confirmed viewings —
  aggregate counts only, no viewer identity exposed).
- **Trust & safety** — legal pages (Terms, Privacy, Fair Housing Policy, Acceptable Use, Contact), a
  required Fair Housing Policy acknowledgment before a landlord's first listing can go live,
  tenant-side listing reports, and a moderator workspace (reports queue + pending-listings queue)
  gated by a real `platform_role`/`am_i_moderator()` check. The support address on `/contact` is
  configurable (`VITE_SUPPORT_EMAIL`, unset by default) — see docs/dev-qa.md.

## Preview-only / not live yet

These exist in the UI so the product shape is visible, but are **not real, purchasable features**:

- **Gafflo+** (tenant, €4.99/mo) and **Landlord Plus** (€19.99/mo) — presentation only. No payment
  or subscription backend exists yet; every real entitlement check runs against the free plan.
- **Single Listing Plus, Listing Boost, Extra Listing Slot** — priced but not purchasable; Boost is
  explicitly shown as disabled/"Coming soon" in the UI.
- **Fixed-term stays** — deferred pending legal review; not yet in the app.

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run dev
npm run build
```

See [docs/dev-qa.md](docs/dev-qa.md) for the full environment variable reference, dev-bypass
details, testing (unit + e2e) instructions, and seed data. See
[docs/production-readiness.md](docs/production-readiness.md) for the full closed-beta and
public-launch checklist.

## Testing

```bash
npm run lint
npm run test        # unit tests (Vitest)
npm run test:e2e     # end-to-end (Playwright) — needs real Supabase credentials, see docs/dev-qa.md
```

Lint, unit tests and build run automatically on every pull request and push to `main`
(`.github/workflows/ci.yml`). e2e is real-auth-heavy (see docs/dev-qa.md) and stays manual for now.
