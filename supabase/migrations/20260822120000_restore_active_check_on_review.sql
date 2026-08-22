-- Gafflo backend — Stage O: restore a regressed check on request_listing_review().
--
-- request_listing_review() was create-or-replace'd twice: once by
-- 20260818201747_enforce_platform_status.sql (added an is_caller_active() check, blocking
-- suspended/banned landlords from requesting review) and again by
-- 20260821130000_legal_trust_safety.sql (added the Fair Housing acknowledgement gate). The
-- second migration's own comment claims it is "byte-for-byte unchanged" apart from the new
-- check, but it was actually written on top of the *original* (pre-platform-status) function
-- body, silently dropping the is_caller_active() check in the process. Every other
-- platform-status-gated RPC (register_listing_image, resume_listing, pause_listing, etc.) still
-- has its check; only this one function lost it. This migration restores it and nothing else —
-- the Fair Housing gate and every readiness check below it are untouched.

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
