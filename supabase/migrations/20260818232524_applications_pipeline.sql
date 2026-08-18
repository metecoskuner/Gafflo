-- Gafflo backend — Phase 2: tenant → landlord application pipeline.
--
-- Scope: applications, application_status_events, and the guarded functions that create and
-- transition them, including a server-side port of the frontend's Rental Fit algorithm frozen
-- at application time. No messaging, viewings, notifications, payments, or admin UI — those
-- are later phases. Additive only: nothing here touches a table, policy, or function defined by
-- the Phase 1A-1D migrations except by adding new grants/policies alongside them.
--
-- Identity model reminder (Phase 1A): a single profiles row may hold a tenant_profiles row, a
-- landlord_profiles row, or both. An account being both tenant and landlord is valid, but a
-- landlord must never be able to apply to their own listing — enforced in create_application().

-- =========================================================================================
-- 1. Enumerated types
-- =========================================================================================

-- viewing_proposed and viewing_confirmed are reserved now because they are canonical lifecycle
-- values, but no function in this migration ever writes them, and applications has zero
-- client-facing INSERT/UPDATE grant (see part 4) — so there is no path, RPC or otherwise, for a
-- client to reach either value. They exist only so the Viewing backend (a later phase) can
-- write them through its own guarded function without an ALTER TYPE against this migration.
create type public.application_status_t as enum (
  'sent',
  'viewed',
  'landlord_interested',
  'shortlisted',
  'viewing_proposed',
  'viewing_confirmed',
  'not_selected',
  'withdrawn',
  'closed'
);

-- =========================================================================================
-- 2. applications
-- =========================================================================================
-- tenant_snapshot is a single jsonb column, not ~20 individual columns: the task framed
-- "frozen tenant snapshot" as one conceptual field, and a table this shape (a handful of
-- identity/status/scoring columns plus one immutable point-in-time snapshot) stays legible in
-- a way that dozens of duplicated tenant_profiles columns would not. rental_fit_breakdown is
-- jsonb for the same reason — reasons/warnings/hard_stops are a variable-length structured
-- result, not a fixed set of columns.
--
-- No ID document, proof-of-income file, or verification document is stored anywhere here —
-- tenant_profiles itself only ever stored boolean readiness flags (references_ready,
-- income_ready, id_ready), never document contents, so the snapshot inherits that same
-- boundary automatically by only ever reading from tenant_profiles.

create table public.applications (
  id uuid primary key default gen_random_uuid(),

  listing_id uuid not null references public.listings (id),
  tenant_id uuid not null references public.profiles (id),

  status public.application_status_t not null default 'sent',

  tenant_snapshot jsonb not null,

  rental_fit_score smallint not null,
  rental_fit_breakdown jsonb not null,
  rental_fit_algorithm_version text not null,

  first_viewed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint applications_one_per_tenant_listing unique (listing_id, tenant_id),
  constraint applications_rental_fit_score_range check (rental_fit_score between 0 and 100)
);

comment on table public.applications is
  'At most one row per (listing_id, tenant_id) ever — the unique constraint is the sole '
  'authoritative duplicate/re-application guard, including under concurrent create_application '
  'calls and including after withdrawal (rows are never deleted, so the constraint keeps '
  'blocking a second application permanently unless a future phase explicitly decides '
  'otherwise). status is never writable directly by a client — see part 4''s grants and part 6''s '
  'guarded functions.';
comment on column public.applications.tenant_snapshot is
  'Frozen at create_application() time from tenant_profiles (+ profiles.display_name). Never '
  'updated afterward, even if the tenant''s live profile changes later — see create_application().';
comment on column public.applications.rental_fit_algorithm_version is
  'Lets a future scoring change be introduced without silently altering the stored fit for '
  'applications created under an earlier version.';

-- =========================================================================================
-- 3. application_status_events — immutable audit history
-- =========================================================================================
-- No source/type column: to_status combined with actor_id (tenant vs. the listing''s owner) is
-- already enough to tell every event apart in this phase''s transition set, so a separate field
-- would only be speculative until a real second phase (e.g. Viewing) actually needs one.

create table public.application_status_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id),
  from_status public.application_status_t,
  to_status public.application_status_t not null,
  actor_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

