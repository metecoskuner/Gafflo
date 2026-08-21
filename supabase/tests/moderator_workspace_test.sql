-- Stage K moderator workspace tests — real pgTAP tests run against a real Postgres instance.
-- Everything runs inside one transaction and rolls back. Does not re-test
-- moderator_approve_listing()/moderator_reject_listing()/moderator_remove_listing()/
-- list_listing_reports()/resolve_listing_report() themselves — those are already covered by
-- their own stages' suites and are untouched here. This file covers exactly the two new pieces:
-- am_i_moderator() and list_listings_pending_review().

begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

-- =========================================================================================
-- Helpers — same pattern as every earlier suite.
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

create function pg_temp.make_pending_listing(p_owner uuid, p_title text default 'Moderator workspace test listing')
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
    'apartment', 2, 1.0, 3, p_title,
    'A genuinely lovely two bedroom apartment close to the village, with easy access to the city centre and public transport.'
  ) returning id into v_listing_id;

  v_path := v_listing_id::text || '/cover.jpg';
  insert into storage.objects (bucket_id, name, metadata)
  values ('listing-photos', v_path, jsonb_build_object('mimetype', 'image/jpeg', 'size', 100000));
  perform public.register_listing_image(v_listing_id, v_path);
  perform public.request_listing_review(v_listing_id);

  return v_listing_id;
end;
$$;

select pg_temp.authenticate_as_test_runner();

-- =========================================================================================
-- Fixtures.
-- =========================================================================================

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'moderator-workspace-mod@example.test'),
  ('a0000000-0000-0000-0000-000000000002', 'moderator-workspace-landlord@example.test'),
  ('a0000000-0000-0000-0000-000000000003', 'moderator-workspace-tenant@example.test');

insert into public.landlord_profiles (profile_id, display_name, fair_housing_acknowledged_at) values
  ('a0000000-0000-0000-0000-000000000002', 'Moderator Workspace Landlord', now());

insert into public.tenant_profiles (profile_id, target_city, looking_for) values
  ('a0000000-0000-0000-0000-000000000003', 'Dublin', 'any');

set local role service_role;
update public.profiles set platform_role = 'moderator' where id = 'a0000000-0000-0000-0000-000000000001';
reset role;

-- One listing already published (must never appear in the pending-review queue) and two
-- genuinely pending_verification listings, one created before the other so ordering is real and
-- checkable, not assumed.
select pg_temp.authenticate_as('a0000000-0000-0000-0000-000000000002');
select pg_temp.make_pending_listing('a0000000-0000-0000-0000-000000000002', 'Pending Listing 1 (older)') as pending_1_id \gset

select pg_temp.authenticate_as_test_runner();
select pg_temp.authenticate_as('a0000000-0000-0000-0000-000000000002');
select pg_temp.make_pending_listing('a0000000-0000-0000-0000-000000000002', 'Pending Listing 2 (newer)') as pending_2_id \gset

set local role service_role;
update public.listings set created_at = now() - interval '2 days' where id = (:'pending_1_id')::uuid;
update public.listings set created_at = now() - interval '1 day' where id = (:'pending_2_id')::uuid;
reset role;

select pg_temp.authenticate_as('a0000000-0000-0000-0000-000000000002');
select pg_temp.make_pending_listing('a0000000-0000-0000-0000-000000000002', 'Already Published Listing') as published_id \gset
set local role service_role;
update public.listings set status = 'published', published_at = now() where id = (:'published_id')::uuid;
reset role;

-- =========================================================================================
-- PART 1 — grants.
-- =========================================================================================

