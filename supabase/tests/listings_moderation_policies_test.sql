-- Phase 1B RLS/policy tests — real pgTAP tests run by `supabase test db` against a real local
-- Postgres instance. Everything runs inside one transaction and rolls back at the end.
--
-- These require Docker (`supabase start`) to actually execute. See the final report for what
-- could and could not be run in this environment.

begin;

create extension if not exists pgtap with schema extensions;

select plan(60);

-- =========================================================================================
-- Helpers — same pattern as rls_policies_test.sql.
-- =========================================================================================

create function pg_temp.authenticate_as(p_user_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create function pg_temp.authenticate_as_anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', ''::text, true);
  perform set_config('role', 'anon', true);
end;
$$;

create function pg_temp.authenticate_as_test_runner() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', ''::text, true);
  reset role;
end;
$$;

-- =========================================================================================
-- Fixtures: two landlords, one moderator, one ordinary (tenant-like) user.
-- =========================================================================================

select pg_temp.authenticate_as_test_runner();

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'landlord-a@example.test'),
  ('b0000000-0000-0000-0000-00000000000b', 'landlord-b@example.test'),
  ('c0000000-0000-0000-0000-00000000000c', 'moderator@example.test'),
  ('d0000000-0000-0000-0000-00000000000d', 'tenant@example.test');

-- Only service_role may set platform_role, even for the test-runner — the same trigger that
-- protects this in production applies here too, so this fixture setup has to go through it
-- honestly rather than working around it.
set local role service_role;
update public.profiles set platform_role = 'moderator' where id = 'c0000000-0000-0000-0000-00000000000c';
reset role;

-- A helper that builds one fully review-ready draft owned by whichever user is currently
-- authenticated, and registers exactly one durable image for it. Used by several tests below
-- so each one does not have to re-derive "a complete listing" from scratch.
create function pg_temp.make_ready_draft(p_owner uuid, p_title text default 'Bright two-bedroom apartment in Rathmines')
returns uuid
language plpgsql as $$
declare
  v_listing_id uuid;
  v_path text;
begin
  insert into public.listings (
    owner_id, listing_category, city, area, rent, deposit, available_from, min_stay_months,
    property_type, bedrooms, bathrooms, max_occupants, title, description
  ) values (
    p_owner, 'entire_property', 'Dublin', 'Rathmines', 1800, 1800, current_date + 30, 6,
    'apartment', 2, 1.0, 3,
    p_title,
    'A genuinely lovely two bedroom apartment close to the village, with easy access to the city centre and public transport.'
  ) returning id into v_listing_id;

  v_path := v_listing_id::text || '/cover.jpg';
  insert into storage.objects (bucket_id, name, metadata)
  values ('listing-photos', v_path, jsonb_build_object('mimetype', 'image/jpeg', 'size', 100000));
  perform public.register_listing_image(v_listing_id, v_path);

  return v_listing_id;
end;
$$;

-- =========================================================================================
-- OWNERSHIP
-- =========================================================================================

select pg_temp.authenticate_as('a0000000-0000-0000-0000-00000000000a');

-- 1. landlord A creates own draft
select lives_ok(
  $$ insert into public.listings (owner_id, listing_category, city)
     values ('a0000000-0000-0000-0000-00000000000a', 'entire_property', 'Dublin') $$,
  'landlord A can create their own draft listing'
);

-- 2. landlord A cannot create a listing owned by B
select throws_ok(
  $$ insert into public.listings (owner_id, listing_category, city)
     values ('b0000000-0000-0000-0000-00000000000b', 'entire_property', 'Dublin') $$,
  '42501',
  null,
  'landlord A cannot create a listing with owner_id set to landlord B'
);

-- 3. landlord A cannot edit B's listing
select pg_temp.authenticate_as_test_runner();
insert into public.listings (owner_id, listing_category, city, title)
values ('b0000000-0000-0000-0000-00000000000b', 'entire_property', 'Dublin', 'Landlord B original title');

select pg_temp.authenticate_as('a0000000-0000-0000-0000-00000000000a');
select lives_ok(
  $$ update public.listings set title = 'Hacked by A' where owner_id = 'b0000000-0000-0000-0000-00000000000b' $$,
  'the UPDATE statement itself does not error — RLS just makes it match zero rows'
);
select pg_temp.authenticate_as_test_runner();
select results_eq(
  $$ select title from public.listings where owner_id = 'b0000000-0000-0000-0000-00000000000b' $$,
  $$ values ('Landlord B original title'::text) $$,
  'landlord B''s listing title is unchanged after landlord A''s attempted edit'
);

