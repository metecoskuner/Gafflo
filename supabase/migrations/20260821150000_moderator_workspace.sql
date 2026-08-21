-- Gafflo backend — Stage K: the first usable moderator workspace.
--
-- Every action RPC this stage's UI calls already exists and is already tested:
-- moderator_approve_listing/moderator_reject_listing/moderator_remove_listing (Phase 1B),
-- list_listing_reports/resolve_listing_report (Stage J1). This migration adds exactly the two
-- pieces that were genuinely missing to make that capability reachable from a real UI:
--   1. am_i_moderator() — a narrow boolean read, so the frontend never needs a broad client-
--      readable grant on profiles.platform_role to decide whether to render a moderator entry
--      point or gate the /moderator route.
--   2. list_listings_pending_review() — there was no "list everything waiting for review" RPC;
--      get_listing_for_moderation() (Phase 1B) only ever took one specific listing id.
-- No existing function's grants, control flow, or semantics are touched.

-- =========================================================================================
-- 1. am_i_moderator() — a narrow, safe-to-call read. Reveals nothing beyond "yes/no", but still
-- follows this schema's now-standard explicit-guard/explicit-grant discipline rather than
-- relying on is_caller_moderator() returning false for anon as the only protection.
-- =========================================================================================

create function public.am_i_moderator()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return public.is_caller_moderator();
end;
$$;

comment on function public.am_i_moderator() is
  'Narrow read so the frontend can decide whether to show a moderator entry point / gate the '
  '/moderator route without a broad client-readable grant on profiles.platform_role.';

revoke execute on function public.am_i_moderator() from public;
grant execute on function public.am_i_moderator() to authenticated;

-- =========================================================================================
-- 2. list_listings_pending_review() — the real review queue. Full listing rows: a moderator
-- reviewing a specific pending listing legitimately needs everything on it (exact_address,
-- eircode included), exactly like get_listing_for_moderation()'s own precedent for one id.
-- =========================================================================================

create function public.list_listings_pending_review()
returns setof public.listings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if not public.is_caller_moderator() then
    raise exception 'Not authorized: moderator role required' using errcode = '42501';
  end if;

  return query
    select * from public.listings
    where status = 'pending_verification'
    order by created_at asc;
end;
$$;

comment on function public.list_listings_pending_review() is
  'Moderator-only. The listing review queue: every listing currently awaiting a moderator '
  'decision, oldest first. Does not change moderator_approve_listing()/moderator_reject_listing()/'
  'moderator_remove_listing() at all — this only adds the missing "list them" read.';

revoke execute on function public.list_listings_pending_review() from public;
grant execute on function public.list_listings_pending_review() to authenticated;
