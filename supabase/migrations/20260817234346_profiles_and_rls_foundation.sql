-- Gafflo backend — Phase 1A: profile identity foundation.
--
-- Scope: profiles, tenant_profiles, landlord_profiles only. No listings, applications,
-- messaging, payments or storage — those are later phases.
--
-- Identity model: one auth.users row -> one profiles row (profiles.id = auth.users.id).
-- role (tenant/landlord) and identity are kept strictly separate, matching the frontend's
-- existing role/plan separation: a single profile may hold a tenant_profiles row, a
-- landlord_profiles row, or both. There is no "premium_landlord"/"premium_tenant" concept
-- and no separate tenant/landlord auth identity.

-- =========================================================================================
-- 1. Enumerated types
-- =========================================================================================
-- Suffixed `_t` so generated TypeScript types never collide with a same-named column.

create type public.platform_role_t as enum ('user', 'moderator', 'admin', 'support');
create type public.platform_status_t as enum ('active', 'suspended', 'banned');
create type public.active_role_t as enum ('tenant', 'landlord');

create type public.looking_for_t as enum ('any', 'entire_property', 'room');
create type public.pet_preference_t as enum ('none', 'cat', 'dog', 'other');
create type public.smoking_preference_t as enum ('no', 'outside_only', 'yes');
create type public.furnished_preference_t as enum ('any', 'furnished', 'part_furnished', 'unfurnished');
create type public.employment_status_t as enum ('full_time', 'part_time', 'student', 'remote_worker', 'self_employed');

-- Shared by both tenant_profiles and landlord_profiles.
create type public.contact_method_t as enum ('in_app_message', 'email', 'phone');

-- =========================================================================================
-- 2. profiles — thin application identity, one row per auth.users row
-- =========================================================================================
-- Deliberately does not duplicate auth.users.email/phone: Supabase Auth already is the
-- authoritative source for authentication identity, and there is no current feature that
-- needs a second, independently-editable copy of either value. Duplicating them here would
-- only create a class of "which one is real" drift bugs for no present benefit — add an
-- app-level contact field later only when a real feature actually needs one.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,

  display_name text,
  avatar_url text,

  last_active_role public.active_role_t,

  -- Privileged fields — see the "Privileged field protection" section below. Never settable
  -- by a normal authenticated user, at the column-grant level, independent of RLS.
  platform_role public.platform_role_t not null default 'user',
  platform_status public.platform_status_t not null default 'active',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.profiles is
  'One row per auth.users identity. Role (tenant/landlord) is a UI concept derived from which '
  'of tenant_profiles/landlord_profiles exist for this id, never stored as an identity type here.';
comment on column public.profiles.platform_role is
  'Privileged. Column-level GRANT to authenticated deliberately omits this column — see the '
  'grants below and the prevent_privileged_profile_changes() trigger.';
comment on column public.profiles.platform_status is
  'Privileged. Same protection as platform_role.';

-- =========================================================================================
-- 3. tenant_profiles — 1:1 with profiles, created only once tenant onboarding completes
-- =========================================================================================
-- budget_min, budget_max, move_in_date and household_size stay nullable by design: the
-- frontend's onboarding deliberately only requires target_city + looking_for, and treats an
-- unanswered budget/move-in/household as genuinely unknown, never as an invented 0/1/date.
-- That invariant must hold at the schema level too, not just in the UI layer that happened to
-- enforce it so far — see calculatePropertyMatch.js's isKnownNumber() guard on the frontend
-- for the same rule expressed there.
--
-- target_city and looking_for ARE not-null: onboarding requires both before a tenant_profiles
-- row is ever created in the first place, so there is no "unknown" state to represent for
-- either of them — unlike budget/move-in/household, which onboarding explicitly defers.

