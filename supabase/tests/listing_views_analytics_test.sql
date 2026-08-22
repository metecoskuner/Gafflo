-- Stage I listing views / landlord analytics tests — real pgTAP tests run against a real
-- Postgres instance. Everything runs inside one transaction and rolls back. True concurrent
-- multi-tab races are represented here by the unique constraint + duplicate retry tests; an
-- HTTP-level race should be reconfirmed alongside the Stage I report if needed.

begin;

create extension if not exists pgtap with schema extensions;

select plan(44);

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

create function pg_temp.publish_listing(p_listing_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', ''::text, true);
  reset role;
  update public.listings set status = 'published', published_at = now() where id = p_listing_id;
end;
$$;

create function pg_temp.make_published_listing(p_owner uuid, p_title text default 'Listing analytics test listing')
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
  ('80000000-0000-0000-0000-000000000001', 'analytics-landlord-a@example.test'),
  ('80000000-0000-0000-0000-000000000002', 'analytics-tenant-a@example.test'),
  ('80000000-0000-0000-0000-000000000003', 'analytics-tenant-b@example.test'),
  ('80000000-0000-0000-0000-000000000004', 'analytics-viewer-no-tenant-profile@example.test'),
  ('80000000-0000-0000-0000-000000000005', 'analytics-viewer-suspended@example.test'),
  ('80000000-0000-0000-0000-000000000006', 'analytics-viewer-banned@example.test'),
  ('80000000-0000-0000-0000-000000000007', 'analytics-landlord-b@example.test');

insert into public.tenant_profiles (profile_id, target_city, looking_for) values
  ('80000000-0000-0000-0000-000000000002', 'Dublin', 'any'),
  ('80000000-0000-0000-0000-000000000003', 'Dublin', 'any'),
  ('80000000-0000-0000-0000-000000000005', 'Dublin', 'any'),
  ('80000000-0000-0000-0000-000000000006', 'Dublin', 'any');
-- 004 deliberately has no tenant_profiles row: plain authenticated profiles may still count as
-- views because viewing is lower commitment than applying/saving/Smart Match.

set local role service_role;
update public.profiles set platform_status = 'suspended' where id = '80000000-0000-0000-0000-000000000005';
update public.profiles set platform_status = 'banned' where id = '80000000-0000-0000-0000-000000000006';
reset role;

-- request_listing_review() also gates on Fair Housing acknowledgement (Stage J1) — a real,
-- account-level prerequisite unrelated to what this suite is testing (listing view analytics).
-- Pre-seed the landlord fixture that calls make_published_listing() below as already-
-- acknowledged. See Stage P.
set local role service_role;
insert into public.landlord_profiles (profile_id, display_name, fair_housing_acknowledged_at) values
  ('80000000-0000-0000-0000-000000000001', 'Analytics Landlord A', now());
reset role;

select pg_temp.authenticate_as('80000000-0000-0000-0000-000000000001');
select pg_temp.make_published_listing('80000000-0000-0000-0000-000000000001', 'Analytics Listing 1') as listing_1_id \gset
select pg_temp.publish_listing(:'listing_1_id');

select pg_temp.authenticate_as('80000000-0000-0000-0000-000000000001');
select pg_temp.make_published_listing('80000000-0000-0000-0000-000000000001', 'Analytics Empty Listing') as empty_listing_id \gset
select pg_temp.publish_listing(:'empty_listing_id');

select pg_temp.authenticate_as('80000000-0000-0000-0000-000000000001');
insert into public.listings (
  owner_id, listing_category, city, area, rent, deposit, available_from, min_stay_months,
  property_type, bedrooms, bathrooms, max_occupants, title, description
) values (
  '80000000-0000-0000-0000-000000000001', 'entire_property', 'Dublin', 'Rathmines', 1800, 1800, current_date + 30, 6,
  'apartment', 2, 1.0, 3, 'Analytics Draft Listing',
  'A draft listing that must not receive new view rows.'
) returning id as draft_listing_id \gset

-- =========================================================================================
-- PART 1 — schema, grants and raw table exposure.
-- =========================================================================================

select has_table('public', 'listing_views', '1. listing_views table exists');

-- information_schema.table_constraints is privilege-filtered per role (SQL-standard behavior),
-- and at this point the active role is still 'authenticated' from the landlord fixture setup
-- above, which has zero grants on listing_views by design (see part 2 of the migration) — so
-- this check must run as test_runner/superuser to actually see the row, exactly like every
-- check below it.
select pg_temp.authenticate_as_test_runner();
select is(
  (select count(*)::int from information_schema.table_constraints
   where table_schema = 'public' and table_name = 'listing_views' and constraint_name = 'listing_views_unique_listing_viewer'),
  1,
  '2. listing_views has the lifetime unique listing+viewer constraint'
);

select is(
  (select count(*)::int from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'listing_views' and grantee = 'authenticated'
     and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')),
  0,
  '3. authenticated has no raw listing_views table grant in any direction'
);
select is(
  (select count(*)::int from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'listing_views' and grantee = 'anon'),
  0,
  '4. anon has zero grants on listing_views'
);
select is(
  (select count(*)::int from information_schema.routine_privileges
   where routine_schema = 'public' and routine_name = 'record_listing_view' and grantee in ('anon', 'PUBLIC')),
  0,
  '5. record_listing_view() has no anon/PUBLIC execute grant'
);
select is(
  (select count(*)::int from information_schema.routine_privileges
   where routine_schema = 'public' and routine_name in ('record_listing_view', 'get_listing_analytics', 'get_my_listing_analytics')
     and grantee = 'authenticated' and privilege_type = 'EXECUTE'),
  3,
  '6. authenticated has execute grant only on the three Stage I RPCs'
);
select is(
  (select count(*)::int from pg_indexes where schemaname = 'public' and indexname = 'saved_listings_listing_id_idx'),
  1,
  '7. saved_listings has a listing-led index for landlord analytics counts'
);

select pg_temp.authenticate_as('80000000-0000-0000-0000-000000000002');
select throws_ok(
  $$ select count(*) from public.listing_views $$,
  '42501', null,
  '8. a tenant cannot raw-select listing_views'
);
select throws_ok(
  format($$ insert into public.listing_views (listing_id, viewer_id) values (%L, '80000000-0000-0000-0000-000000000002') $$, :'listing_1_id'),
  '42501', null,
  '9. a tenant cannot forge a raw listing_views insert'
);

-- =========================================================================================
-- PART 2 — record_listing_view semantics.
-- =========================================================================================

select pg_temp.authenticate_as('80000000-0000-0000-0000-000000000002');
select results_eq(
  format($$ select public.record_listing_view(%L) $$, :'listing_1_id'),
  $$ values (true) $$,
  '10. tenant A records the first real view'
);
select pg_temp.authenticate_as_test_runner();
select is(
  (select count(*)::int from public.listing_views where listing_id = (:'listing_1_id')::uuid),
  1,
  '11. the first view persists one row'
);
select pg_temp.authenticate_as('80000000-0000-0000-0000-000000000002');
select results_eq(
  format($$ select public.record_listing_view(%L) $$, :'listing_1_id'),
  $$ values (false) $$,
  '12. tenant A retrying the same listing is an idempotent no-op'
);
select pg_temp.authenticate_as_test_runner();
select is(
  (select count(*)::int from public.listing_views where listing_id = (:'listing_1_id')::uuid and viewer_id = '80000000-0000-0000-0000-000000000002'),
  1,
  '13. the duplicate retry did not create a second row'
);

select pg_temp.authenticate_as('80000000-0000-0000-0000-000000000003');
select results_eq(
  format($$ select public.record_listing_view(%L) $$, :'listing_1_id'),
  $$ values (true) $$,
  '14. tenant B records a distinct unique view'
);

select pg_temp.authenticate_as('80000000-0000-0000-0000-000000000004');
select results_eq(
  format($$ select public.record_listing_view(%L) $$, :'listing_1_id'),
  $$ values (true) $$,
  '15. an authenticated profile without a tenant profile can still count as a view'
);

select pg_temp.authenticate_as('80000000-0000-0000-0000-000000000001');
select results_eq(
  format($$ select public.record_listing_view(%L) $$, :'listing_1_id'),
  $$ values (false) $$,
  '16. a landlord viewing their own listing is a no-op'
);
select pg_temp.authenticate_as_test_runner();
select is(
  (select count(*)::int from public.listing_views where listing_id = (:'listing_1_id')::uuid and viewer_id = '80000000-0000-0000-0000-000000000001'),
  0,
  '17. no owner self-view row exists'
);

select pg_temp.authenticate_as('80000000-0000-0000-0000-000000000002');
select results_eq(
  format($$ select public.record_listing_view(%L) $$, :'draft_listing_id'),
  $$ values (false) $$,
  '18. an unpublished/draft listing cannot receive a new view'
);
select pg_temp.authenticate_as_test_runner();
select is(
  (select count(*)::int from public.listing_views where listing_id = (:'draft_listing_id')::uuid),
  0,
  '19. no row exists for the draft listing'
);

select pg_temp.authenticate_as('80000000-0000-0000-0000-000000000006');
select results_eq(
  format($$ select public.record_listing_view(%L) $$, :'listing_1_id'),
  $$ values (false) $$,
  '20. a banned caller is a quiet no-op'
);
select pg_temp.authenticate_as_test_runner();
select is(
  (select count(*)::int from public.listing_views where listing_id = (:'listing_1_id')::uuid and viewer_id = '80000000-0000-0000-0000-000000000006'),
  0,
  '21. no banned viewer row exists'
);

select pg_temp.authenticate_as('80000000-0000-0000-0000-000000000005');
select results_eq(
  format($$ select public.record_listing_view(%L) $$, :'listing_1_id'),
  $$ values (true) $$,
  '22. a suspended-but-not-banned caller is allowed to count as a passive view'
);
select pg_temp.authenticate_as_test_runner();
select is(
  (select count(*)::int from public.listing_views where listing_id = (:'listing_1_id')::uuid),
  4,
  '23. exactly four unique eligible viewers are counted'
);

select is(
  (select count(*)::int from public.notifications where listing_id = (:'listing_1_id')::uuid),
  0,
  '24. recording views does not create notifications'
);
select is(
  (
    (select count(*) from public.applications where listing_id = (:'listing_1_id')::uuid) +
    (select count(*) from public.conversations where listing_id = (:'listing_1_id')::uuid) +
    (select count(*) from public.saved_listings where listing_id = (:'listing_1_id')::uuid) +
    (select count(*) from public.smart_match_decisions where listing_id = (:'listing_1_id')::uuid)
  )::int,
  0,
  '25. recording views does not create application/conversation/save/Smart Match side effects'
);

select pg_temp.authenticate_as_anon();
select throws_ok(
  format($$ select public.record_listing_view(%L) $$, :'listing_1_id'),
  '42501', null,
  '26. anonymous cannot execute record_listing_view()'
);

select pg_temp.authenticate_as('80000000-0000-0000-0000-000000000002');
select results_eq(
  $$ select public.record_listing_view('ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid) $$,
  $$ values (false) $$,
  '27. a missing listing is a quiet no-op, not a raw existence leak'
);

-- =========================================================================================
-- PART 3 — real aggregate analytics from existing tables.
-- =========================================================================================

select pg_temp.authenticate_as('80000000-0000-0000-0000-000000000003');
select lives_ok(
  format($$ select public.set_listing_saved(%L, true) $$, :'listing_1_id'),
  '28. tenant B creates one real save for the listing'
);

select pg_temp.authenticate_as('80000000-0000-0000-0000-000000000002');
select public.create_application(:'listing_1_id') as app_1_id \gset
select pg_temp.authenticate_as('80000000-0000-0000-0000-000000000001');
select public.mark_application_viewed(:'app_1_id');
select public.landlord_set_application_status(:'app_1_id', 'shortlisted');
select is(
  (select count(*)::int from public.applications where listing_id = (:'listing_1_id')::uuid),
  1,
  '29. one real application exists for the listing'
);

select pg_temp.authenticate_as('80000000-0000-0000-0000-000000000003');
select public.start_conversation(:'listing_1_id', 'Hi, is this still available?') as conv_1_id \gset
select is(
  (select count(*)::int from public.conversations where listing_id = (:'listing_1_id')::uuid),
  1,
  '30. one real enquiry/conversation exists for the listing'
);

select pg_temp.authenticate_as('80000000-0000-0000-0000-000000000001');
select public.propose_viewing(
  :'app_1_id',
  jsonb_build_array(jsonb_build_object('starts_at', (now() + interval '3 days')::text, 'ends_at', (now() + interval '3 days 30 minutes')::text))
) as proposal_1_id \gset
select pg_temp.authenticate_as_test_runner();
select id as slot_1_id from public.viewing_slots where proposal_id = (:'proposal_1_id')::uuid limit 1 \gset
select pg_temp.authenticate_as('80000000-0000-0000-0000-000000000002');
select public.accept_viewing_slot(:'proposal_1_id', :'slot_1_id');
select is(
  (select count(*)::int
   from public.viewing_proposals vp
   join public.applications a on a.id = vp.application_id
   where a.listing_id = (:'listing_1_id')::uuid and vp.status = 'confirmed'),
  1,
  '31. one real confirmed viewing exists for the listing'
);

select pg_temp.authenticate_as('80000000-0000-0000-0000-000000000001');
select results_eq(
  format($$ select unique_views, saves, applications, enquiries, confirmed_viewings from public.get_listing_analytics(%L) $$, :'listing_1_id'),
  $$ values (4, 1, 1, 1, 1) $$,
  '32. get_listing_analytics() returns the exact aggregate performance metrics'
);
select results_eq(
  format($$ select unique_views, saves, applications, enquiries, confirmed_viewings from public.get_my_listing_analytics() where listing_id = %L $$, :'listing_1_id'),
  $$ values (4, 1, 1, 1, 1) $$,
  '33. get_my_listing_analytics() includes the same aggregate row for the owned listing'
);
select results_eq(
  format($$ select unique_views, saves, applications, enquiries, confirmed_viewings from public.get_my_listing_analytics() where listing_id = %L $$, :'empty_listing_id'),
  $$ values (0, 0, 0, 0, 0) $$,
  '34. get_my_listing_analytics() zero-fills owned listings with no engagement'
);

select pg_temp.authenticate_as('80000000-0000-0000-0000-000000000003');
select throws_ok(
  format($$ select * from public.get_listing_analytics(%L) $$, :'listing_1_id'),
  '42501', null,
  '35. a tenant cannot read landlord analytics for a listing they do not own'
);

select pg_temp.authenticate_as('80000000-0000-0000-0000-000000000007');
select throws_ok(
  format($$ select * from public.get_listing_analytics(%L) $$, :'listing_1_id'),
  '42501', null,
  '36. another landlord cannot read analytics for someone else''s listing'
);
select is(
  (select count(*)::int from public.get_my_listing_analytics()),
  0,
  '37. a landlord with no listings gets no aggregate rows from get_my_listing_analytics()'
);

select pg_temp.authenticate_as_anon();
select throws_ok(
  format($$ select * from public.get_listing_analytics(%L) $$, :'listing_1_id'),
  '42501', null,
  '38. anonymous cannot execute get_listing_analytics()'
);
select throws_ok(
  $$ select * from public.get_my_listing_analytics() $$,
  '42501', null,
  '39. anonymous cannot execute get_my_listing_analytics()'
);

select pg_temp.authenticate_as('80000000-0000-0000-0000-000000000003');
select lives_ok(
  format($$ select public.record_smart_match_decision(%L, 'interested') $$, :'listing_1_id'),
  '40. tenant B can record a private Smart Match Interested decision on the listing'
);

select pg_temp.authenticate_as('80000000-0000-0000-0000-000000000001');
select results_eq(
  format($$ select unique_views, saves, applications, enquiries, confirmed_viewings from public.get_listing_analytics(%L) $$, :'listing_1_id'),
  $$ values (4, 1, 1, 1, 1) $$,
  '41. Smart Match Interested is not exposed through landlord analytics'
);

select throws_ok(
  $$ select viewer_id from public.listing_views limit 1 $$,
  '42501', null,
  '42. even the listing owner cannot raw-select listing_views viewer ids'
);
select results_eq(
  format($$ select public.record_listing_view(%L) $$, :'listing_1_id'),
  $$ values (false) $$,
  '43. landlord self-view remains a no-op even after analytics exist'
);
select is(
  (select count(*)::int
   from pg_enum e
   join pg_type t on t.oid = e.enumtypid
   where t.typname = 'notification_type_t'
     and e.enumlabel in ('listing_view', 'listing_viewed', 'listing_view_recorded')),
  0,
  '44. listing views have no notification type at all'
);

select * from finish();

rollback;
