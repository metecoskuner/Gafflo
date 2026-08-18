-- Gafflo backend — Phase 1B: real listings, durable image storage, minimal moderation.
--
-- New migration on top of the immutable Phase 1A foundation (profiles/tenant_profiles/
-- landlord_profiles/RLS) — 20260817234346_profiles_and_rls_foundation.sql is never edited.
--
-- Still out of scope here: applications, messages, viewings, payments, notifications. This
-- phase makes the landlord listing lifecycle real and gives moderators the minimum capability
-- to keep a public listings surface safe (approve/reject/remove/suspend).

-- =========================================================================================
-- 1. Enumerated types
-- =========================================================================================
-- Reuses smoking_preference_t from Phase 1A where the value set is genuinely identical
-- (a listing's smoking policy and a tenant's smoking preference are literally the same three
-- options) rather than declaring a duplicate enum with the same values under a new name.

create type public.listing_status_t as enum (
  'draft', 'pending_verification', 'published', 'paused', 'rented', 'rejected', 'removed_by_platform'
);
-- Note: the frontend historically also used 'active' as a synonym for 'published' in a couple
-- of places. This schema has exactly one canonical name, 'published' — a future frontend
-- migration step normalizes any legacy 'active' value it encounters, not this schema.

create type public.listing_category_t as enum ('entire_property', 'private_room', 'owner_occupied_room');
create type public.property_type_t as enum ('apartment', 'house', 'studio');
-- Deliberately excludes 'studio' — a room cannot exist inside a studio, so it is not a valid
-- parent property type for a room listing the way it is for an entire-property listing.
create type public.room_parent_property_type_t as enum ('apartment', 'house');
create type public.room_type_t as enum ('single', 'double', 'ensuite');
create type public.bathroom_arrangement_t as enum ('private', 'shared', 'ensuite');
create type public.pets_policy_t as enum ('allowed', 'considered', 'not_allowed');
-- Never 'any' — that is a meaningful tenant *preference*, never a real state of a property.
create type public.listing_furnished_t as enum ('furnished', 'part_furnished', 'unfurnished');
create type public.listing_parking_t as enum ('none', 'street_permit', 'included', 'driveway');
create type public.viewing_type_t as enum ('in_person', 'virtual');
create type public.listing_image_label_t as enum (
  'cover', 'living_room', 'kitchen', 'bedroom', 'bathroom', 'shared_living_area', 'exterior', 'other'
);

