-- Gafflo backend — Stage J1: Legal / Trust / Safety foundation.
--
-- Three additive, independent pieces on top of every prior phase; no existing migration file is
-- touched:
--   1. A one-time, account-level Fair Housing Policy acknowledgement for landlords, enforced as a
--      real server-side gate on request_listing_review() — a client checkbox alone is never the
--      real guard in this codebase, matching every other privileged-action gate so far.
--   2. listing_reports — a private tenant->moderator reporting channel. The landlord must never
--      see a report or a reporter's identity, directly or indirectly, and reporting must never
--      create a notification, application, conversation, save, or Smart Match side effect — the
--      same privacy posture already established for listing_views (Stage I) and Smart Match
--      Interested (Stage G).
--   3. Two small, well-tested moderator-only RPCs to read/resolve reports. No moderator UI ships
--      in this stage — moderation here stays backend-capability-first, exactly like listing
--      moderation itself already is (moderator_approve_listing() etc. have had zero frontend for
--      every prior stage).

-- =========================================================================================
-- 1. landlord_profiles.fair_housing_acknowledged_at — privileged the same way profiles'
-- platform_role/platform_status are: the column is added here, but never added to
-- landlord_profiles' existing `grant update (...)` allowlist (see the Phase 1A migration), so it
-- stays un-writable through the normal client update path by construction, not by a new trigger.
-- Only acknowledge_fair_housing_policy() (SECURITY DEFINER) can ever set it.
-- =========================================================================================

alter table public.landlord_profiles
  add column fair_housing_acknowledged_at timestamptz;

comment on column public.landlord_profiles.fair_housing_acknowledged_at is
  'Privileged. Deliberately absent from landlord_profiles'' client UPDATE column-grant allowlist '
  '— only acknowledge_fair_housing_policy() can set it. One-time, account-level (not per-listing): '
  'once set, it is never cleared or re-asked.';

create function public.acknowledge_fair_housing_policy()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if not exists (select 1 from public.landlord_profiles where profile_id = auth.uid()) then
    raise exception 'A landlord profile is required to acknowledge this policy';
  end if;

  -- coalesce, never overwrite: idempotent, and preserves the true first-acknowledged timestamp
  -- rather than sliding it forward on every repeat call.
  update public.landlord_profiles
  set fair_housing_acknowledged_at = coalesce(fair_housing_acknowledged_at, now())
  where profile_id = auth.uid();
end;
$$;

comment on function public.acknowledge_fair_housing_policy() is
  'The only write path for fair_housing_acknowledged_at. Idempotent: a repeat call after '
  'acknowledgement is already recorded is a safe no-op that keeps the original timestamp.';

-- =========================================================================================
-- 2. Harden request_listing_review() — a landlord cannot request review until they have
-- acknowledged the Fair Housing Policy. Added directly after the existing ownership check and
-- before every other readiness check, since this is an account-level prerequisite, not a
-- per-listing data-completeness issue like the checks that follow it. Every other line in this
-- function is byte-for-byte unchanged from the Stage listings-moderation migration.
-- =========================================================================================