select pg_temp.authenticate_as_test_runner();
select is(
  (select count(*)::int from information_schema.routine_privileges
   where routine_schema = 'public' and routine_name = 'am_i_moderator' and grantee in ('anon', 'PUBLIC')),
  0,
  '1. am_i_moderator() has no anon/PUBLIC execute grant'
);
select is(
  (select count(*)::int from information_schema.routine_privileges
   where routine_schema = 'public' and routine_name = 'list_listings_pending_review' and grantee in ('anon', 'PUBLIC')),
  0,
  '2. list_listings_pending_review() has no anon/PUBLIC execute grant'
);
select is(
  (select count(*)::int from information_schema.routine_privileges
   where routine_schema = 'public' and routine_name in ('am_i_moderator', 'list_listings_pending_review')
     and grantee = 'authenticated' and privilege_type = 'EXECUTE'),
  2,
  '3. authenticated has execute grant on both new Stage K RPCs'
);

-- =========================================================================================
-- PART 2 — am_i_moderator().
-- =========================================================================================

select pg_temp.authenticate_as('a0000000-0000-0000-0000-000000000001');
select results_eq(
  $$ select public.am_i_moderator() $$,
  $$ values (true) $$,
  '4. a real moderator gets true'
);

select pg_temp.authenticate_as('a0000000-0000-0000-0000-000000000003');
select results_eq(
  $$ select public.am_i_moderator() $$,
  $$ values (false) $$,
  '5. a real non-moderator gets false, not an error'
);

select pg_temp.authenticate_as_anon();
select throws_ok(
  $$ select public.am_i_moderator() $$,
  '42501', null,
  '6. anonymous cannot execute am_i_moderator()'
);

-- =========================================================================================
-- PART 3 — list_listings_pending_review().
-- =========================================================================================

select pg_temp.authenticate_as('a0000000-0000-0000-0000-000000000001');
select is(
  (select count(*)::int from public.list_listings_pending_review() where id in ((:'pending_1_id')::uuid, (:'pending_2_id')::uuid)),
  2,
  '7. a real moderator sees both real pending listings'
);
select is(
  (select count(*)::int from public.list_listings_pending_review() where id = (:'published_id')::uuid),
  0,
  '8. an already-published listing never appears in the pending-review queue'
);
select results_eq(
  format(
    $$ select id from public.list_listings_pending_review() where id in (%L, %L) order by created_at asc $$,
    :'pending_1_id', :'pending_2_id'
  ),
  format($$ values (%L::uuid), (%L::uuid) $$, :'pending_1_id', :'pending_2_id'),
  '9. results are genuinely ordered oldest first, not just filtered'
);

select pg_temp.authenticate_as('a0000000-0000-0000-0000-000000000002');
select throws_ok(
  $$ select * from public.list_listings_pending_review() $$,
  '42501', null,
  '10. the listing owner (a non-moderator) cannot list the review queue'
);

select pg_temp.authenticate_as('a0000000-0000-0000-0000-000000000003');
select throws_ok(
  $$ select * from public.list_listings_pending_review() $$,
  '42501', null,
  '11. an ordinary tenant cannot list the review queue'
);

select pg_temp.authenticate_as_anon();
select throws_ok(
  $$ select * from public.list_listings_pending_review() $$,
  '42501', null,
  '12. anonymous cannot execute list_listings_pending_review()'
);

-- =========================================================================================
-- PART 4 — a real end-to-end approve, through the untouched existing RPC.
-- =========================================================================================

select pg_temp.authenticate_as('a0000000-0000-0000-0000-000000000001');
select lives_ok(
  format($$ select public.moderator_approve_listing(%L) $$, :'pending_1_id'),
  '13. the moderator can approve a real listing found via the new queue'
);
select pg_temp.authenticate_as_test_runner();
select is(
  (select status::text from public.listings where id = (:'pending_1_id')::uuid),
  'published',
  '14. the approved listing''s real status is now published'
);

select pg_temp.authenticate_as('a0000000-0000-0000-0000-000000000001');
select is(
  (select count(*)::int from public.list_listings_pending_review() where id = (:'pending_1_id')::uuid),
  0,
  '15. the now-approved listing no longer appears in the pending queue'
);
select is(
  (select count(*)::int from public.list_listings_pending_review() where id = (:'pending_2_id')::uuid),
  1,
  '16. the still-pending listing still appears'
);

select * from finish();

rollback;
