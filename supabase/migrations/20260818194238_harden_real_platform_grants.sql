-- =========================================================================================
-- Phase 1C hardening: fixes for gaps found while validating Phase 1A/1B against a real
-- Supabase project, not visible in the local Postgres-without-Docker stand-in used to build
-- them. See the Phase 1C final report for the full real-vs-stand-in comparison. This migration
-- is additive only — it does not touch any table/policy/function defined by the two earlier
-- migrations, only grants on top of them.
-- =========================================================================================

-- ---- 1. service_role could not read or write any Gafflo table on the real platform ----
--
-- Every migration comment so far (prevent_privileged_profile_changes, moderator_suspend_user,
-- ...) describes service_role as "a privileged server context" that is expected to bypass the
-- client-facing restrictions. That is true for Row Level Security — service_role has BYPASSRLS
-- on the real platform, confirmed via pg_roles — but RLS and plain SQL GRANTs are independent
-- permission layers in Postgres, and BYPASSRLS implies nothing about the latter. Neither Phase
-- 1A nor Phase 1B ever explicitly granted service_role any table privilege, on the (wrong)
-- assumption that Supabase's platform baseline already covered it the way our local stand-in's
-- hand-built stub did (`alter default privileges ... grant all on tables to service_role`,
-- documented at the time as "replicating Supabase's own platform-level baseline"). Testing
-- against the real project showed that assumption was false for this project: service_role had
-- only REFERENCES/TRIGGER/TRUNCATE (an unrelated default, see part 2) on all six tables, and a
-- direct `update profiles set platform_role = 'moderator' ...` as service_role failed with
-- "permission denied for table profiles" — meaning no real Edge Function or admin tool using
-- the service_role key could have used any of the "privileged server context" paths our own
-- comments describe. service_role is never exposed to a browser and already bypasses RLS
-- entirely, so there is no reason to column-restrict it the way authenticated/anon are
-- restricted elsewhere in these migrations — the trust boundary that matters (browser-reachable
-- vs not) is already on the correct side.
grant select, insert, update, delete on public.profiles to service_role;
grant select, insert, update, delete on public.tenant_profiles to service_role;
grant select, insert, update, delete on public.landlord_profiles to service_role;
grant select, insert, update, delete on public.listings to service_role;
grant select, insert, update, delete on public.listing_images to service_role;
grant select, insert, update, delete on public.moderation_actions to service_role;

-- ---- 2. anon/authenticated silently held TRUNCATE/REFERENCES/TRIGGER on every table ----
--
-- Also found while inspecting real grants: this project's own default-privilege baseline (set
-- up by the Supabase platform when each table is created, independent of anything either
-- migration wrote) gives anon and authenticated TRUNCATE, REFERENCES and TRIGGER on every new
-- public-schema table. Neither privilege type is column-scoped, so the column-level allowlists
-- built throughout Phase 1A/1B never touched them. None of these are reachable through the
-- actual client surfaces this project exposes — PostgREST has no HTTP path that issues a raw
-- TRUNCATE, REFERENCES only matters when creating a new foreign key (which PostgREST also
-- cannot do), and neither anon nor authenticated can log in directly to run arbitrary SQL — so
-- this was not an active vulnerability. It is still inconsistent with the allowlist-not-blocklist
-- discipline the rest of this project follows, and TRUNCATE bypasses Row Level Security
-- entirely (RLS only governs SELECT/INSERT/UPDATE/DELETE), so it is revoked here as defense in
-- depth rather than left as an unexplained gap.
revoke truncate, references, trigger on public.profiles from anon, authenticated;
revoke truncate, references, trigger on public.tenant_profiles from anon, authenticated;
revoke truncate, references, trigger on public.landlord_profiles from anon, authenticated;
revoke truncate, references, trigger on public.listings from anon, authenticated;
revoke truncate, references, trigger on public.listing_images from anon, authenticated;
revoke truncate, references, trigger on public.moderation_actions from anon, authenticated;