-- =========================================================================================
-- VISIBILITY
-- =========================================================================================

select pg_temp.authenticate_as('a0000000-0000-0000-0000-00000000000a');
select pg_temp.make_ready_draft('a0000000-0000-0000-0000-00000000000a', 'Published listing for visibility tests') as published_listing_id \gset
select public.request_listing_review(:'published_listing_id');
select pg_temp.authenticate_as('c0000000-0000-0000-0000-00000000000c');
select public.moderator_approve_listing(:'published_listing_id');

select pg_temp.authenticate_as('a0000000-0000-0000-0000-00000000000a');
select pg_temp.make_ready_draft('a0000000-0000-0000-0000-00000000000a', 'Still-draft listing for visibility tests') as draft_listing_id \gset

-- 4. anonymous can read published tenant-safe listing data
select pg_temp.authenticate_as_anon();
select results_eq(
  format($$ select title from public.public_listings where id = %L $$, :'published_listing_id'),
  $$ values ('Published listing for visibility tests'::text) $$,
  'anonymous can read the published listing through the tenant-safe view'
);

-- 5. anonymous cannot read draft
select is_empty(
  format($$ select 1 from public.listings where id = %L $$, :'draft_listing_id'),
  'anonymous cannot read the draft listing at all'
);
select is_empty(
  format($$ select 1 from public.public_listings where id = %L $$, :'draft_listing_id'),
  'the draft listing does not appear in the tenant-safe view either'
);

-- 6. tenant (a random authenticated non-owner, non-moderator) cannot read pending/rejected private listing
select pg_temp.authenticate_as('a0000000-0000-0000-0000-00000000000a');
select pg_temp.make_ready_draft('a0000000-0000-0000-0000-00000000000a', 'Pending listing for visibility tests') as pending_listing_id \gset
select public.request_listing_review(:'pending_listing_id');

select pg_temp.authenticate_as('d0000000-0000-0000-0000-00000000000d');
select is_empty(
  format($$ select 1 from public.listings where id = %L $$, :'pending_listing_id'),
  'an ordinary authenticated user cannot read another landlord''s pending_verification listing'
);

-- 7. owner can read own draft/pending/rejected
select pg_temp.authenticate_as('a0000000-0000-0000-0000-00000000000a');
select isnt_empty(
  format($$ select 1 from public.listings where id = %L $$, :'draft_listing_id'),
  'owner can read their own draft listing'
);
select isnt_empty(
  format($$ select 1 from public.listings where id = %L $$, :'pending_listing_id'),
  'owner can read their own pending_verification listing'
);

-- =========================================================================================
-- LIFECYCLE
-- =========================================================================================

-- 8. landlord can request review when complete (already exercised above for pending_listing_id
-- and published_listing_id — assert the resulting statuses directly here).
select results_eq(
  format($$ select status::text from public.listings where id = %L $$, :'pending_listing_id'),
  $$ values ('pending_verification'::text) $$,
  'request_listing_review succeeds on a complete draft and moves it to pending_verification'
);

-- 9. landlord cannot request review when incomplete
select pg_temp.authenticate_as('a0000000-0000-0000-0000-00000000000a');
insert into public.listings (owner_id, listing_category, city, title)
values ('a0000000-0000-0000-0000-00000000000a', 'entire_property', 'Dublin', 'Incomplete listing')
returning id as incomplete_listing_id \gset

select throws_ok(
  format($$ select public.request_listing_review(%L) $$, :'incomplete_listing_id'),
  'P0001',
  null,
  'request_listing_review rejects an incomplete draft (missing rent/description/photo/etc.)'
);
select results_eq(
  format($$ select status::text from public.listings where id = %L $$, :'incomplete_listing_id'),
  $$ values ('draft'::text) $$,
  'the incomplete listing stays in draft after the rejected review request'
);

-- 10. landlord cannot self-publish
select throws_ok(
  format($$ update public.listings set status = 'published' where id = %L $$, :'draft_listing_id'),
  '42501',
  null,
  'landlord cannot directly UPDATE status to published — no column grant exists for it'
);