create or replace function public.request_listing_review(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_listing public.listings;
  v_image_count integer;
  v_missing text[] := '{}';
begin
  select * into v_listing from public.listings where id = p_listing_id;
  if not found then
    raise exception 'Listing not found';
  end if;
  if v_listing.owner_id <> auth.uid() then
    raise exception 'Not authorized to request review for this listing' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.landlord_profiles
    where profile_id = auth.uid() and fair_housing_acknowledged_at is not null
  ) then
    raise exception 'You must acknowledge Gafflo''s Fair Housing Policy before requesting a listing review' using errcode = '42501';
  end if;

  if v_listing.status not in ('draft', 'rejected') then
    raise exception 'Listing must be a draft or rejected to request review (current status: %)', v_listing.status;
  end if;

  if v_listing.title is null or length(v_listing.title) < 8 or length(v_listing.title) > 90 then
    v_missing := array_append(v_missing, 'title (8-90 characters)');
  end if;
  if v_listing.description is null or length(v_listing.description) < 40 or length(v_listing.description) > 900 then
    v_missing := array_append(v_missing, 'description (40-900 characters)');
  end if;
  if v_listing.area is null or length(trim(v_listing.area)) = 0 then
    v_missing := array_append(v_missing, 'area');
  end if;
  if v_listing.city is null or length(trim(v_listing.city)) = 0 then
    v_missing := array_append(v_missing, 'city');
  end if;
  if v_listing.rent is null or v_listing.rent <= 0 then
    v_missing := array_append(v_missing, 'rent (must be greater than 0)');
  end if;
  if v_listing.deposit is null then
    v_missing := array_append(v_missing, 'deposit');
  end if;
  if v_listing.available_from is null then
    v_missing := array_append(v_missing, 'available_from');
  elsif v_listing.available_from < current_date then
    v_missing := array_append(v_missing, 'available_from (cannot be in the past)');
  end if;
  if v_listing.min_stay_months is null then
    v_missing := array_append(v_missing, 'min_stay_months');
  end if;

  if v_listing.listing_category = 'entire_property' then
    if v_listing.property_type is null then
      v_missing := array_append(v_missing, 'property_type');
    end if;
    if v_listing.property_type is distinct from 'studio' and (v_listing.bedrooms is null or v_listing.bedrooms < 1) then
      v_missing := array_append(v_missing, 'bedrooms');
    end if;
    if v_listing.bathrooms is null then
      v_missing := array_append(v_missing, 'bathrooms');
    end if;
    if v_listing.max_occupants is null then
      v_missing := array_append(v_missing, 'max_occupants');
    end if;
  else
    if v_listing.room_type is null then
      v_missing := array_append(v_missing, 'room_type');
    end if;
    if v_listing.bathroom_arrangement is null then
      v_missing := array_append(v_missing, 'bathroom_arrangement');
    end if;
    if v_listing.total_bedrooms is null then
      v_missing := array_append(v_missing, 'total_bedrooms');
    end if;
    if v_listing.bathrooms is null then
      v_missing := array_append(v_missing, 'bathrooms');
    end if;
    if v_listing.max_occupants is null then
      v_missing := array_append(v_missing, 'max_occupants (room occupancy)');
    end if;
  end if;

  select count(*) into v_image_count from public.listing_images where listing_id = p_listing_id;
  if v_image_count = 0 then
    v_missing := array_append(v_missing, 'at least one durable listing photo');
  end if;

  if array_length(v_missing, 1) > 0 then
    raise exception 'Listing is not ready for review. Missing/invalid: %', array_to_string(v_missing, ', ');
  end if;

  update public.listings set status = 'pending_verification', rejection_reason = null
  where id = p_listing_id;
end;
$$;

revoke execute on function public.acknowledge_fair_housing_policy() from public;
grant execute on function public.acknowledge_fair_housing_policy() to authenticated;

-- =========================================================================================
-- 3. listing_reports — a private tenant/user -> moderator reporting channel.
-- =========================================================================================

create type public.listing_report_reason_t as enum (
  'discriminatory_language', 'scam_or_fraud', 'inaccurate_listing', 'inappropriate_content', 'harassment', 'other'
);

create type public.listing_report_status_t as enum ('open', 'reviewed', 'dismissed', 'actioned');

create table public.listing_reports (
  id uuid primary key default gen_random_uuid(),

  listing_id uuid not null references public.listings (id),
  reporter_id uuid not null references public.profiles (id),

  reason public.listing_report_reason_t not null,
  description text,

  status public.listing_report_status_t not null default 'open',

  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id),

  constraint listing_reports_description_length check (description is null or length(description) <= 500)
);

comment on table public.listing_reports is
  'Private reports about a listing, visible only to moderators. No client SELECT/INSERT/UPDATE/'
  'DELETE grant exists at all — report_listing() is the only write path, and no read RPC exists '
  'for anyone but a moderator. A landlord has no way to see a report, or that one exists, through '
  'any client-reachable surface, directly or indirectly (no notification is ever created either).';

-- One open report per (listing, reporter) at a time — a duplicate attempt is a safe no-op, not
-- an error, mirroring viewing_proposals_one_open_per_application's exact idiom from Stage F. A
-- new report is allowed again once a prior one has been resolved (status moved off 'open').
create unique index listing_reports_one_open_per_reporter_listing
  on public.listing_reports (listing_id, reporter_id)
  where status = 'open';