create table public.tenant_profiles (
  profile_id uuid primary key references public.profiles (id) on delete cascade,

  target_city text not null,
  preferred_areas text[] not null default '{}',

  budget_min integer,
  budget_max integer,
  move_in_date date,
  household_size integer,

  lease_length_months integer,
  looking_for public.looking_for_t not null default 'any',
  applying_as_couple boolean not null default false,

  pets public.pet_preference_t not null default 'none',
  smoking public.smoking_preference_t not null default 'no',
  furnished_preference public.furnished_preference_t not null default 'any',
  parking_needed boolean not null default false,

  private_bathroom_preferred boolean not null default false,
  bills_included_preferred boolean not null default false,
  owner_occupied_acceptable boolean not null default true,

  employment_status public.employment_status_t,
  student boolean not null default false,
  references_ready boolean not null default false,
  income_ready boolean not null default false,
  id_ready boolean not null default false,

  bio text,
  preferred_contact_method public.contact_method_t not null default 'in_app_message',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint tenant_profiles_budget_min_non_negative check (budget_min is null or budget_min >= 0),
  constraint tenant_profiles_budget_max_non_negative check (budget_max is null or budget_max >= 0),
  constraint tenant_profiles_budget_range_valid check (
    budget_min is null or budget_max is null or budget_max >= budget_min
  ),
  constraint tenant_profiles_household_size_positive check (household_size is null or household_size > 0),
  constraint tenant_profiles_lease_length_positive check (lease_length_months is null or lease_length_months > 0)
);

comment on table public.tenant_profiles is
  'Created only once a tenant completes onboarding (target_city + looking_for). Everything '
  'else the frontend already treats as optional/deferred stays nullable here — never defaulted '
  'to an invented 0/1/date at the schema level.';
comment on column public.tenant_profiles.budget_min is 'Null = not provided yet, never 0.';
comment on column public.tenant_profiles.budget_max is 'Null = not provided yet, never 0.';
comment on column public.tenant_profiles.move_in_date is 'Null = not provided yet, never an invented date.';
comment on column public.tenant_profiles.household_size is 'Null = not provided yet, never defaulted to 1.';

-- =========================================================================================
-- 4. landlord_profiles — 1:1 with profiles, private-landlord focused for this MVP
-- =========================================================================================
-- display_name here is the PUBLIC, listing-facing name shown to tenants (what the frontend's
-- landlordProfile.displayName already is) — deliberately distinct from profiles.display_name,
-- which is the account-level identity name. A landlord may reasonably want those to differ
-- (e.g. not showing a full legal name to strangers who enquire); a tenant has no equivalent
-- need today, so tenant_profiles does not get a matching duplicate field.
--
-- landlord_type is a text + CHECK, not an enum, on purpose: agency/agent support is explicitly
-- out of scope for this phase, and extending a CHECK constraint later is a one-line migration
-- versus an enum-value migration. Do not build agent/organization architecture yet.