-- 11. moderator can approve (pending_listing_id, distinct from published_listing_id above)
select pg_temp.authenticate_as('c0000000-0000-0000-0000-00000000000c');
select lives_ok(
  format($$ select public.moderator_approve_listing(%L) $$, :'pending_listing_id'),
  'moderator can approve a pending_verification listing'
);
select results_eq(
  format($$ select status::text from public.listings where id = %L $$, :'pending_listing_id'),
  $$ values ('published'::text) $$,
  'the approved listing is now published'
);

-- 12. moderator can reject
select pg_temp.authenticate_as('a0000000-0000-0000-0000-00000000000a');
select pg_temp.make_ready_draft('a0000000-0000-0000-0000-00000000000a', 'Listing to be rejected') as reject_listing_id \gset
select public.request_listing_review(:'reject_listing_id');

select pg_temp.authenticate_as('c0000000-0000-0000-0000-00000000000c');
select lives_ok(
  format($$ select public.moderator_reject_listing(%L, 'Photos do not match the description') $$, :'reject_listing_id'),
  'moderator can reject a pending_verification listing with a reason'
);
select results_eq(
  format($$ select (get_listing_for_moderation).status::text, (get_listing_for_moderation).rejection_reason
            from public.get_listing_for_moderation(%L) $$, :'reject_listing_id'),
  $$ values ('rejected'::text, 'Photos do not match the description'::text) $$,
  'the rejected listing carries the moderator''s reason (read via get_listing_for_moderation, since rejection_reason is not in the base-table grant)'
);

-- 13. normal user cannot approve/reject
select pg_temp.authenticate_as('a0000000-0000-0000-0000-00000000000a');
select pg_temp.make_ready_draft('a0000000-0000-0000-0000-00000000000a', 'Listing normal user cannot moderate') as unmoderatable_listing_id \gset
select public.request_listing_review(:'unmoderatable_listing_id');

select pg_temp.authenticate_as('d0000000-0000-0000-0000-00000000000d');
select throws_ok(
  format($$ select public.moderator_approve_listing(%L) $$, :'unmoderatable_listing_id'),
  '42501',
  null,
  'an ordinary user cannot approve a listing'
);
select throws_ok(
  format($$ select public.moderator_reject_listing(%L, 'trying to reject') $$, :'unmoderatable_listing_id'),
  '42501',
  null,
  'an ordinary user cannot reject a listing'
);

-- 14. landlord can pause own published listing
select pg_temp.authenticate_as('a0000000-0000-0000-0000-00000000000a');
select lives_ok(
  format($$ select public.pause_listing(%L) $$, :'published_listing_id'),
  'landlord can pause their own published listing'
);
select results_eq(
  format($$ select status::text from public.listings where id = %L $$, :'published_listing_id'),
  $$ values ('paused'::text) $$,
  'the listing is now paused'
);

-- 15. landlord can mark rented
select lives_ok(
  format($$ select public.mark_listing_rented(%L) $$, :'published_listing_id'),
  'landlord can mark their own (paused) listing as rented'
);
select results_eq(
  format($$ select status::text from public.listings where id = %L $$, :'published_listing_id'),
  $$ values ('rented'::text) $$,
  'the listing is now rented'
);

-- 16. rented listing cannot be reopened
select throws_ok(
  format($$ select public.pause_listing(%L) $$, :'published_listing_id'),
  null::char(5), null,
  'a rented listing cannot be paused'
);
select throws_ok(
  format($$ select public.resume_listing(%L) $$, :'published_listing_id'),
  null::char(5), null,
  'a rented listing cannot be resumed (there is nothing to resume it from)'
);

-- 17. moderator can remove a published listing
select pg_temp.authenticate_as('a0000000-0000-0000-0000-00000000000a');
select pg_temp.make_ready_draft('a0000000-0000-0000-0000-00000000000a', 'Listing to be removed by platform') as removable_listing_id \gset
select public.request_listing_review(:'removable_listing_id');
select pg_temp.authenticate_as('c0000000-0000-0000-0000-00000000000c');
select public.moderator_approve_listing(:'removable_listing_id');
select lives_ok(
  format($$ select public.moderator_remove_listing(%L, 'Reported and confirmed fraudulent') $$, :'removable_listing_id'),
  'moderator can remove a published listing'
);
select results_eq(
  format($$ select status::text from public.listings where id = %L $$, :'removable_listing_id'),
  $$ values ('removed_by_platform'::text) $$,
  'the listing status is removed_by_platform, a distinct state from paused'
);

