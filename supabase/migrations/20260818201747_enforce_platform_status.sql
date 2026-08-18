-- =========================================================================================
-- Phase 1D: make profiles.platform_status meaningful across the currently-implemented
-- profile/listing/storage surface. Applications/messages/viewings/payments do not exist yet,
-- so no rules are added for them here. This migration is additive only — it uses ALTER POLICY
-- and CREATE OR REPLACE FUNCTION on top of Phase 1A/1B/1C, never rewriting a migration file.
--
-- Design summary (full reasoning in the Phase 1D report):
--   ACTIVE     — unrestricted, exactly as before.
--   SUSPENDED  — keeps read access to their own data (explicitly required), loses every write
--                that *increases* marketplace exposure or creates a new trust surface: creating
--                a listing, requesting review, resuming a paused listing back to published,
--                managing listing photos, and creating a new tenant_profiles/landlord_profiles
--                row. Actions that only *reduce* exposure — withdrawing from review, pausing a
--                published listing, marking a listing rented — are deliberately left ungated,
--                since blocking those would trap a suspended landlord in a more public state
--                than before, which is the opposite of the intent.
--   BANNED     — everything SUSPENDED loses, plus the public marketplace browse surface itself
--                (a banned user still fetching their own past listings for account-support/
--                legal reasons is preserved; browsing *other* landlords' published listings is
--                not — "no public interaction capabilities").
--
-- Two new SECURITY INVOKER helpers, matching the existing is_caller_moderator() pattern (a
-- plain self-lookup against profiles, readable via the caller's own profiles_select_own policy
-- — no elevated privilege needed since a caller can always read their own row).
-- =========================================================================================

create or replace function public.is_caller_active()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and platform_status = 'active'
  );
$$;

comment on function public.is_caller_active() is
  'True only when the caller has a profiles row with platform_status = ''active''. Used to gate '
  'every marketplace write that increases exposure or creates a new trust surface.';

-- SECURITY DEFINER, unlike is_caller_moderator()/is_caller_active(): those are only ever
-- invoked from a policy scoped `TO authenticated` (which already has SELECT on profiles) or
-- from inside an already-SECURITY DEFINER RPC (which runs as postgres regardless of the
-- invoker's own grants). is_caller_banned() is invoked from the *published* read policies,
-- which are scoped `TO anon, authenticated` — and anon has no SELECT grant on profiles at all
-- (by design, from Phase 1A). A plain SECURITY INVOKER version would fail outright for anon
-- with "permission denied for table profiles" on every single published-listing read, breaking
-- anonymous browsing entirely — caught by re-running the Phase 1B pgTAP suite against this
-- migration, not found by inspection. SECURITY DEFINER is safe here because the function only
-- ever resolves the caller's *own* auth.uid() (never an arbitrary id), and for anon that is
-- null — profiles.id is NOT NULL, so `id = null` structurally matches nothing, correctly
-- returning false without needing any row to exist.
create or replace function public.is_caller_banned()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and platform_status = 'banned'
  );
$$;

comment on function public.is_caller_banned() is
  'True only when the caller has a profiles row with platform_status = ''banned''. SECURITY '
  'DEFINER so it works for anon (no SELECT grant on profiles) inside the published-read '
  'policies, not just authenticated. Used to cut the public marketplace browse surface for '
  'banned accounts, on top of the write restrictions is_caller_active() already causes.';

-- ---- is_caller_moderator() must not grant moderator power to a suspended/banned moderator ----
--
-- A moderator badge (platform_role) and account standing (platform_status) are independent
-- fields; nothing before this migration linked them, so a moderator who was themselves
-- suspended or banned would have kept full moderation power. That contradicts "make
-- platform_status meaningful" — moderation is the single most trust-sensitive capability in
-- this schema. service_role/postgres access to moderator_* functions is unaffected (those never
-- go through is_caller_moderator() as a real client role; they already bypass RLS via
-- BYPASSRLS and are covered separately by Phase 1C's grant fix).
create or replace function public.is_caller_moderator()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and platform_role in ('moderator', 'admin') and platform_status = 'active'
  );
$$;

-- =========================================================================================
-- RLS: gate the write-side policies that create new marketplace exposure, and cut the banned
-- browse path on the read-side published policies. Every ALTER POLICY below replaces the
-- policy's full USING/WITH CHECK expression; nothing else about the policy (role, command)
-- changes.
-- =========================================================================================

alter policy listings_insert_own_draft on public.listings
  with check (owner_id = auth.uid() and public.is_caller_active());

-- USING stays owner-only so a suspended/banned owner's UPDATE still finds their own row (and
-- gets a clear RLS violation from WITH CHECK) rather than a confusing "0 rows matched".
alter policy listings_update_own on public.listings
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and public.is_caller_active());

alter policy listings_select_published on public.listings
  using (status = 'published' and not public.is_caller_banned());

alter policy tenant_profiles_insert_own on public.tenant_profiles
  with check (profile_id = auth.uid() and public.is_caller_active());

alter policy landlord_profiles_insert_own on public.landlord_profiles
  with check (profile_id = auth.uid() and public.is_caller_active());

-- public_listings has security_invoker = true and no WHERE-clause changes needed: it relies on
-- the caller's own RLS on the base table, so gating listings_select_published above already
-- closes the view for a banned caller without touching the view definition at all.

