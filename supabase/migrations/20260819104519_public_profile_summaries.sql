-- =========================================================================================
-- Public profile identity patch — smallest safe surface for one user to read another user's
-- public display identity (name + avatar only).
--
-- Motivation: the Integration Readiness Audit found that profiles RLS (`profiles_select_own`,
-- Phase 1A) correctly allows a caller to read only their own row, which means a tenant/landlord
-- currently has NO way to learn a conversation counterpart's name, a viewing counterpart's name,
-- or a listing owner's name — even though the frozen frontend already renders exactly this
-- (PropertyDetailsModal.jsx: "This listing is managed by ${property.ownerName}"). A live
-- PostgREST embed of conversations -> profiles(landlord) against gafflo-dev confirmed this
-- resolves to `null`, not an error — a worse trap for a frontend than an explicit failure.
--
-- This migration adds exactly one function. It does not touch profiles RLS, does not add a
-- broad SELECT grant, and does not create a profiles view — the existing `profiles_select_own`
-- policy and the existing column-level grants from Phase 1A are untouched.
-- =========================================================================================

-- =========================================================================================
-- API shape decision: batch-only, no separate single-id convenience function.
--
-- The audit's three concrete callers are: (a) a listing detail view resolving one owner id,
-- (b) a messaging inbox resolving one counterpart id per conversation (N conversations per
-- page), and (c) a viewings list resolving one counterpart id per proposal (N proposals per
-- page). (b) and (c) are exactly the N+1 shape the audit flagged; (a) is the degenerate
-- single-element case of the same call. A batched `uuid[] -> setof` function covers all three
-- with one round trip each (inbox/viewings pass their full id list; the listing detail view
-- passes a one-element array), so a second, single-id function would only duplicate the same
-- query body for no caller that actually needs it — the exact kind of unjustified extra surface
-- this patch is supposed to avoid adding. Hence: one function, not two.
-- =========================================================================================

-- =========================================================================================
-- display_name resolution: landlord_profiles.display_name (when it exists) takes priority over
-- profiles.display_name, never the other way round.
--
-- This is not a new design choice — Phase 1A's own landlord_profiles comment already documents
-- landlord_profiles.display_name as "the PUBLIC, listing-facing name shown to tenants...
-- deliberately distinct from profiles.display_name, which is the account-level identity name...
-- a landlord may reasonably want those to differ (e.g. not showing a full legal name to
-- strangers who enquire)". A public-identity function that ignored this and returned
-- profiles.display_name for landlords would silently defeat that existing privacy intent.
-- tenant_profiles has no display_name column at all (by design, per the same migration), so a
-- tenant's public name is always profiles.display_name — the same source create_application()
-- already freezes into tenant_snapshot.display_name for applicant cards.
--
-- avatar_url has only ever existed on profiles (landlord_profiles has no avatar column), so it
-- is never ambiguous.
-- =========================================================================================

-- =========================================================================================
-- Status privacy: deliberately does NOT filter or branch on platform_status. Excluding
-- suspended/banned targets from the result set would leak their status by omission to any
-- caller who already knows the id is real (e.g. an existing conversation partner) — a silent
-- missing row is read as "this account's status changed" exactly as surely as an explicit flag
-- would be. Every existing, non-deleted profile is treated identically regardless of standing.
--
-- deleted_at IS respected: it is the one column Phase 1A defined specifically to mean "this
-- identity should no longer be surfaced," is never set anywhere in the schema today, and costs
-- one WHERE clause to honour correctly now rather than needing a follow-up migration later.
-- =========================================================================================

create function public.get_public_profile_summaries(p_profile_ids uuid[])
returns table (
  id uuid,
  display_name text,
  avatar_url text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_ids uuid[];
  v_max_ids constant int := 200;
begin
  select array_agg(distinct x) into v_ids
  from unnest(p_profile_ids) as x
  where x is not null;

  if v_ids is null then
    return;
  end if;

  if array_length(v_ids, 1) > v_max_ids then
    raise exception 'Too many profile ids requested (max %)', v_max_ids;
  end if;

  return query
    select
      p.id,
      coalesce(lp.display_name, p.display_name) as display_name,
      p.avatar_url
    from public.profiles p
    left join public.landlord_profiles lp on lp.profile_id = p.id
    where p.id = any (v_ids)
      and p.deleted_at is null;
end;
$$;

comment on function public.get_public_profile_summaries(uuid[]) is
  'The only safe way for one authenticated user to read another user''s public display '
  'identity. Returns exactly (id, display_name, avatar_url) for each existing, non-deleted '
  'profile id in the input (deduplicated, unknown/malformed-but-valid-uuid ids simply absent '
  'from the result, no error). Never returns email/phone/platform_role/platform_status/'
  'last_active_role/tenant or landlord profile detail/moderation state. display_name prefers '
  'landlord_profiles.display_name (the public listing-facing name) over profiles.display_name '
  '(the account-level name) when a landlord_profiles row exists, matching the distinction '
  'already documented in Phase 1A. SECURITY DEFINER so it can read rows RLS would otherwise '
  'hide from any caller who is not that row''s owner — the function body is the entire '
  'authorization boundary, so it must never be widened to select additional columns.';

revoke execute on function public.get_public_profile_summaries(uuid[]) from public;
grant execute on function public.get_public_profile_summaries(uuid[]) to authenticated;
-- Deliberately no grant to anon: public identity lookups are only needed from within
-- authenticated flows (messaging, viewings, listing detail while browsing as a signed-in
-- user); anon browsing already gets everything it needs from public_listings, which has never
-- exposed an owner name and is not changed by this migration.