-- =========================================================================================
-- 2. listings
-- =========================================================================================
-- Numeric/date fields that a draft may legitimately not have answered yet stay nullable
-- (rent, deposit, bedrooms, bathrooms, occupancy, available_from, min_stay_months, title,
-- description) — the same "unknown must remain genuinely unknown, never invented" rule
-- Phase 1A applied to tenant_profiles. Enum/boolean fields get a sensible, honest default
-- instead (furnished, parking, pets_policy, etc.) because a placeholder default here is not
-- fabricating a fact the way inventing a budget or a date would be — the landlord is expected
-- to change it before requesting review, and review-readiness enforces that (see request_listing_review()).

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id),

  status public.listing_status_t not null default 'draft',
  rejection_reason text,
  removed_reason text,
  published_at timestamptz,
  paused_at timestamptz,
  rented_at timestamptz,
  removed_by_platform_at timestamptz,

  listing_category public.listing_category_t not null,

  city text,
  area text,
  approximate_address text,
  -- Private — never included in the tenant-safe projection (public_listings, section 9).
  exact_address text,
  eircode text,

  rent integer,
  deposit integer,
  bills_included boolean not null default false,
  available_from date,
  min_stay_months integer,

  -- Entire-property fields.
  property_type public.property_type_t,
  bedrooms integer,
  bathrooms numeric(3, 1),
  max_occupants integer,

  -- Room-specific fields.
  parent_property_type public.room_parent_property_type_t,
  room_type public.room_type_t,
  total_bedrooms integer,
  current_household_size integer,
  max_household_size integer,
  bathroom_arrangement public.bathroom_arrangement_t,
  owner_lives_in_property boolean not null default false,
  couples_accepted boolean not null default false,

  pets_policy public.pets_policy_t not null default 'not_allowed',
  smoking_policy public.smoking_preference_t not null default 'no',
  furnished public.listing_furnished_t not null default 'unfurnished',
  parking public.listing_parking_t not null default 'none',
  viewing_type public.viewing_type_t not null default 'in_person',

  amenities text[] not null default '{}',
  features text[] not null default '{}',
  listing_rules text[] not null default '{}',
  household_summary text,

  title text,
  description text,

  availability_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint listings_rent_non_negative check (rent is null or rent >= 0),
  constraint listings_deposit_non_negative check (deposit is null or deposit >= 0),
  constraint listings_bedrooms_non_negative check (bedrooms is null or bedrooms >= 0),
  constraint listings_total_bedrooms_positive check (total_bedrooms is null or total_bedrooms > 0),
  constraint listings_bathrooms_positive check (bathrooms is null or bathrooms > 0),
  constraint listings_max_occupants_positive check (max_occupants is null or max_occupants > 0),
  constraint listings_current_household_non_negative check (current_household_size is null or current_household_size >= 0),
  constraint listings_max_household_non_negative check (max_household_size is null or max_household_size >= 0),
  constraint listings_household_capacity_valid check (
    current_household_size is null or max_household_size is null or max_household_size >= current_household_size
  ),
  constraint listings_min_stay_positive check (min_stay_months is null or min_stay_months > 0),

  -- Category-consistent field usage — the same distinction normalizeListingForStorage already
  -- makes on the frontend, now a real, unbypassable table constraint.
  constraint listings_category_fields_consistent check (
    case listing_category
      when 'entire_property' then
        parent_property_type is null and room_type is null and total_bedrooms is null
        and current_household_size is null and max_household_size is null
        and bathroom_arrangement is null and owner_lives_in_property = false
      when 'private_room' then
        property_type is null and bedrooms is null and owner_lives_in_property = false
      when 'owner_occupied_room' then
        property_type is null and bedrooms is null and owner_lives_in_property = true
      else true
    end
  ),
  constraint listings_studio_zero_bedrooms check (
    not (listing_category = 'entire_property' and property_type = 'studio' and bedrooms is not null and bedrooms <> 0)
  ),
  constraint listings_owner_occupied_min_household check (
    not (listing_category = 'owner_occupied_room' and current_household_size is not null and current_household_size < 1)
  )
);

comment on table public.listings is
  'A draft may legitimately have most content fields null — review-readiness is enforced by '
  'request_listing_review(), never by NOT NULL constraints that would make incomplete drafts '
  'impossible to save.';
comment on column public.listings.exact_address is 'Private. Never exposed via public_listings — see section 9.';
comment on column public.listings.eircode is 'Private. Same treatment as exact_address.';
comment on column public.listings.status is
  'Privileged. Never directly writable by authenticated — see section 8''s column grants and '
  'the guarded transition functions in section 7.';

create index listings_status_idx on public.listings (status);
create index listings_owner_id_idx on public.listings (owner_id);

-- =========================================================================================
-- 3. listing_images
-- =========================================================================================

create table public.listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  storage_path text not null unique,
  label public.listing_image_label_t not null default 'other',
  "position" integer not null default 0,
  is_cover boolean not null default false,
  mime_type text not null,
  size_bytes integer not null,
  created_at timestamptz not null default now(),

  constraint listing_images_position_non_negative check ("position" >= 0),
  constraint listing_images_size_positive check (size_bytes > 0),
  -- 2 MiB, matching the frontend's existing MAX_LISTING_PHOTO_BYTES.
  constraint listing_images_size_limit check (size_bytes <= 2097152),
  constraint listing_images_mime_allowed check (mime_type in ('image/jpeg', 'image/png', 'image/webp'))
);

comment on table public.listing_images is
  'Never blob:/data: URLs or base64 — storage_path always points at a real object in the '
  'listing-photos Storage bucket (section 4). SVG is deliberately not an allowed mime_type: an '
  'SVG can embed script/foreign content, which is a real risk for a file type with no strong '
  'need to exist as a listing photo.';

-- At most one cover image per listing — enforced structurally, not just by application code.
create unique index listing_images_one_cover_per_listing on public.listing_images (listing_id) where is_cover;
-- Position is unique per listing so "reorder" always has one unambiguous order.
create unique index listing_images_unique_position on public.listing_images (listing_id, "position");

create index listing_images_listing_id_idx on public.listing_images (listing_id);