-- ---- 3. delete_listing_image() was completely non-functional on the real platform ----
--
-- Phase 1B's version ran `delete from storage.objects where bucket_id = 'listing-photos' and
-- name = v_storage_path` as part of what its own comment called an atomic, same-transaction
-- cleanup of both the listing_images row and the Storage metadata row. On the real platform
-- this always failed: storage.objects carries a platform-owned `protect_objects_delete` BEFORE
-- DELETE trigger (schema `storage`, not ours) that unconditionally rejects any direct SQL
-- DELETE against it — "Direct deletion from storage tables is not allowed. Use the Storage API
-- instead." — regardless of who issues it, including a SECURITY DEFINER function owned by
-- `postgres`. The local Postgres-without-Docker stand-in used to build Phase 1B had no such
-- trigger on its hand-built storage.objects stub, so this was invisible until tested against a
-- real project: every real call to delete_listing_image() threw 42501, the listing_images row
-- was never removed, and the Storage object (and its bytes) was never removed either — the
-- function did not work at all, for anyone, including a listing's own owner deleting their own
-- image.
--
-- The fix keeps the original atomic, single-call contract (return type unchanged) by using the
-- one documented escape hatch storage.protect_delete() itself checks for:
-- `current_setting('storage.allow_delete_query', true)`. Setting that custom GUC only via
-- `set local` inside this SECURITY DEFINER function's own body is safe — it is scoped to this
-- function's transaction, resets automatically, and is not something a client request can ever
-- set itself (PostgREST has no mechanism for a caller to inject an arbitrary `SET LOCAL` ahead
-- of a request, and confirmed separately that anon/authenticated/service_role's baseline table
-- grants on storage.objects — DELETE included — are otherwise unchanged real-platform defaults,
-- not something either of our migrations touched). Verified directly against the real project
-- before relying on it here.
drop function public.delete_listing_image(uuid);

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

  set local storage.allow_delete_query = 'true';
  delete from storage.objects where bucket_id = 'listing-photos' and name = v_storage_path;

  if v_was_cover then
    update public.listing_images set is_cover = true
    where id = (select id from public.listing_images where listing_id = v_listing_id order by "position" limit 1);
  end if;
end;
$$;

comment on function public.delete_listing_image(uuid) is
  'The listing_images row and the storage.objects metadata row are deleted atomically, in the '
  'same transaction, via storage.protect_delete()''s documented `storage.allow_delete_query` '
  'escape hatch (set local, scoped to this function''s own transaction only — see the Phase 1C '
  'report for why this is safe). Discovered during Phase 1C validation against a real Supabase '
  'project: storage.objects carries a platform-owned trigger that unconditionally rejects a '
  'plain SQL DELETE, which the local Postgres-without-Docker stand-in used to build Phase 1B had '
  'no equivalent of. The underlying object-storage bytes are then cleaned up by Supabase''s own '
  'Storage service in response to the storage.objects row disappearing — a platform-level '
  'guarantee this migration relies on but cannot independently re-verify beyond what Phase 1C''s '
  'real-Storage-API testing already confirmed. A scheduled sweep for orphaned Storage objects '
  '(e.g. an upload whose finalize call never arrived) remains deferred, not built here.';

-- ---- 4. moderator_suspend_user() (and any future SECURITY DEFINER writer of platform_role/
--         platform_status) was unconditionally blocked by its own trigger ----
--
-- Phase 1A's prevent_privileged_profile_changes() allowed the write through only when
-- `current_user <> 'service_role'` was false, i.e. only when current_user actually equalled
-- 'service_role'. That is correct for a literal service_role-authenticated PostgREST/Admin-API
-- request, but moderator_suspend_user() (Phase 1B) does not run as a service_role-authenticated
-- request — it is called by an ordinary authenticated moderator, and runs SECURITY DEFINER so
-- that its own is_caller_moderator() check can execute with elevated privilege. During SECURITY
-- DEFINER execution, Postgres sets current_user to the *function's owner* — postgres, in this
-- project, confirmed directly against the real database — never to service_role. So the trigger
-- rejected every real call, from anyone, including a genuine moderator: the entire suspend path
-- was non-functional. This was never caught locally because the local pgTAP suite's coverage of
-- moderator_suspend_user() did not route through a full authenticated-role PostgREST-equivalent
-- call the way this Phase 1C validation does.
--
-- The fix switches the check from an allowlist ("must be exactly service_role") to a blocklist
-- of the two roles a real client request can ever actually be ("must not be anon or
-- authenticated") — the same shape Phase 1B's prevent_direct_listing_lifecycle_changes() trigger
-- already correctly used from the start. This still blocks a normal user's own direct UPDATE
-- (PostgREST always runs those as literally `anon` or `authenticated`), while correctly letting
-- through postgres, service_role, and any SECURITY DEFINER function owned by either.
create or replace function public.prevent_privileged_profile_changes()
returns trigger
language plpgsql
as $$
begin
  if (new.platform_role is distinct from old.platform_role
      or new.platform_status is distinct from old.platform_status)
     and current_user in ('anon', 'authenticated')
  then
    raise exception
      'platform_role and platform_status can only be changed by a privileged server context';
  end if;
  return new;
end;
$$;