-- For the future moderator queue: real rows to page through by listing, or by open status in
-- recency order.
create index listing_reports_listing_id_idx on public.listing_reports (listing_id);
create index listing_reports_open_status_idx on public.listing_reports (status, created_at) where status = 'open';

alter table public.listing_reports enable row level security;

-- No SELECT/INSERT/UPDATE/DELETE policy of any kind, and an explicit revoke on top — a reporter
-- does not need to read their own report rows back for this MVP (report_listing()'s own return
-- value is enough feedback), and a landlord must never be able to enumerate reports about their
-- own listings under any role.
revoke select, insert, update, delete on public.listing_reports from anon, authenticated;
grant select, insert, update, delete on public.listing_reports to service_role;
revoke truncate, references, trigger on public.listing_reports from anon, authenticated;

-- =========================================================================================
-- 4. report_listing(listing_id, reason, description) — the only write path for listing_reports.
-- =========================================================================================

create function public.report_listing(p_listing_id uuid, p_reason public.listing_report_reason_t, p_description text default null)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_listing public.listings;
  v_clean_description text;
  v_inserted boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if public.is_caller_banned() then
    return false;
  end if;

  select * into v_listing from public.listings where id = p_listing_id;
  if not found then
    raise exception 'Listing not found';
  end if;

  if v_listing.owner_id = auth.uid() then
    raise exception 'You cannot report your own listing' using errcode = '42501';
  end if;

  v_clean_description := nullif(trim(coalesce(p_description, '')), '');
  if v_clean_description is not null and length(v_clean_description) > 500 then
    raise exception 'Description is too long (maximum 500 characters)';
  end if;

  insert into public.listing_reports (listing_id, reporter_id, reason, description)
  values (p_listing_id, auth.uid(), p_reason, v_clean_description)
  on conflict (listing_id, reporter_id) where status = 'open' do nothing
  returning true into v_inserted;

  return coalesce(v_inserted, false);
end;
$$;

comment on function public.report_listing(uuid, public.listing_report_reason_t, text) is
  'The only write path for listing_reports. Returns true only when a new report row was '
  'inserted; false when the caller already has an open report on this listing (idempotent '
  'no-op, not an error). Banned callers are a quiet no-op. It never creates a notification, '
  'application, conversation, save, or Smart Match row — it only ever touches listing_reports.';

revoke execute on function public.report_listing(uuid, public.listing_report_reason_t, text) from public;
grant execute on function public.report_listing(uuid, public.listing_report_reason_t, text) to authenticated;

-- =========================================================================================
-- 5. Moderator-only read/resolve RPCs — backend capability now, no frontend in this stage,
-- matching moderator_approve_listing()/moderator_reject_listing()/moderator_remove_listing()'s
-- own precedent of shipping with zero UI.
-- =========================================================================================

create function public.list_listing_reports(p_status public.listing_report_status_t default 'open')
returns setof public.listing_reports
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_caller_moderator() then
    raise exception 'Not authorized: moderator role required' using errcode = '42501';
  end if;

  return query
    select * from public.listing_reports
    where status = p_status
    order by created_at asc;
end;
$$;

create function public.resolve_listing_report(p_report_id uuid, p_status public.listing_report_status_t)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_caller_moderator() then
    raise exception 'Not authorized: moderator role required' using errcode = '42501';
  end if;

  if p_status = 'open' then
    raise exception 'Cannot resolve a report back to open status';
  end if;

  update public.listing_reports
  set status = p_status, reviewed_at = now(), reviewed_by = auth.uid()
  where id = p_report_id;

  if not found then
    raise exception 'Report not found';
  end if;
end;
$$;

comment on function public.list_listing_reports(public.listing_report_status_t) is
  'Moderator-only. Backend capability for Stage J1; no frontend view exists yet.';
comment on function public.resolve_listing_report(uuid, public.listing_report_status_t) is
  'Moderator-only. Backend capability for Stage J1; no frontend view exists yet.';

revoke execute on function public.list_listing_reports(public.listing_report_status_t) from public;
grant execute on function public.list_listing_reports(public.listing_report_status_t) to authenticated;

revoke execute on function public.resolve_listing_report(uuid, public.listing_report_status_t) from public;
grant execute on function public.resolve_listing_report(uuid, public.listing_report_status_t) to authenticated;