-- =========================================================================================
-- 4. Supabase Storage — listing-photos bucket
-- =========================================================================================
-- Private bucket, not a public one: a public bucket would make every draft/pending/rejected
-- listing's photos globally guessable by URL with no auth check at all, which is exactly what
-- "do not make draft listing photos globally public" rules out. Path convention:
-- {listing_id}/{image_id}.{ext}. Access is governed entirely by RLS policies on
-- storage.objects (section 6) — the same Postgres RLS mechanism as every other table here,
-- not a separate access-control system to reason about.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-photos', 'listing-photos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- =========================================================================================
-- 5. Helper functions
-- =========================================================================================

create function public.is_caller_moderator()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and platform_role in ('moderator', 'admin')
  );
$$;

comment on function public.is_caller_moderator() is
  'Resolves the caller''s platform_role server-side from auth.uid() — never trusts a '
  'client-supplied role claim. SECURITY INVOKER is correct here: it only ever checks the '
  'caller''s own profiles row, which profiles_select_own already permits them to read.';

create function public.gafflo_listing_id_from_storage_path(path text)
returns uuid
language plpgsql
immutable
as $$
begin
  return split_part(path, '/', 1)::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

comment on function public.gafflo_listing_id_from_storage_path(text) is
  'Parses the {listing_id}/{image_id}.{ext} path convention. Returns null (fails closed in any '
  'RLS check using it) rather than raising for a malformed path, instead of erroring the whole query.';

-- =========================================================================================
-- 6. Row Level Security — listings, listing_images, storage.objects
-- =========================================================================================

alter table public.listings enable row level security;
alter table public.listing_images enable row level security;

-- ---- listings ----
-- These policies govern row-level visibility on the BASE table. Column-level visibility is a
-- separate concern, handled in section 8: `authenticated`/`anon` are only ever granted SELECT
-- on a safe column allowlist on this table (never exact_address, eircode, rejection_reason,
-- removed_reason, or the internal moderation timestamps) — so even a direct "select *" against
-- the base table, bypassing the public_listings view in section 9 entirely, cannot expose
-- those fields. Full-detail reads (an owner's own exact_address, a moderator's review view)
-- go through the SECURITY DEFINER functions in section 9 instead, which are not limited by
-- this grant at all.

create policy "listings_select_published"
  on public.listings for select
  to authenticated, anon
  using (status = 'published');

create policy "listings_select_own"
  on public.listings for select
  to authenticated
  using (owner_id = auth.uid());

create policy "listings_select_moderator"
  on public.listings for select
  to authenticated
  using (public.is_caller_moderator());

create policy "listings_insert_own_draft"
  on public.listings for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "listings_update_own"
  on public.listings for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- No DELETE policy at all: listings are never hard-deleted by a landlord in this phase (pause/
-- remove/reject are all soft, status-based operations) — matches Phase 1A's "no self-service
-- delete" stance for profiles.

-- ---- listing_images ----
-- No INSERT/UPDATE/DELETE policy for `authenticated` anywhere: every write goes through the
-- guarded functions in section 7, which run as their (elevated) owner, not as `authenticated`.
-- A tenant therefore has no path — not even an indirect one — to mutate image metadata.

create policy "listing_images_select_published"
  on public.listing_images for select
  to authenticated, anon
  using (exists (
    select 1 from public.listings l where l.id = listing_id and l.status = 'published'
  ));

create policy "listing_images_select_owner"
  on public.listing_images for select
  to authenticated
  using (exists (
    select 1 from public.listings l where l.id = listing_id and l.owner_id = auth.uid()
  ));

create policy "listing_images_select_moderator"
  on public.listing_images for select
  to authenticated
  using (public.is_caller_moderator());

-- ---- storage.objects (bucket: listing-photos) ----
-- Same visibility rule as the listing itself, expressed as RLS directly on Storage's own
-- metadata table — not a second, separately-maintained access-control system.

create policy "listing_photos_read_published"
  on storage.objects for select
  to authenticated, anon
  using (
    bucket_id = 'listing-photos'
    and exists (
      select 1 from public.listings l
      where l.id = public.gafflo_listing_id_from_storage_path(name)
      and l.status = 'published'
    )
  );

create policy "listing_photos_read_owner"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'listing-photos'
    and exists (
      select 1 from public.listings l
      where l.id = public.gafflo_listing_id_from_storage_path(name)
      and l.owner_id = auth.uid()
    )
  );