-- 18. landlord cannot simulate moderator removal
select pg_temp.authenticate_as('a0000000-0000-0000-0000-00000000000a');
select pg_temp.make_ready_draft('a0000000-0000-0000-0000-00000000000a', 'Listing landlord cannot remove') as self_remove_listing_id \gset
select public.request_listing_review(:'self_remove_listing_id');
select pg_temp.authenticate_as('c0000000-0000-0000-0000-00000000000c');
select public.moderator_approve_listing(:'self_remove_listing_id');

select pg_temp.authenticate_as('a0000000-0000-0000-0000-00000000000a');
select throws_ok(
  format($$ select public.moderator_remove_listing(%L, 'trying to self-remove') $$, :'self_remove_listing_id'),
  '42501',
  null,
  'the listing''s own landlord cannot call moderator_remove_listing on it'
);

-- =========================================================================================
-- IMAGES
-- =========================================================================================

-- 19. owner can register/upload own listing image (make_ready_draft already exercises this
-- end to end for every listing above — assert it explicitly once here too).
select isnt_empty(
  format($$ select 1 from public.listing_images where listing_id = %L $$, :'draft_listing_id'),
  'owner successfully registered an image for their own listing'
);

-- 20. other landlord cannot register an image for A's listing
select pg_temp.authenticate_as_test_runner();
insert into storage.objects (bucket_id, name, metadata)
values ('listing-photos', :'draft_listing_id' || '/intruder.jpg', jsonb_build_object('mimetype', 'image/jpeg', 'size', 50000));

select pg_temp.authenticate_as('b0000000-0000-0000-0000-00000000000b');
select throws_ok(
  format($$ select public.register_listing_image(%L, %L || '/intruder.jpg') $$, :'draft_listing_id', :'draft_listing_id'),
  '42501',
  null,
  'landlord B cannot register an image against landlord A''s listing'
);

-- 21. tenant cannot mutate image metadata directly (bypassing the guarded function)
select pg_temp.authenticate_as('d0000000-0000-0000-0000-00000000000d');
select throws_ok(
  format($$ update public.listing_images set label = 'kitchen' where listing_id = %L $$, :'draft_listing_id'),
  '42501',
  null,
  'an ordinary user has no UPDATE grant on listing_images at all'
);
select throws_ok(
  format($$ insert into public.listing_images (listing_id, storage_path, mime_type, size_bytes)
            values (%L, 'forged/path.jpg', 'image/jpeg', 1000) $$, :'draft_listing_id'),
  '42501',
  null,
  'an ordinary user has no INSERT grant on listing_images at all'
);

-- 22. no second cover image allowed (structural — bypass the RPC entirely, as the test-runner,
-- to prove the unique index itself is what stops this, not just application logic)
select pg_temp.authenticate_as_test_runner();
select throws_ok(
  format(
    $$ insert into public.listing_images (listing_id, storage_path, is_cover, mime_type, size_bytes)
       values (%L, 'second-cover.jpg', true, 'image/jpeg', 1000) $$,
    :'draft_listing_id'
  ),
  '23505',
  null,
  'a second is_cover=true row for the same listing violates the structural unique index'
);

-- 23. image count limit enforced
select pg_temp.authenticate_as('a0000000-0000-0000-0000-00000000000a');
select pg_temp.make_ready_draft('a0000000-0000-0000-0000-00000000000a', 'Listing for the 8-photo limit test') as limit_listing_id \gset
-- make_ready_draft already registered 1 image; add 7 more to reach exactly 8.
select set_config('gafflo.limit_listing_id', :'limit_listing_id', false);
do $$
declare
  i integer;
  v_path text;
  v_listing_id uuid := current_setting('gafflo.limit_listing_id')::uuid;
begin
  for i in 1..7 loop
    v_path := v_listing_id::text || '/extra-' || i || '.jpg';
    insert into storage.objects (bucket_id, name, metadata)
    values ('listing-photos', v_path, jsonb_build_object('mimetype', 'image/jpeg', 'size', 10000));
    perform public.register_listing_image(v_listing_id, v_path);
  end loop;