create table public.landlord_profiles (
  profile_id uuid primary key references public.profiles (id) on delete cascade,

  display_name text not null,
  landlord_type text not null default 'private_landlord'
    constraint landlord_profiles_landlord_type_known check (landlord_type in ('private_landlord')),

  bio text,
  preferred_contact_method public.contact_method_t not null default 'in_app_message',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.landlord_profiles is
  'Private-landlord only for this phase. landlord_type is a text CHECK, not an enum, so adding '
  'e.g. ''agency'' later does not require an enum migration — but no agent/team architecture '
  'is implemented yet; this only leaves the door open.';

-- =========================================================================================
-- 5. updated_at — server time is the only source of truth, never a client-supplied value
-- =========================================================================================

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Overwrites updated_at with the real server time on every UPDATE, so a client can never '
  'supply its own updated_at and have it trusted.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

create trigger tenant_profiles_set_updated_at
  before update on public.tenant_profiles
  for each row
  execute function public.set_updated_at();

create trigger landlord_profiles_set_updated_at
  before update on public.landlord_profiles
  for each row
  execute function public.set_updated_at();

-- =========================================================================================
-- 6. auth.users -> profiles bootstrap
-- =========================================================================================
-- A trigger on auth.users, not a client-called "bootstrap" RPC after signup: the trigger runs
-- atomically with user creation, so there is no window where someone is authenticated but has
-- no profiles row (the failure mode a client-driven bootstrap call risks if the request never
-- arrives — e.g. the network drops right after signup succeeds). This is the standard,
-- documented Supabase pattern for exactly this reason.
--
-- Kept deliberately minimal: only the bare profiles row is created, with every optional field
-- left at its default (display_name stays null). No tenant_profiles or landlord_profiles row
-- is ever created here — those only come from the app's own onboarding flows, on purpose.
--
-- search_path is pinned to prevent search-path hijacking of this SECURITY DEFINER function —
-- the classic Postgres footgun where an object created earlier in an unpinned search_path
-- could shadow a table/function this trigger relies on and run with its elevated privilege.

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

comment on function public.handle_new_user() is
  'SECURITY DEFINER with a pinned search_path — creates exactly one bare profiles row per new '
  'auth.users row. Never creates tenant_profiles/landlord_profiles rows.';

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- =========================================================================================
-- 7. Row Level Security
-- =========================================================================================

alter table public.profiles enable row level security;
alter table public.tenant_profiles enable row level security;
alter table public.landlord_profiles enable row level security;

-- ---- profiles ----
-- Deliberately no broad "authenticated can read all profiles" policy. A narrowly-scoped
-- public profile view (e.g. a landlord's public display name on a listing) can be added later
-- as its own explicit, minimal policy or view once that surface actually exists — not now.

create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- No INSERT policy for `authenticated`: the only way a profiles row is ever created is the
-- handle_new_user() trigger above, running in a privileged context. A user who somehow had
-- table-level INSERT privilege could otherwise insert a row with platform_role = 'admin'
-- directly — this is closed off entirely by never granting INSERT to `authenticated` at all
-- (see grants below), not merely by omitting a permissive policy.
--
-- No DELETE policy for `authenticated`: account deletion is a future, privileged operation
-- (see the architecture plan's GDPR section), not a self-service delete today.

-- ---- tenant_profiles ----
-- No privileged field the way profiles has (nothing here grants elevated capability), so a
-- plain own-row policy is sufficient for RLS. created_at/updated_at still get column-level
-- grant protection in section 8 below, so a user can never forge either timestamp.

create policy "tenant_profiles_select_own"
  on public.tenant_profiles
  for select
  to authenticated
  using (profile_id = auth.uid());

create policy "tenant_profiles_insert_own"
  on public.tenant_profiles
  for insert
  to authenticated
  with check (profile_id = auth.uid());

create policy "tenant_profiles_update_own"
  on public.tenant_profiles
  for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ---- landlord_profiles ----
-- Same shape as tenant_profiles. The same auth.uid() may own a row here AND in
-- tenant_profiles at the same time — nothing below enforces exclusivity, by design.

create policy "landlord_profiles_select_own"
  on public.landlord_profiles
  for select
  to authenticated
  using (profile_id = auth.uid());

create policy "landlord_profiles_insert_own"
  on public.landlord_profiles
  for insert
  to authenticated
  with check (profile_id = auth.uid());

create policy "landlord_profiles_update_own"
  on public.landlord_profiles
  for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- =========================================================================================
-- 8. Column-level grants — privileged fields AND timestamp integrity
-- =========================================================================================
-- RLS is row-level only; it cannot express "this row, but not these columns." Two distinct
-- problems both need the same tool:
--
--   - profiles.platform_role / platform_status: a user passing the `id = auth.uid()` check on
--     their own row would otherwise be free to set platform_role = 'admin' in the same UPDATE.
--   - every table's created_at / updated_at: a user with a plain table-level INSERT/UPDATE
--     grant could specify these explicitly and backdate or forge them — "do not invent
--     timestamps client-side as the source of truth" applies to created_at just as much as
--     updated_at, not only to the one column that happens to have a trigger.
--
-- Every grant below is an explicit allowlist of exactly the columns `authenticated` may
-- write — not a broad grant with specific columns revoked. A new column added to any of these
-- tables later is safe by default (not writable by a normal user) unless someone deliberately
-- adds it to the relevant allowlist, rather than needing to remember to lock it down.
--
-- For platform_role/platform_status specifically, two independent layers apply:
--
--   (a) PRIMARY — the column-level grant below never includes them. This is enforced by
--       Postgres itself, entirely independent of RLS, and cannot be bypassed by any RLS
--       policy — it is checked before a policy is even evaluated. This is the most robust
--       option available (chosen over relying on RLS/WITH CHECK alone, which cannot see
--       individual columns; and over a restricted RPC, which would be an extra indirection for
--       no extra safety once column grants already do the job).
--
--   (b) DEFENSE IN DEPTH — an explicit BEFORE UPDATE trigger that independently re-checks the
--       same rule and raises a clear error. Its only purpose is to keep failing loudly even if
--       (a) is ever loosened by a future migration mistake (e.g. someone runs a broad
--       `grant update on profiles to authenticated` for an unrelated reason and doesn't notice
--       it silently re-opens this column). service_role is unaffected by either layer — it is
--       never included in the `authenticated` grants below, and Postgres privileges (unlike
--       RLS) are not something service_role's BYPASSRLS attribute affects one way or another.

grant select on public.profiles to authenticated;
grant update (display_name, avatar_url, last_active_role) on public.profiles to authenticated;
-- Deliberately no insert/delete grant, and no update grant on platform_role/platform_status,
-- to `authenticated` at all.

-- tenant_profiles / landlord_profiles have no privileged field the way profiles does — but
-- created_at/updated_at are still excluded from both grants below, column by column, so a
-- user can never forge either one (e.g. backdating a profile) via an explicit INSERT/UPDATE
-- column list. Omitting them from an INSERT simply lets their DEFAULT now() apply normally;
-- updated_at is additionally, redundantly protected by the set_updated_at() trigger above.

grant select on public.tenant_profiles to authenticated;
grant insert (
  profile_id, target_city, preferred_areas, budget_min, budget_max, move_in_date,
  household_size, lease_length_months, looking_for, applying_as_couple, pets, smoking,
  furnished_preference, parking_needed, private_bathroom_preferred, bills_included_preferred,
  owner_occupied_acceptable, employment_status, student, references_ready, income_ready,
  id_ready, bio, preferred_contact_method
) on public.tenant_profiles to authenticated;
grant update (
  target_city, preferred_areas, budget_min, budget_max, move_in_date,
  household_size, lease_length_months, looking_for, applying_as_couple, pets, smoking,
  furnished_preference, parking_needed, private_bathroom_preferred, bills_included_preferred,
  owner_occupied_acceptable, employment_status, student, references_ready, income_ready,
  id_ready, bio, preferred_contact_method
) on public.tenant_profiles to authenticated;

grant select on public.landlord_profiles to authenticated;
grant insert (profile_id, display_name, landlord_type, bio, preferred_contact_method)
  on public.landlord_profiles to authenticated;
grant update (display_name, landlord_type, bio, preferred_contact_method)
  on public.landlord_profiles to authenticated;

-- `anon` gets no grant on any of the three tables — unauthenticated requests cannot read
-- private profile data at all, enforced at the privilege level, not merely returning zero
-- rows via RLS.

create function public.prevent_privileged_profile_changes()
returns trigger
language plpgsql
-- SECURITY INVOKER (the default — no elevated privilege needed to read NEW/OLD and raise an
-- exception). This matters: if this were SECURITY DEFINER, current_user inside the function
-- would resolve to the function's owner, not the actual caller, and the check below would be
-- silently meaningless.
as $$
begin
  if (new.platform_role is distinct from old.platform_role
      or new.platform_status is distinct from old.platform_status)
     and current_user <> 'service_role'
  then
    raise exception
      'platform_role and platform_status can only be changed by a privileged server context (service_role)';
  end if;
  return new;
end;
$$;

comment on function public.prevent_privileged_profile_changes() is
  'Defense in depth only — the primary protection is the column-level grant above. This must '
  'stay SECURITY INVOKER so current_user reflects the real caller, not this function''s owner.';

create trigger profiles_protect_privileged_fields
  before update on public.profiles
  for each row
  execute function public.prevent_privileged_profile_changes();