comment on table public.application_status_events is
  'Immutable — no update/delete grant to any client role, ever, matching moderation_actions. '
  'from_status is null only for the very first (creation) event of an application.';

-- =========================================================================================
-- 4. RLS
-- =========================================================================================
-- No moderator read policy on either table, deliberately: being a moderator does not imply a
-- right to browse private applicant data. If a future moderation/support feature genuinely
-- needs this, it should add its own narrow, audited read path rather than inheriting broad
-- access here by default.

alter table public.applications enable row level security;
alter table public.application_status_events enable row level security;

create policy applications_select_tenant on public.applications
  for select to authenticated
  using (tenant_id = auth.uid());

create policy applications_select_landlord on public.applications
  for select to authenticated
  using (exists (
    select 1 from public.listings l
    where l.id = applications.listing_id and l.owner_id = auth.uid()
  ));

create policy application_status_events_select on public.application_status_events
  for select to authenticated
  using (exists (
    select 1 from public.applications a
    where a.id = application_status_events.application_id
      and (
        a.tenant_id = auth.uid()
        or exists (select 1 from public.listings l where l.id = a.listing_id and l.owner_id = auth.uid())
      )
  ));

-- No insert/update/delete policy on either table for authenticated/anon at all: every write
-- goes through the SECURITY DEFINER functions in part 6, matching listing_images/
-- moderation_actions' existing all-through-RPC pattern from Phase 1B.

-- =========================================================================================
-- 5. Grants
-- =========================================================================================
-- Applying the two real-platform lessons from Phase 1C up front, instead of discovering them
-- again later: (a) service_role needs an explicit grant of its own — BYPASSRLS does not imply
-- table privileges — and (b) this project's own default-privilege baseline silently hands
-- anon/authenticated TRUNCATE/REFERENCES/TRIGGER on every new table, which is revoked here as
-- the same defense-in-depth cleanup Phase 1C did retroactively for the earlier tables.

grant select on public.applications to authenticated;
grant select on public.application_status_events to authenticated;
-- No insert/update/delete grant to authenticated or anon on either table.

grant select, insert, update, delete on public.applications to service_role;
grant select, insert, update, delete on public.application_status_events to service_role;

revoke truncate, references, trigger on public.applications from anon, authenticated;
revoke truncate, references, trigger on public.application_status_events from anon, authenticated;

-- =========================================================================================
-- 6. calculate_rental_fit() — server-side port of src/utils/calculatePropertyMatch.js
-- =========================================================================================
-- A faithful, deterministic port of the ACTUAL frozen frontend algorithm (inspected directly,
-- not re-derived or redesigned). No personality/demographic scoring, no plan/Boost/monetisation
-- input anywhere — matches the frontend, which never took any of those as inputs either. Pure
-- computation over the two composite rows already passed in: no table access, so this is
-- SECURITY INVOKER (the default) and STABLE, not SECURITY DEFINER.
--
-- Two deliberate, documented simplifications versus the literal frontend code, both provably
-- score-equivalent for every real input the algorithm actually branches on:
--
--   1. Preferred-area matching. The frontend's normalizePreferredAreas() first tries to map
--      each tenant-entered area to a canonical entry in a fixed, UI-only per-city area list
--      (areaOptionsByCity) before lowercasing for comparison — that step exists to correct
--      whitespace/capitalization against known picker options, not to change which areas are
--      considered equal. Reproducing that fixed list here would duplicate UI configuration that
--      changes independently of this schema. This function instead does a direct
--      lower(trim(...)) comparison on both sides, which is exactly what the frontend's own
--      comparison does after normalizePreferredAreas() runs — the only case that could possibly
--      differ is a tenant-entered area whose canonical-list match has a different display
--      string than what the tenant typed, verbatim, which does not occur through the app's own
--      area picker.
--
--   2. lease_length_months IS NULL is treated as equivalent to the frontend's "any" sentinel
--      string, because tenant_profiles (Phase 1A) models "no lease preference" as NULL, not as
--      a stored string. calculatePropertyMatch.js's own normalizeLeaseMonths(value, 12) treats
--      a missing/invalid value and the literal string 'any' identically from that point on
--      (Number('any') is NaN, and `!NaN` is true, exactly like `!null`) — so this is not a
--      behavioral difference, just a type-representation one already implied by Phase 1A''s own
--      schema choice.
--
-- If this scoring logic ever changes, bump rental_fit_algorithm_version below (currently 'v1')
-- rather than editing this function's behavior for existing stored applications to silently
-- change meaning.