end;
$$;
select results_eq(
  format($$ select count(*)::int from public.listing_images where listing_id = %L $$, :'limit_listing_id'),
  $$ values (8) $$,
  'the listing now has exactly 8 registered photos'
);
select pg_temp.authenticate_as_test_runner();
insert into storage.objects (bucket_id, name, metadata)
values ('listing-photos', :'limit_listing_id' || '/ninth.jpg', jsonb_build_object('mimetype', 'image/jpeg', 'size', 10000));
select pg_temp.authenticate_as('a0000000-0000-0000-0000-00000000000a');
select throws_ok(
  format($$ select public.register_listing_image(%L, %L || '/ninth.jpg') $$, :'limit_listing_id', :'limit_listing_id'),
  null::char(5), null,
  'a 9th photo is rejected — a listing can have at most 8'
);

-- 24. review request requires a durable photo
select pg_temp.authenticate_as('a0000000-0000-0000-0000-00000000000a');
insert into public.listings (
  owner_id, listing_category, city, area, rent, deposit, available_from, min_stay_months,
  property_type, bedrooms, bathrooms, max_occupants, title, description
) values (
  'a0000000-0000-0000-0000-00000000000a', 'entire_property', 'Dublin', 'Rathmines', 1800, 1800, current_date + 30, 6,
  'apartment', 2, 1.0, 3,
  'Complete except for a photo',
  'Every other field on this listing is filled in correctly and completely except for a photo.'
) returning id as no_photo_listing_id \gset

select throws_like(
  format($$ select public.request_listing_review(%L) $$, :'no_photo_listing_id'),
  '%durable listing photo%',
  'request_listing_review specifically calls out the missing photo when everything else is complete'
);

-- =========================================================================================
-- PRIVACY
-- =========================================================================================

-- 25. public listing surface does not expose exact address/internal fields
select pg_temp.authenticate_as_test_runner();
select is_empty(
  $$ select column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'public_listings'
     and column_name in ('exact_address', 'eircode', 'rejection_reason', 'removed_reason',
                          'removed_by_platform_at', 'paused_at', 'rented_at') $$,
  'public_listings has no column at all for exact_address/eircode/rejection_reason/removed_reason/internal timestamps'
);

-- =========================================================================================
-- ADVERSARIAL REVIEW REGRESSION TESTS (Part Q)
-- =========================================================================================
-- Added after manually re-reading the migration as an attacker, before commit. #26-30 are the
-- regression test for a real vulnerability found in that pass: the base `listings` table's
-- SELECT grant was originally unrestricted, so an ordinary authenticated user could bypass
-- public_listings entirely and read exact_address/eircode directly from the base table for any
-- published listing. Fixed by column-restricting the grant and adding get_my_listing() /
-- get_listing_for_moderation() as the real full-detail read paths.

-- 26. a non-owner cannot read exact_address directly from the base table, even for a
-- published listing they ARE otherwise allowed to see the safe columns of. Uses
-- pending_listing_id, not published_listing_id — the latter was already paused and marked
-- rented earlier in this file (tests 14-15), so it is genuinely still 'published' here.
select pg_temp.authenticate_as('d0000000-0000-0000-0000-00000000000d');
select throws_ok(
  format($$ select exact_address from public.listings where id = %L $$, :'pending_listing_id'),
  '42501',
  null,
  'an ordinary user cannot read exact_address from the base listings table at all, even for a published row'
);

-- 27. the owner CAN read their own exact_address, via get_my_listing().
select pg_temp.authenticate_as('a0000000-0000-0000-0000-00000000000a');
select pg_temp.make_ready_draft('a0000000-0000-0000-0000-00000000000a', 'Listing with a real exact address') as address_listing_id \gset
select pg_temp.authenticate_as_test_runner();
update public.listings set exact_address = '12 Example Terrace, Rathmines' where id = :'address_listing_id';

select pg_temp.authenticate_as('a0000000-0000-0000-0000-00000000000a');
select results_eq(
  format($$ select (get_my_listing).exact_address from public.get_my_listing(%L) $$, :'address_listing_id'),
  $$ values ('12 Example Terrace, Rathmines'::text) $$,
  'the owner can read their own exact_address via get_my_listing()'
);

-- 28. a non-owner cannot call get_my_listing() on someone else's listing.
select pg_temp.authenticate_as('d0000000-0000-0000-0000-00000000000d');
select throws_ok(
  format($$ select public.get_my_listing(%L) $$, :'address_listing_id'),
  '42501',
  null,
  'a non-owner cannot use get_my_listing() to read someone else''s listing'
);