create policy "listing_photos_read_moderator"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'listing-photos' and public.is_caller_moderator());

create policy "listing_photos_write_owner"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'listing-photos'
    and exists (
      select 1 from public.listings l
      where l.id = public.gafflo_listing_id_from_storage_path(name)
      and l.owner_id = auth.uid()
    )
  );

create policy "listing_photos_delete_owner"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'listing-photos'
    and exists (
      select 1 from public.listings l
      where l.id = public.gafflo_listing_id_from_storage_path(name)
      and l.owner_id = auth.uid()
    )
  );

-- =========================================================================================
-- 7. Guarded lifecycle / image functions
-- =========================================================================================
-- Every status transition and every image mutation goes through one of these SECURITY
-- DEFINER functions rather than a raw client UPDATE/INSERT/DELETE — status, rejection_reason,
-- the *_at lifecycle timestamps and owner_id are excluded from authenticated's column grants
-- entirely (section 8), so this is not merely the *preferred* path, it is the *only* path.
-- Authorization failures use SQLSTATE 42501 (insufficient_privilege) specifically so tests and
-- callers can distinguish "you're not allowed to do this" from "this data isn't valid yet."

create function public.request_listing_review(p_listing_id uuid)
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

comment on function public.request_listing_review(uuid) is
  'The backend-enforced minimum from Part C: required category fields, valid rent/location, '
  'category-consistent occupancy (via the table CHECK constraints), at least one durable '
  'image. Exact character-count bounds are reproduced for title/description; other frontend-only '
  'niceties are not duplicated here on purpose (see the final report).';