create function public.calculate_rental_fit(p_tenant public.tenant_profiles, p_listing public.listings)
returns jsonb
language plpgsql
stable
as $$
declare
  v_score integer := 20;
  v_reasons text[] := '{}';
  v_warnings text[] := '{}';
  v_hard_stops text[] := '{}';
  v_room_listing boolean;
  v_looking_for_matches boolean;
  v_preferred_areas text[];
  v_has_preferred_areas boolean;
  v_has_budget_min boolean;
  v_has_budget_max boolean;
  v_move_in_gap integer;
  v_household_size integer;
  v_max_occupants integer;
  v_capacity_after_movein integer;
  v_capacity_limit integer;
  v_preferred_lease integer;
  v_needs_parking boolean;
  v_tenant_smoking text;
  v_listing_smoking text;
  v_smoking_compatible boolean;
  v_has_pets boolean;
  v_pets_compatible boolean;
  v_ready_documents integer;
  v_hard_stop_cap integer;
begin
  v_room_listing := p_listing.listing_category in ('private_room', 'owner_occupied_room');

  -- lookingFor
  v_looking_for_matches := (
    p_tenant.looking_for = 'any'
    or (p_tenant.looking_for = 'room' and v_room_listing)
    or (p_tenant.looking_for = 'entire_property' and not v_room_listing)
  );
  if v_looking_for_matches then
    v_score := v_score + 8;
    if p_tenant.looking_for <> 'any' then
      v_reasons := array_append(v_reasons, case when v_room_listing
        then 'This room matches what you are looking for.'
        else 'This entire property matches what you are looking for.' end);
    end if;
  else
    v_warnings := array_append(v_warnings, case when v_room_listing
      then 'You are mainly looking for entire properties.'
      else 'You are mainly looking for rooms.' end);
  end if;

  -- target city
  if lower(trim(p_tenant.target_city)) = lower(trim(p_listing.city)) then
    v_score := v_score + 12;
    v_reasons := array_append(v_reasons, format('This listing is in %s, matching your target city.', p_listing.city));
  else
    v_warnings := array_append(v_warnings, format('This listing is in %s, not in your selected city.', p_listing.city));
  end if;

  -- preferred areas (see the function comment above for the documented simplification)
  select coalesce(array_agg(lower(trim(a))), '{}') into v_preferred_areas
  from unnest(p_tenant.preferred_areas) as a;
  v_has_preferred_areas := coalesce(array_length(v_preferred_areas, 1), 0) > 0;
  if lower(trim(p_listing.area)) = any(v_preferred_areas) then
    v_score := v_score + 18;
    v_reasons := array_append(v_reasons, 'It is located in one of your preferred areas.');
  elsif v_has_preferred_areas then
    v_warnings := array_append(v_warnings, 'This area is not in your preferred list.');
  end if;

  -- budget
  v_has_budget_min := p_tenant.budget_min is not null;
  v_has_budget_max := p_tenant.budget_max is not null;
  if not v_has_budget_min and not v_has_budget_max then
    v_warnings := array_append(v_warnings, 'Budget is not set yet, so rent fit is not scored.');
  elsif (not v_has_budget_max or p_listing.rent <= p_tenant.budget_max)
    and (not v_has_budget_min or p_listing.rent >= p_tenant.budget_min) then
    v_score := v_score + 22;
    v_reasons := array_append(v_reasons, 'The monthly rent is within your budget.');
  elsif v_has_budget_max and p_listing.rent > p_tenant.budget_max then
    if (p_listing.rent - p_tenant.budget_max) > 300 then
      v_hard_stops := array_append(v_hard_stops, 'The rent is materially above your maximum budget.');
    else
      v_warnings := array_append(v_warnings, 'The monthly rent is above your maximum budget.');
    end if;
  elsif v_has_budget_min and p_listing.rent < p_tenant.budget_min then
    v_score := v_score + 8;
    v_reasons := array_append(v_reasons, 'The monthly rent is below your stated minimum budget.');
  end if;

  -- move-in date fit
  if p_tenant.move_in_date is null or p_listing.available_from is null then
    v_warnings := array_append(v_warnings, 'Move-in timing is incomplete, so date fit is not scored.');
  else
    v_move_in_gap := p_listing.available_from - p_tenant.move_in_date;
    if v_move_in_gap >= -14 and v_move_in_gap <= 30 then
      v_score := v_score + 12;
      v_reasons := array_append(v_reasons, 'The available date is close to your move-in date.');
    elsif v_move_in_gap < -14 then
      v_warnings := array_append(v_warnings, 'This listing may be available too early for your move-in timing.');
    else
      v_warnings := array_append(v_warnings, 'This listing may be available later than your move-in date.');
    end if;
  end if;

  -- household size vs occupancy
  v_household_size := coalesce(p_tenant.household_size, 1);
  v_max_occupants := coalesce(nullif(p_listing.max_occupants, 0), 1);
  if v_household_size <= v_max_occupants then
    v_score := v_score + 10;
    v_reasons := array_append(v_reasons, 'The listed occupancy can fit your household size.');
  else
    v_hard_stops := array_append(v_hard_stops, case when v_room_listing
      then 'This room occupancy is too small for the applicants.'
      else 'The listed maximum occupancy is too small for your household.' end);
  end if;

  if v_room_listing then
    if p_tenant.applying_as_couple and not p_listing.couples_accepted then
      v_hard_stops := array_append(v_hard_stops, 'Couples are not accepted for this room.');
    end if;

    v_capacity_after_movein := coalesce(nullif(p_listing.current_household_size, 0), 0) + v_household_size;
    v_capacity_limit := coalesce(
      nullif(p_listing.max_household_size, 0),
      nullif(p_listing.current_household_size, 0),
      1
    );
    if v_capacity_after_movein > v_capacity_limit then
      v_hard_stops := array_append(v_hard_stops, 'Household capacity exceeded.');
    end if;

    if not p_tenant.owner_occupied_acceptable and p_listing.listing_category = 'owner_occupied_room' then
      v_hard_stops := array_append(v_hard_stops, 'Owner-occupied excluded by tenant preference.');
    elsif p_listing.listing_category = 'owner_occupied_room' then
      v_reasons := array_append(v_reasons, 'Owner lives in the property.');
    end if;

    if p_tenant.private_bathroom_preferred then
      if p_listing.bathroom_arrangement in ('private', 'ensuite') then
        v_score := v_score + 7;
        v_reasons := array_append(v_reasons, 'The bathroom arrangement matches your private bathroom preference.');
      else
        v_warnings := array_append(v_warnings, 'This room has a shared bathroom.');
      end if;
    end if;

    if p_tenant.bills_included_preferred then
      if p_listing.bills_included then
        v_score := v_score + 5;
        v_reasons := array_append(v_reasons, 'Bills are included for this room.');
      else
        v_warnings := array_append(v_warnings, 'Bills are separate for this room.');
      end if;
    end if;
  end if;

  -- lease length (null means "no preference / any" — see function comment)
  v_preferred_lease := p_tenant.lease_length_months;
  if v_preferred_lease is null or v_preferred_lease >= coalesce(p_listing.min_stay_months, 0) then
    v_score := v_score + 8;
    v_reasons := array_append(v_reasons, 'The minimum lease term fits your preference.');
  else
    v_warnings := array_append(v_warnings, 'The minimum lease may be longer than your stated preference.');
  end if;

  -- furnished
  if p_tenant.furnished_preference = 'any' or p_tenant.furnished_preference::text = p_listing.furnished::text then
    v_score := v_score + 7;
    v_reasons := array_append(v_reasons, 'The furnishing setup fits your preference.');
  else
    v_warnings := array_append(v_warnings, 'The furnishing setup may not match your preference.');
  end if;

  -- parking
  v_needs_parking := p_tenant.parking_needed;
  if not v_needs_parking or p_listing.parking <> 'none' then
    v_score := v_score + 6;
    if v_needs_parking then
      v_reasons := array_append(v_reasons, 'The listing appears to support your parking need.');
    end if;
  else
    v_hard_stops := array_append(v_hard_stops, 'You need parking, but this listing does not include it.');
  end if;

  -- smoking + pets (combined, matching the frontend's single combined branch)
  v_tenant_smoking := p_tenant.smoking::text;
  v_listing_smoking := p_listing.smoking_policy::text;
  v_smoking_compatible := (
    v_tenant_smoking = 'no'
    or v_listing_smoking = 'yes'
    or (v_tenant_smoking = 'outside_only' and v_listing_smoking = 'outside_only')
  );
  v_has_pets := p_tenant.pets <> 'none';
  v_pets_compatible := (not v_has_pets) or p_listing.pets_policy <> 'not_allowed';

  if v_smoking_compatible and v_pets_compatible then
    v_score := v_score + 7;
    if v_has_pets and p_listing.pets_policy = 'considered' then
      v_warnings := array_append(v_warnings, 'Pets are considered for this listing, but acceptance is not guaranteed.');
    else
      v_reasons := array_append(v_reasons, 'The listing rules fit your smoking and pet preferences.');
    end if;
  else
    v_hard_stops := array_append(v_hard_stops, 'Some listing rules may not fit your smoking or pet preferences.');
  end if;

  -- readiness
  v_ready_documents := (case when p_tenant.references_ready then 1 else 0 end)
    + (case when p_tenant.income_ready then 1 else 0 end)
    + (case when p_tenant.id_ready then 1 else 0 end);
  if v_ready_documents = 3 then
    v_score := v_score + 8;
    v_reasons := array_append(v_reasons, 'Your references, income proof and ID readiness are strong for this listing.');
  elsif v_ready_documents > 0 then
    v_score := v_score + 3;
    v_warnings := array_append(v_warnings, 'Some application readiness items are still incomplete.');
  else
    v_warnings := array_append(v_warnings, 'Application readiness is not set yet.');
  end if;

  -- hard-stop penalty + cap, matching calculatePropertyMatch.js exactly
  v_score := v_score - (coalesce(array_length(v_hard_stops, 1), 0) * 18);
  v_hard_stop_cap := case when coalesce(array_length(v_hard_stops, 1), 0) > 0 then 58 else 100 end;
  v_score := greatest(0, least(v_hard_stop_cap, v_score));

  if array_length(v_reasons, 1) is null then
    v_reasons := array_append(v_reasons, 'This listing could still be worth a look, but your profile would improve the match signal.');
  end if;

  return jsonb_build_object(
    'score', v_score,
    'reasons', to_jsonb(v_reasons),
    'warnings', to_jsonb(v_warnings),
    'hard_stops', to_jsonb(v_hard_stops)
  );
end;
$$;

comment on function public.calculate_rental_fit(public.tenant_profiles, public.listings) is
  'Deterministic port of src/utils/calculatePropertyMatch.js. No personality/demographic/'
  'plan/Boost input. Internal use only from create_application() — see the execute grants below.';

-- =========================================================================================
-- 7. create_application(listing_id) — the only way an application row can ever be created
-- =========================================================================================
-- Every value the client could try to forge (tenant identity, owner identity, status, snapshot,
-- Rental Fit score/breakdown, timestamps) is derived server-side; the only client input is
-- p_listing_id. A duplicate-application attempt is caught via the unique constraint (part 2),
-- which is what makes this safe under real concurrency, not the existence check that runs first
-- (that check alone is a UX nicety — a fast, clear error, not the authoritative guard).

create function public.create_application(p_listing_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant public.tenant_profiles;
  v_listing public.listings;
  v_owner_status public.platform_status_t;
  v_fit jsonb;
  v_snapshot jsonb;
  v_application_id uuid;
begin
  if not public.is_caller_active() then
    raise exception 'Account is not active' using errcode = '42501';
  end if;

  select * into v_tenant from public.tenant_profiles where profile_id = auth.uid();
  if not found then
    raise exception 'A tenant profile is required to apply';
  end if;

  select * into v_listing from public.listings where id = p_listing_id;
  if not found then
    raise exception 'Listing not found';
  end if;

  if v_listing.status <> 'published' then
    raise exception 'This listing is not currently open for applications';
  end if;

  if v_listing.owner_id = auth.uid() then
    raise exception 'You cannot apply to your own listing' using errcode = '42501';
  end if;

  select platform_status into v_owner_status from public.profiles where id = v_listing.owner_id;
  if v_owner_status <> 'active' then
    raise exception 'This listing is not currently accepting applications';
  end if;

  v_fit := public.calculate_rental_fit(v_tenant, v_listing);

  v_snapshot := jsonb_build_object(
    'display_name', (select display_name from public.profiles where id = auth.uid()),
    'target_city', v_tenant.target_city,
    'preferred_areas', to_jsonb(v_tenant.preferred_areas),
    'budget_min', v_tenant.budget_min,
    'budget_max', v_tenant.budget_max,
    'move_in_date', v_tenant.move_in_date,
    'lease_length_months', v_tenant.lease_length_months,
    'household_size', v_tenant.household_size,
    'applying_as_couple', v_tenant.applying_as_couple,
    'looking_for', v_tenant.looking_for,
    'employment_status', v_tenant.employment_status,
    'student', v_tenant.student,
    'pets', v_tenant.pets,
    'smoking', v_tenant.smoking,
    'furnished_preference', v_tenant.furnished_preference,
    'parking_needed', v_tenant.parking_needed,
    'private_bathroom_preferred', v_tenant.private_bathroom_preferred,
    'bills_included_preferred', v_tenant.bills_included_preferred,
    'owner_occupied_acceptable', v_tenant.owner_occupied_acceptable,
    'references_ready', v_tenant.references_ready,
    'income_ready', v_tenant.income_ready,
    'id_ready', v_tenant.id_ready,
    'bio', v_tenant.bio
  );

  begin
    insert into public.applications (
      listing_id, tenant_id, status, tenant_snapshot,
      rental_fit_score, rental_fit_breakdown, rental_fit_algorithm_version
    ) values (
      p_listing_id, auth.uid(), 'sent', v_snapshot,
      (v_fit ->> 'score')::smallint, v_fit - 'score', 'v1'
    )
    returning id into v_application_id;
  exception when unique_violation then
    raise exception 'You have already applied to this listing' using errcode = '23505';
  end;

  insert into public.application_status_events (application_id, from_status, to_status, actor_id)
  values (v_application_id, null, 'sent', auth.uid());

  return v_application_id;
end;
$$;

comment on function public.create_application(uuid) is
  'The only INSERT path for applications. Rejects: inactive caller, no tenant_profiles row, '
  'missing/non-published listing, applying to your own listing, listing owned by a non-active '
  'landlord, and a duplicate application (authoritatively via the unique constraint, not just '
  'the pre-check above it — see Phase 2''s concurrency test).';

-- =========================================================================================
-- 8. withdraw_application(application_id) — tenant-only, active or suspended (not banned)
-- =========================================================================================

create function public.withdraw_application(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_app public.applications;
begin
  select * into v_app from public.applications
  where id = p_application_id and tenant_id = auth.uid();
  if not found then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  -- Suspended (not banned) tenants may still withdraw: this only ever reduces marketplace
  -- exposure, matching the Phase 1D principle applied to listings' pause/withdraw actions.
  if public.is_caller_banned() then
    raise exception 'Account is not active' using errcode = '42501';
  end if;

  if v_app.status in ('withdrawn', 'not_selected', 'closed') then
    raise exception 'This application has already reached a terminal state';
  end if;

  update public.applications set status = 'withdrawn' where id = p_application_id;
  insert into public.application_status_events (application_id, from_status, to_status, actor_id)
  values (p_application_id, v_app.status, 'withdrawn', auth.uid());
end;
$$;

-- =========================================================================================
-- 9. mark_application_viewed(application_id) — landlord-only, idempotent
-- =========================================================================================

create function public.mark_application_viewed(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_app public.applications;
begin
  select a.* into v_app
  from public.applications a
  join public.listings l on l.id = a.listing_id
  where a.id = p_application_id and l.owner_id = auth.uid();
  if not found then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  -- Viewing is a passive read-adjacent action, not an exposure-increasing decision, so a
  -- suspended landlord may still do this (matching "may read applications to their own
  -- listings" from Phase 2's spec) — only banned is blocked, same boundary as
  -- withdraw_application above.
  if public.is_caller_banned() then
    raise exception 'Account is not active' using errcode = '42501';
  end if;

  update public.applications
  set first_viewed_at = coalesce(first_viewed_at, now()),
      status = case when status = 'sent' then 'viewed' else status end
  where id = p_application_id;

  -- Only the actual sent -> viewed transition gets an event; calling this again on an
  -- already-viewed-or-further application updates nothing but first_viewed_at (already a no-op
  -- after the first call) and never regresses status or duplicates history.
  if v_app.status = 'sent' then
    insert into public.application_status_events (application_id, from_status, to_status, actor_id)
    values (p_application_id, 'sent', 'viewed', auth.uid());
  end if;
end;
$$;

-- =========================================================================================
-- 10. landlord_set_application_status(application_id, new_status) — the landlord decision matrix
-- =========================================================================================
-- Transition matrix (also documented in the Phase 2 report):
--   from: sent, viewed, landlord_interested, shortlisted (any non-terminal status)
--   to:   landlord_interested | shortlisted | not_selected | closed   (only these four)
--   from: withdrawn | not_selected | closed (terminal)  -> always blocked, any target
--   viewing_proposed / viewing_confirmed are never reachable through this function at all —
--     rejected before any other check even runs, regardless of caller/application state.
-- landlord_interested/shortlisted require an ACTIVE caller (these increase applicant
-- engagement). not_selected/closed only require a NOT-BANNED caller — a suspended landlord may
-- still close out or reject applications, since that reduces marketplace interaction, mirroring
-- Phase 1D''s listings pause/mark-rented allowance for suspended owners.

create function public.landlord_set_application_status(p_application_id uuid, p_new_status public.application_status_t)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_app public.applications;
begin
  if p_new_status not in ('landlord_interested', 'shortlisted', 'not_selected', 'closed') then
    raise exception 'Not a valid landlord decision status';
  end if;

  select a.* into v_app
  from public.applications a
  join public.listings l on l.id = a.listing_id
  where a.id = p_application_id and l.owner_id = auth.uid();
  if not found then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if v_app.status in ('withdrawn', 'not_selected', 'closed') then
    raise exception 'This application has already reached a terminal state';
  end if;

  if p_new_status in ('landlord_interested', 'shortlisted') and not public.is_caller_active() then
    raise exception 'Account is not active' using errcode = '42501';
  end if;
  if p_new_status in ('not_selected', 'closed') and public.is_caller_banned() then
    raise exception 'Account is not active' using errcode = '42501';
  end if;

  if v_app.status = p_new_status then
    return;
  end if;

  update public.applications set status = p_new_status where id = p_application_id;
  insert into public.application_status_events (application_id, from_status, to_status, actor_id)
  values (p_application_id, v_app.status, p_new_status, auth.uid());
end;
$$;

-- =========================================================================================
-- 11. updated_at maintenance + explicit function-level execute grants
-- =========================================================================================

create trigger applications_set_updated_at
  before update on public.applications
  for each row
  execute function public.set_updated_at();

-- Explicit allowlist rather than relying on Postgres' default PUBLIC execute grant on new
-- functions (which Phase 1A-1D''s functions have relied on implicitly, safely so far only
-- because every one of them re-derives authorization from auth.uid() internally regardless of
-- who is technically allowed to call them). calculate_rental_fit() gets no grant at all —
-- create_application() calls it internally with its own SECURITY DEFINER privilege, which does
-- not require the original caller to have execute rights on it.

revoke execute on function public.calculate_rental_fit(public.tenant_profiles, public.listings) from public;

revoke execute on function public.create_application(uuid) from public;
grant execute on function public.create_application(uuid) to authenticated;

revoke execute on function public.withdraw_application(uuid) from public;
grant execute on function public.withdraw_application(uuid) to authenticated;

revoke execute on function public.mark_application_viewed(uuid) from public;
grant execute on function public.mark_application_viewed(uuid) to authenticated;

revoke execute on function public.landlord_set_application_status(uuid, public.application_status_t) from public;
grant execute on function public.landlord_set_application_status(uuid, public.application_status_t) to authenticated;