-- 29. a moderator CAN read exact_address via get_listing_for_moderation().
select pg_temp.authenticate_as('c0000000-0000-0000-0000-00000000000c');
select results_eq(
  format($$ select (get_listing_for_moderation).exact_address from public.get_listing_for_moderation(%L) $$, :'address_listing_id'),
  $$ values ('12 Example Terrace, Rathmines'::text) $$,
  'a moderator can read exact_address via get_listing_for_moderation()'
);

-- 30. a non-moderator cannot call get_listing_for_moderation() at all.
select pg_temp.authenticate_as('d0000000-0000-0000-0000-00000000000d');
select throws_ok(
  format($$ select public.get_listing_for_moderation(%L) $$, :'address_listing_id'),
  '42501',
  null,
  'an ordinary user cannot call get_listing_for_moderation()'
);

-- 31. owner_id cannot be forged/reassigned via UPDATE.
select pg_temp.authenticate_as('a0000000-0000-0000-0000-00000000000a');
select throws_ok(
  format($$ update public.listings set owner_id = 'b0000000-0000-0000-0000-00000000000b' where id = %L $$, :'draft_listing_id'),
  '42501',
  null,
  'a landlord cannot reassign owner_id on their own listing — no UPDATE grant on that column exists'
);

-- 32. a non-owner, non-moderator cannot read image metadata for someone else's draft/pending listing.
select pg_temp.authenticate_as('d0000000-0000-0000-0000-00000000000d');
select is_empty(
  format($$ select 1 from public.listing_images where listing_id = %L $$, :'draft_listing_id'),
  'an ordinary user cannot see image metadata for another landlord''s still-draft listing'
);
select is_empty(
  format($$ select 1 from public.listing_images where listing_id = %L $$, :'unmoderatable_listing_id'),
  'an ordinary user cannot see image metadata for another landlord''s pending_verification listing either'
);

-- 33. register_listing_image rejects a storage_path whose prefix does not match the listing_id
-- argument, even though the caller genuinely owns both listings involved.
select pg_temp.authenticate_as('a0000000-0000-0000-0000-00000000000a');
select pg_temp.make_ready_draft('a0000000-0000-0000-0000-00000000000a', 'Listing A-2, also owned by A') as second_own_listing_id \gset
select pg_temp.authenticate_as_test_runner();
insert into storage.objects (bucket_id, name, metadata)
values ('listing-photos', :'second_own_listing_id' || '/mismatched.jpg', jsonb_build_object('mimetype', 'image/jpeg', 'size', 20000));
select pg_temp.authenticate_as('a0000000-0000-0000-0000-00000000000a');
select throws_ok(
  format(
    $$ select public.register_listing_image(%L, %L || '/mismatched.jpg') $$,
    :'draft_listing_id', :'second_own_listing_id'
  ),
  null::char(5), null,
  'register_listing_image rejects a storage_path prefixed with a different (even same-owner) listing_id than the one it is being registered against'
);