create function public.withdraw_listing_from_review(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.listings where id = p_listing_id and owner_id = auth.uid()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  update public.listings set status = 'draft'
  where id = p_listing_id and status = 'pending_verification';
  if not found then
    raise exception 'Listing must be pending_verification to withdraw from review';
  end if;
end;
$$;

create function public.pause_listing(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.listings where id = p_listing_id and owner_id = auth.uid()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  update public.listings set status = 'paused', paused_at = now()
  where id = p_listing_id and status = 'published';
  if not found then
    raise exception 'Listing must be published to pause';
  end if;
end;
$$;

create function public.resume_listing(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.listings where id = p_listing_id and owner_id = auth.uid()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  -- No active-listing-allowance check here: entitlements/subscriptions do not exist yet in
  -- the schema (that is a payments-phase table). Deferred and reported, not silently skipped.
  update public.listings set status = 'published'
  where id = p_listing_id and status = 'paused';
  if not found then
    raise exception 'Listing must be paused to resume';
  end if;
end;
$$;

comment on function public.resume_listing(uuid) is
  'Free active-listing-allowance enforcement is intentionally deferred to the payments/'
  'entitlements phase, which is when a subscriptions/purchases table will actually exist to '
  'check against. Reported explicitly in the final report, not silently omitted.';

create function public.mark_listing_rented(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.listings where id = p_listing_id and owner_id = auth.uid()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  update public.listings set status = 'rented', rented_at = now()
  where id = p_listing_id and status in ('published', 'paused');
  if not found then
    raise exception 'Listing must be published or paused to mark as rented';
  end if;
end;
$$;

comment on function public.mark_listing_rented(uuid) is
  'Rented is terminal at launch: no function transitions a listing out of rented, matching '
  'Phase 1A''s "rented: []" transition graph on the frontend.';

-- ---- moderator-only ----

create function public.moderator_approve_listing(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_caller_moderator() then
    raise exception 'Not authorized: moderator role required' using errcode = '42501';
  end if;
  update public.listings set status = 'published', published_at = now(), rejection_reason = null
  where id = p_listing_id and status = 'pending_verification';
  if not found then
    raise exception 'Listing must be pending_verification to approve';
  end if;
  insert into public.moderation_actions (actor_id, action_type, listing_id)
  values (auth.uid(), 'listing_approved', p_listing_id);
end;
$$;

create function public.moderator_reject_listing(p_listing_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_caller_moderator() then
    raise exception 'Not authorized: moderator role required' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A rejection reason is required';
  end if;
  update public.listings set status = 'rejected', rejection_reason = p_reason
  where id = p_listing_id and status = 'pending_verification';
  if not found then
    raise exception 'Listing must be pending_verification to reject';
  end if;
  insert into public.moderation_actions (actor_id, action_type, listing_id, reason)
  values (auth.uid(), 'listing_rejected', p_listing_id, p_reason);
end;
$$;

create function public.moderator_remove_listing(p_listing_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_caller_moderator() then
    raise exception 'Not authorized: moderator role required' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A removal reason is required';
  end if;
  update public.listings set status = 'removed_by_platform', removed_by_platform_at = now(), removed_reason = p_reason
  where id = p_listing_id and status in ('published', 'paused');
  if not found then
    raise exception 'Listing must be published or paused to remove';
  end if;
  insert into public.moderation_actions (actor_id, action_type, listing_id, reason)
  values (auth.uid(), 'listing_removed', p_listing_id, p_reason);
end;
$$;

comment on function public.moderator_remove_listing(uuid, text) is
  'A distinct terminal-ish state from paused, on purpose: paused means "the landlord did this '
  'themselves", removed_by_platform means "Gafflo removed this" — conflating the two would be a '
  'real trust/communication gap for the landlord (see the architecture plan, section 12).';

create function public.moderator_suspend_user(p_target_profile_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_caller_moderator() then
    raise exception 'Not authorized: moderator role required' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A suspension reason is required';
  end if;
  update public.profiles set platform_status = 'suspended' where id = p_target_profile_id;
  if not found then
    raise exception 'Target profile not found';
  end if;
  insert into public.moderation_actions (actor_id, action_type, target_user_id, reason)
  values (auth.uid(), 'user_suspended', p_target_profile_id, p_reason);
end;
$$;

comment on function public.moderator_suspend_user(uuid, text) is
  'Writes profiles.platform_status directly, running as this function''s (elevated) owner — '
  'exactly the "privileged server context" Phase 1A''s prevent_privileged_profile_changes() '
  'trigger already allows through, since that trigger only blocks current_user = ''authenticated''.';

-- ---- image functions ----

create function public.register_listing_image(
  p_listing_id uuid,
  p_storage_path text,
  p_label public.listing_image_label_t default 'other',
  p_is_cover boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner_id uuid;
  v_object record;
  v_image_count integer;
  v_new_id uuid;
  v_next_position integer;
begin
  select owner_id into v_owner_id from public.listings where id = p_listing_id;
  if v_owner_id is null then
    raise exception 'Listing not found';
  end if;
  if v_owner_id <> auth.uid() then
    raise exception 'Not authorized to add images to this listing' using errcode = '42501';
  end if;

  if public.gafflo_listing_id_from_storage_path(p_storage_path) is distinct from p_listing_id then
    raise exception 'storage_path does not belong to this listing';
  end if;

  -- Cross-check against what Storage itself recorded for the upload, not a client-passed
  -- mime/size value — see the final report for exactly how far this goes and where it stops
  -- short of true magic-byte content inspection.
  select * into v_object from storage.objects
  where bucket_id = 'listing-photos' and name = p_storage_path;
  if not found then
    raise exception 'Uploaded file not found in storage at %', p_storage_path;
  end if;

  select count(*) into v_image_count from public.listing_images where listing_id = p_listing_id;
  if v_image_count >= 8 then
    raise exception 'A listing can have at most 8 photos';
  end if;

  select coalesce(max("position"), -1) + 1 into v_next_position
  from public.listing_images where listing_id = p_listing_id;

  if p_is_cover then
    update public.listing_images set is_cover = false where listing_id = p_listing_id and is_cover;
  end if;

  insert into public.listing_images (listing_id, storage_path, label, "position", is_cover, mime_type, size_bytes)
  values (
    p_listing_id,
    p_storage_path,
    p_label,
    v_next_position,
    p_is_cover or v_image_count = 0,
    coalesce(v_object.metadata ->> 'mimetype', 'application/octet-stream'),
    coalesce((v_object.metadata ->> 'size')::integer, 0)
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

create function public.set_listing_cover_image(p_listing_id uuid, p_image_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.listings where id = p_listing_id and owner_id = auth.uid()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if not exists (select 1 from public.listing_images where id = p_image_id and listing_id = p_listing_id) then
    raise exception 'Image does not belong to this listing';
  end if;
  update public.listing_images set is_cover = false where listing_id = p_listing_id and is_cover;
  update public.listing_images set is_cover = true where id = p_image_id;
end;
$$;

create function public.reorder_listing_images(p_listing_id uuid, p_image_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_idx integer := 0;
  v_total integer;
  v_matching integer;
begin
  if not exists (select 1 from public.listings where id = p_listing_id and owner_id = auth.uid()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select count(*) into v_total from public.listing_images where listing_id = p_listing_id;
  select count(*) into v_matching from public.listing_images where listing_id = p_listing_id and id = any(p_image_ids);
  if v_total <> coalesce(array_length(p_image_ids, 1), 0) or v_total <> v_matching then
    raise exception 'Image list must contain exactly the current images for this listing';
  end if;

  -- Move everything into a temporary negative range first so the unique(listing_id, position)
  -- index never collides mid-reorder.
  update public.listing_images set "position" = -("position" + 1) where listing_id = p_listing_id;

  foreach v_id in array p_image_ids loop
    update public.listing_images set "position" = v_idx where id = v_id;
    v_idx := v_idx + 1;
  end loop;
end;
$$;

create function public.delete_listing_image(p_image_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_listing_id uuid;
  v_storage_path text;
  v_was_cover boolean;
begin
  select listing_id, storage_path, is_cover into v_listing_id, v_storage_path, v_was_cover
  from public.listing_images where id = p_image_id;
  if v_listing_id is null then
    raise exception 'Image not found';
  end if;
  if not exists (select 1 from public.listings where id = v_listing_id and owner_id = auth.uid()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  delete from public.listing_images where id = p_image_id;
  delete from storage.objects where bucket_id = 'listing-photos' and name = v_storage_path;

  if v_was_cover then
    update public.listing_images set is_cover = true
    where id = (select id from public.listing_images where listing_id = v_listing_id order by "position" limit 1);
  end if;
end;
$$;

comment on function public.delete_listing_image(uuid) is
  'The listing_images row and the storage.objects metadata row are deleted atomically, in the '
  'same transaction. The underlying object-storage bytes are then cleaned up by Supabase''s own '
  'Storage service in response to the storage.objects row disappearing — a platform-level '
  'guarantee this migration relies on but cannot independently re-verify without a real '
  'Supabase environment (see the final report). A scheduled sweep for orphaned Storage objects '
  '(e.g. an upload whose finalize call never arrived) is deferred, not built here.';

-- =========================================================================================
-- 8. Column-level grants
-- =========================================================================================
-- Same allowlist discipline as Phase 1A: status, rejection_reason, removed_reason, every
-- *_at lifecycle timestamp, and owner_id are never granted to `authenticated` for UPDATE —
-- only the guarded functions above (running as their elevated owner) can change them. A new
-- column added later is safe by default unless explicitly added to an allowlist.

-- SELECT is deliberately column-restricted, not a blanket table grant — this is the fix for a
-- real gap found during adversarial review (Part Q): listings_select_published makes an
-- entire published ROW visible, and RLS cannot narrow that to a subset of columns on its own.
-- A blanket `grant select on listings to authenticated, anon` would let anyone bypass
-- public_listings entirely and read exact_address/eircode directly from the base table for
-- any published listing. The grant below matches public_listings' column list exactly, so
-- querying the base table directly is no more revealing than querying the view — and it is
-- still necessary despite the view existing, because public_listings has security_invoker =
-- true, which means the *caller's own* privileges on the underlying table are what get
-- checked, not the view owner's. Full-detail access (exact_address, eircode, status,
-- rejection_reason, ...) for an owner's own listings or a moderator's review queue goes
-- through the SECURITY DEFINER functions in section 9 instead, which read with elevated
-- privilege rather than through this restricted grant.
grant select (
  id, owner_id, listing_category, status,
  city, area, approximate_address,
  rent, deposit, bills_included, available_from, min_stay_months,
  property_type, bedrooms, bathrooms, max_occupants,
  parent_property_type, room_type, total_bedrooms, current_household_size, max_household_size,
  bathroom_arrangement, owner_lives_in_property, couples_accepted,
  pets_policy, smoking_policy, furnished, parking, viewing_type,
  amenities, features, listing_rules, household_summary,
  title, description, availability_confirmed_at, created_at, updated_at, published_at
) on public.listings to authenticated, anon;

grant insert (
  owner_id, listing_category, city, area, approximate_address, exact_address, eircode,
  rent, deposit, bills_included, available_from, min_stay_months,
  property_type, bedrooms, bathrooms, max_occupants,
  parent_property_type, room_type, total_bedrooms, current_household_size, max_household_size,
  bathroom_arrangement, owner_lives_in_property, couples_accepted,
  pets_policy, smoking_policy, furnished, parking, viewing_type,
  amenities, features, listing_rules, household_summary, title, description
) on public.listings to authenticated;

grant update (
  listing_category, city, area, approximate_address, exact_address, eircode,
  rent, deposit, bills_included, available_from, min_stay_months,
  property_type, bedrooms, bathrooms, max_occupants,
  parent_property_type, room_type, total_bedrooms, current_household_size, max_household_size,
  bathroom_arrangement, owner_lives_in_property, couples_accepted,
  pets_policy, smoking_policy, furnished, parking, viewing_type,
  amenities, features, listing_rules, household_summary, title, description
) on public.listings to authenticated;
-- Deliberately absent from both grants: id, status, rejection_reason, removed_reason,
-- published_at, paused_at, rented_at, removed_by_platform_at, created_at, updated_at,
-- availability_confirmed_at, and (UPDATE only) owner_id.

grant select on public.listing_images to authenticated, anon;
-- No insert/update/delete grant at all — every write goes through section 7's functions.

-- =========================================================================================
-- 9. Tenant-safe public listing projection
-- =========================================================================================
-- security_invoker = true is the critical part: without it, a view runs with the *view
-- owner's* privileges/RLS context (effectively security-definer-like), which would silently
-- bypass the underlying table's own RLS. With it, the view respects the querying user's real
-- auth context, so listings_select_published still applies underneath — this view's WHERE
-- clause and the base table's RLS end up enforcing the same "published only" rule twice,
-- which is intentional defense in depth, not redundancy to clean up. Its actual job is the
-- *column* restriction: excluding exact_address, eircode, rejection_reason, removed_reason,
-- and every internal moderation/lifecycle-timestamp field, none of which belong in a
-- tenant-facing Browse/Details/Smart Match projection just because the row itself is public.

create view public.public_listings
with (security_invoker = true) as
select
  id, owner_id, listing_category,
  city, area, approximate_address,
  rent, deposit, bills_included, available_from, min_stay_months,
  property_type, bedrooms, bathrooms, max_occupants,
  parent_property_type, room_type, total_bedrooms, current_household_size, max_household_size,
  bathroom_arrangement, owner_lives_in_property, couples_accepted,
  pets_policy, smoking_policy, furnished, parking, viewing_type,
  amenities, features, listing_rules, household_summary,
  title, description,
  availability_confirmed_at, created_at, updated_at, published_at
from public.listings
where status = 'published';

comment on view public.public_listings is
  'The only surface anon should ever query for listings — see the grants below. Deliberately '
  'excludes exact_address/eircode/rejection_reason/removed_reason/internal timestamps.';

grant select on public.public_listings to authenticated, anon;

-- Full-detail reads (exact_address, eircode, status, rejection_reason, every internal field)
-- for the two contexts that legitimately need them: a landlord looking at their own listing,
-- and a moderator reviewing someone else's. Both run SECURITY DEFINER specifically so they can
-- read columns the restricted grant above does not expose to authenticated at all — the
-- authorization check inside each function is what keeps this safe, not the (now-narrowed)
-- table grant.

create function public.get_my_listing(p_listing_id uuid)
returns public.listings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_listing public.listings;
begin
  select * into v_listing from public.listings where id = p_listing_id and owner_id = auth.uid();
  if not found then
    raise exception 'Not authorized, or listing not found' using errcode = '42501';
  end if;
  return v_listing;
end;
$$;

create function public.get_my_listings()
returns setof public.listings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query select * from public.listings where owner_id = auth.uid();
end;
$$;

create function public.get_listing_for_moderation(p_listing_id uuid)
returns public.listings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_listing public.listings;
begin
  if not public.is_caller_moderator() then
    raise exception 'Not authorized: moderator role required' using errcode = '42501';
  end if;
  select * into v_listing from public.listings where id = p_listing_id;
  if not found then
    raise exception 'Listing not found';
  end if;
  return v_listing;
end;
$$;

comment on function public.get_my_listing(uuid) is
  'A landlord''s own full-detail read path — exact_address, eircode, status, rejection_reason '
  'and everything else, for a listing they own in any lifecycle state. Not the base table grant.';
comment on function public.get_listing_for_moderation(uuid) is
  'A moderator''s full-detail read path for reviewing any listing regardless of owner or status.';

-- =========================================================================================
-- 10. moderation_actions — minimal audit trail
-- =========================================================================================
-- No grant to authenticated or anon at all, in either direction: this phase has no admin UI
-- to read it, so there is no reason to expose a read path yet, and every write already goes
-- exclusively through the SECURITY DEFINER moderator_* functions above regardless of grants.
-- Kept intentionally small — actor, what, on what, why, when. A generic cross-cutting
-- admin_activity_log is deferred until admin actions expand beyond moderation (see the
-- architecture plan, section 3) — not built speculatively here.

create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles (id),
  action_type text not null check (
    action_type in ('listing_approved', 'listing_rejected', 'listing_removed', 'user_suspended', 'user_banned')
  ),
  listing_id uuid references public.listings (id) on delete set null,
  target_user_id uuid references public.profiles (id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

alter table public.moderation_actions enable row level security;
-- No policies at all — RLS enabled with zero policies means zero access for any client role,
-- by design, at this phase.

-- =========================================================================================
-- 11. Timestamp integrity / lifecycle-protection triggers
-- =========================================================================================

create function public.listings_before_update()
returns trigger
language plpgsql
as $$
begin
  if new.available_from is distinct from old.available_from then
    new.availability_confirmed_at = now();
  end if;
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.listings_before_update() is
  'Mirrors the frontend rule that availability_confirmed_at only refreshes when available_from '
  'actually changes — now a real trigger instead of frontend-only logic.';

create trigger listings_set_updated_at
  before update on public.listings
  for each row
  execute function public.listings_before_update();

-- listing_images deliberately has no updated_at column: rows are effectively immutable
-- metadata, and the two mutable operations (cover, position) go through their own guarded
-- functions above, which have no need to read a generic updated_at afterward.

-- Defense in depth (matches Phase 1A's rationale for prevent_privileged_profile_changes()):
-- authenticated never has UPDATE grant on any of these columns in the first place, so this
-- only guards against a *future* migration mistake re-opening one of them.

create function public.prevent_direct_listing_lifecycle_changes()
returns trigger
language plpgsql
as $$
begin
  if current_user = 'authenticated' and (
    new.status is distinct from old.status
    or new.rejection_reason is distinct from old.rejection_reason
    or new.removed_reason is distinct from old.removed_reason
    or new.published_at is distinct from old.published_at
    or new.paused_at is distinct from old.paused_at
    or new.rented_at is distinct from old.rented_at
    or new.removed_by_platform_at is distinct from old.removed_by_platform_at
    or new.owner_id is distinct from old.owner_id
  ) then
    raise exception 'Listing lifecycle/ownership fields can only change through a guarded function' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger listings_protect_lifecycle_fields
  before update on public.listings
  for each row
  execute function public.prevent_direct_listing_lifecycle_changes();

create function public.prevent_category_change_once_live()
returns trigger
language plpgsql
as $$
begin
  if new.listing_category is distinct from old.listing_category and old.status not in ('draft', 'rejected') then
    raise exception 'listing_category cannot change once a listing has left draft/rejected status';
  end if;
  return new;
end;
$$;

comment on function public.prevent_category_change_once_live() is
  'Closes a narrow gap: without this, a landlord could get a simple listing approved, then '
  'silently swap it to a different category post-approval. Category changes stay unrestricted '
  'while still draft/rejected, matching the frontend''s own changeCategory() behaviour there.';

create trigger listings_protect_category_once_live
  before update on public.listings
  for each row
  execute function public.prevent_category_change_once_live();

create function public.enforce_listing_image_limit()
returns trigger
language plpgsql
as $$
begin
  if (select count(*) from public.listing_images where listing_id = new.listing_id) >= 8 then
    raise exception 'A listing can have at most 8 photos';
  end if;
  return new;
end;
$$;

comment on function public.enforce_listing_image_limit() is
  'Defense in depth alongside register_listing_image()''s own count check — authenticated has '
  'no INSERT grant on listing_images at all today, so this only matters if that ever changes.';

create trigger listing_images_enforce_limit
  before insert on public.listing_images
  for each row
  execute function public.enforce_listing_image_limit();