alter policy listing_images_select_published on public.listing_images
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_images.listing_id and l.status = 'published'
    )
    and not public.is_caller_banned()
  );

alter policy listing_photos_read_published on storage.objects
  using (
    bucket_id = 'listing-photos'
    and exists (
      select 1 from public.listings l
      where l.id = public.gafflo_listing_id_from_storage_path(objects.name)
        and l.status = 'published'
    )
    and not public.is_caller_banned()
  );

-- =========================================================================================
-- Guarded RPCs: add an active-account check alongside each function's existing ownership
-- check, for every write that increases marketplace exposure or manages listing photos.
-- withdraw_listing_from_review, pause_listing and mark_listing_rented are deliberately left
-- unchanged — see the design summary above.
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
  if not public.is_caller_active() then
    raise exception 'Account is not active' using errcode = '42501';
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

create or replace function public.resume_listing(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.listings where id = p_listing_id and owner_id = auth.uid()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if not public.is_caller_active() then
    raise exception 'Account is not active' using errcode = '42501';
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

create or replace function public.register_listing_image(
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
  if not public.is_caller_active() then
    raise exception 'Account is not active' using errcode = '42501';
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

create or replace function public.set_listing_cover_image(p_listing_id uuid, p_image_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.listings where id = p_listing_id and owner_id = auth.uid()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if not public.is_caller_active() then
    raise exception 'Account is not active' using errcode = '42501';
  end if;
  if not exists (select 1 from public.listing_images where id = p_image_id and listing_id = p_listing_id) then
    raise exception 'Image does not belong to this listing';
  end if;
  update public.listing_images set is_cover = false where listing_id = p_listing_id and is_cover;
  update public.listing_images set is_cover = true where id = p_image_id;
end;
$$;

create or replace function public.reorder_listing_images(p_listing_id uuid, p_image_ids uuid[])
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
  if not public.is_caller_active() then
    raise exception 'Account is not active' using errcode = '42501';
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

-- =========================================================================================
-- moderator_ban_user() / moderator_reactivate_user(): making platform_status meaningful is
-- incomplete without a moderator being able to actually reach 'banned' and come back from
-- either restricted state. Phase 1B only ever added moderator_suspend_user(); moderation_actions
-- already had 'user_banned' in its action_type CHECK constraint (never used until now — a sign
-- this was anticipated, not scope creep) but nothing to represent lifting a restriction, so
-- 'user_reactivated' is added to that same constraint below.
-- =========================================================================================

alter table public.moderation_actions drop constraint moderation_actions_action_type_check;
alter table public.moderation_actions add constraint moderation_actions_action_type_check
  check (action_type in (
    'listing_approved', 'listing_rejected', 'listing_removed',
    'user_suspended', 'user_banned', 'user_reactivated'
  ));

create function public.moderator_ban_user(p_target_profile_id uuid, p_reason text)
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
    raise exception 'A ban reason is required';
  end if;
  update public.profiles set platform_status = 'banned' where id = p_target_profile_id;
  if not found then
    raise exception 'Target profile not found';
  end if;
  insert into public.moderation_actions (actor_id, action_type, target_user_id, reason)
  values (auth.uid(), 'user_banned', p_target_profile_id, p_reason);
end;
$$;

comment on function public.moderator_ban_user(uuid, text) is
  'Writes profiles.platform_status = ''banned'' directly, running as this function''s (elevated) '
  'owner — the same privileged-server-context pattern moderator_suspend_user() already used.';

-- Deliberately unconditional (works regardless of the target''s current status, including a
-- harmless no-op on an already-active account) — reactivating covers both suspended and banned,
-- and there is no reason to special-case which restricted state someone is coming back from.
create function public.moderator_reactivate_user(p_target_profile_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_caller_moderator() then
    raise exception 'Not authorized: moderator role required' using errcode = '42501';
  end if;
  update public.profiles set platform_status = 'active' where id = p_target_profile_id;
  if not found then
    raise exception 'Target profile not found';
  end if;
  insert into public.moderation_actions (actor_id, action_type, target_user_id, reason)
  values (auth.uid(), 'user_reactivated', p_target_profile_id, p_reason);
end;
$$;

comment on function public.moderator_reactivate_user(uuid, text) is
  'Sets profiles.platform_status back to ''active'' from either ''suspended'' or ''banned''. '
  'p_reason is optional, unlike moderator_suspend_user()/moderator_ban_user() — lifting a '
  'restriction is logged the same way either way, but is not required to justify.';

-- delete_listing_image is gated too: preserves state for moderation review rather than letting
-- a suspended/banned landlord remove evidence, and keeps the whole image-management surface
-- (register/cover/reorder/delete) consistently gated as one unit.
create or replace function public.delete_listing_image(p_image_id uuid)
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
  if not public.is_caller_active() then
    raise exception 'Account is not active' using errcode = '42501';
  end if;

  delete from public.listing_images where id = p_image_id;

  set local storage.allow_delete_query = 'true';
  delete from storage.objects where bucket_id = 'listing-photos' and name = v_storage_path;

  if v_was_cover then
    update public.listing_images set is_cover = true
    where id = (select id from public.listing_images where listing_id = v_listing_id order by "position" limit 1);
  end if;
end;
$$;