-- 34. the 8-image trigger-level limit fires even bypassing register_listing_image entirely
-- (defense in depth — authenticated has no INSERT grant on listing_images today, so this only
-- matters if a future migration mistake opens one up; tested here as the test-runner/superuser
-- to isolate the trigger itself from the RPC's own count check).
select pg_temp.authenticate_as_test_runner();
select throws_ok(
  format(
    $$ insert into public.listing_images (listing_id, storage_path, mime_type, size_bytes)
       values (%L, 'trigger-bypass-attempt.jpg', 'image/jpeg', 1000) $$,
    :'limit_listing_id'
  ),
  null::char(5), null,
  'the enforce_listing_image_limit trigger itself rejects a 9th row, independent of register_listing_image''s own check'
);

-- 35. created_at cannot be forged at INSERT time.
select pg_temp.authenticate_as('a0000000-0000-0000-0000-00000000000a');
select throws_ok(
  $$ insert into public.listings (owner_id, listing_category, city, created_at)
     values ('a0000000-0000-0000-0000-00000000000a', 'entire_property', 'Dublin', '2000-01-01') $$,
  '42501',
  null,
  'a landlord cannot backdate created_at on their own new listing — no INSERT grant on that column exists'
);

-- 36. published_at cannot be set directly via UPDATE (only moderator_approve_listing sets it).
select throws_ok(
  format($$ update public.listings set published_at = now() where id = %L $$, :'draft_listing_id'),
  '42501',
  null,
  'a landlord cannot set published_at directly — no UPDATE grant on that column exists'
);

-- 37. a removed_by_platform listing cannot be reactivated by anyone, through any function.
select pg_temp.authenticate_as('a0000000-0000-0000-0000-00000000000a');
select throws_ok(
  format($$ select public.resume_listing(%L) $$, :'removable_listing_id'),
  null::char(5), null,
  'a removed_by_platform listing cannot be resumed by its own landlord'
);
select throws_ok(
  format($$ select public.request_listing_review(%L) $$, :'removable_listing_id'),
  null::char(5), null,
  'a removed_by_platform listing cannot re-enter review by its own landlord'
);
select pg_temp.authenticate_as('c0000000-0000-0000-0000-00000000000c');
select throws_ok(
  format($$ select public.moderator_approve_listing(%L) $$, :'removable_listing_id'),
  null::char(5), null,
  'a removed_by_platform listing cannot even be re-approved by a moderator — no function transitions out of it'
);

-- =========================================================================================
-- storage.objects RLS itself (not just register_listing_image's own checks — everything
-- above used the test-runner role to simulate "an upload already happened"; these exercise
-- the actual storage.objects policies with `authenticated` performing the write/read).
-- =========================================================================================

-- 38. landlord can upload (INSERT into storage.objects) under a path prefixed with their own listing_id.
select pg_temp.authenticate_as('a0000000-0000-0000-0000-00000000000a');
select lives_ok(
  format(
    $$ insert into storage.objects (bucket_id, name, metadata)
       values ('listing-photos', %L || '/real-upload.jpg', jsonb_build_object('mimetype', 'image/jpeg', 'size', 30000)) $$,
    :'draft_listing_id'
  ),
  'the storage.objects INSERT policy lets a landlord upload under their own listing_id prefix'
);

-- 39. landlord cannot upload under a path prefixed with someone else's listing_id.
select pg_temp.authenticate_as('b0000000-0000-0000-0000-00000000000b');
select throws_ok(
  format(
    $$ insert into storage.objects (bucket_id, name, metadata)
       values ('listing-photos', %L || '/intruding-upload.jpg', jsonb_build_object('mimetype', 'image/jpeg', 'size', 30000)) $$,
    :'draft_listing_id'
  ),
  null::char(5), null,
  'the storage.objects INSERT policy blocks landlord B uploading under landlord A''s listing_id prefix'
);

-- 40. anon can read a storage object under a published listing's path. pending_listing_id, not
-- published_listing_id — the latter is already 'rented' by this point (tests 14-15).
select pg_temp.authenticate_as_anon();
select isnt_empty(
  format($$ select 1 from storage.objects where bucket_id = 'listing-photos' and name = %L || '/cover.jpg' $$, :'pending_listing_id'),
  'anon can read a storage.objects row for a published listing''s photo path'
);

-- 41. anon cannot read a storage object under a draft listing's path.
select is_empty(
  format($$ select 1 from storage.objects where bucket_id = 'listing-photos' and name = %L || '/cover.jpg' $$, :'draft_listing_id'),
  'anon cannot read a storage.objects row for a still-draft listing''s photo path'
);

-- 42. the owner can delete their own storage object; a non-owner's DELETE runs without error
-- but (like UPDATE) matches zero rows under RLS, so it is verified by checking the row still
-- exists afterward, not by expecting an exception.
select pg_temp.authenticate_as('b0000000-0000-0000-0000-00000000000b');
select lives_ok(
  format($$ delete from storage.objects where bucket_id = 'listing-photos' and name = %L || '/real-upload.jpg' $$, :'draft_listing_id'),
  'landlord B''s DELETE attempt on landlord A''s storage object runs without error — RLS just makes it match zero rows'
);
select pg_temp.authenticate_as_test_runner();
select isnt_empty(
  format($$ select 1 from storage.objects where bucket_id = 'listing-photos' and name = %L || '/real-upload.jpg' $$, :'draft_listing_id'),
  'the object is still there — landlord B''s DELETE did not actually remove it'
);

select pg_temp.authenticate_as('a0000000-0000-0000-0000-00000000000a');
select lives_ok(
  format($$ delete from storage.objects where bucket_id = 'listing-photos' and name = %L || '/real-upload.jpg' $$, :'draft_listing_id'),
  'landlord A can delete their own storage object'
);

select * from finish();

rollback;
