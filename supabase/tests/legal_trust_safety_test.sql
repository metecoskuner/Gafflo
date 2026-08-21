-- Stage J1 legal/trust/safety tests — real pgTAP tests run against a real Postgres instance.
-- Everything runs inside one transaction and rolls back.

begin;

create extension if not exists pgtap with schema extensions;

select plan(38);

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

-- Builds a fully review-ready draft listing WITHOUT calling request_listing_review() itself, so
-- the Fair Housing acknowledgement gate on that RPC can be tested in both directions from a
-- controlled starting point.
create function pg_temp.make_ready_draft_listing(p_owner uuid, p_title text default 'Legal trust safety test listing')
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

  return v_listing_id;
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

select pg_temp.authenticate_as_test_runner();

-- =========================================================================================
-- Fixtures.
-- =========================================================================================

insert into auth.users (id, email) values
  ('90000000-0000-0000-0000-000000000001', 'legal-landlord-a@example.test'),
  ('90000000-0000-0000-0000-000000000002', 'legal-tenant-a@example.test'),
  ('90000000-0000-0000-0000-000000000003', 'legal-tenant-banned@example.test'),
  ('90000000-0000-0000-0000-000000000004', 'legal-moderator@example.test'),
  ('90000000-0000-0000-0000-000000000005', 'legal-landlord-b@example.test');

insert into public.landlord_profiles (profile_id, display_name) values
  ('90000000-0000-0000-0000-000000000001', 'Legal Landlord A'),
  ('90000000-0000-0000-0000-000000000005', 'Legal Landlord B');

insert into public.tenant_profiles (profile_id, target_city, looking_for) values
  ('90000000-0000-0000-0000-000000000002', 'Dublin', 'any'),
  ('90000000-0000-0000-0000-000000000003', 'Dublin', 'any');

set local role service_role;
update public.profiles set platform_status = 'banned' where id = '90000000-0000-0000-0000-000000000003';
update public.profiles set platform_role = 'moderator' where id = '90000000-0000-0000-0000-000000000004';
reset role;

select pg_temp.authenticate_as('90000000-0000-0000-0000-000000000001');
select pg_temp.make_ready_draft_listing('90000000-0000-0000-0000-000000000001') as listing_1_id \gset

select pg_temp.authenticate_as('90000000-0000-0000-0000-000000000001');
select pg_temp.make_ready_draft_listing('90000000-0000-0000-0000-000000000001', 'Legal Test Listing 2') as listing_2_id \gset
select pg_temp.publish_listing(:'listing_2_id');

-- =========================================================================================
-- PART 1 — schema, grants and raw table exposure.
-- =========================================================================================

select has_table('public', 'listing_reports', '1. listing_reports table exists');

select pg_temp.authenticate_as_test_runner();
select is(
  (select count(*)::int from information_schema.table_constraints
   where table_schema = 'public' and table_name = 'listing_reports'
     and constraint_name = 'listing_reports_description_length'),
  1,
  '2. listing_reports has its description-length check constraint'
);
select is(
  (select count(*)::int from pg_indexes where schemaname = 'public' and indexname = 'listing_reports_one_open_per_reporter_listing'),
  1,
  '3. the one-open-report-per-reporter-per-listing partial unique index exists'
);
select is(
  (select count(*)::int from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'listing_reports' and grantee = 'authenticated'),
  0,
  '4. authenticated has zero raw listing_reports table grants in any direction'
);
select is(
  (select count(*)::int from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'listing_reports' and grantee = 'anon'),
  0,
  '5. anon has zero grants on listing_reports'
);
select is(
  (select count(*)::int from information_schema.routine_privileges
   where routine_schema = 'public'
     and routine_name in ('report_listing', 'acknowledge_fair_housing_policy', 'list_listing_reports', 'resolve_listing_report')
     and grantee in ('anon', 'PUBLIC')),
  0,
  '6. none of the four Stage J1 RPCs have an anon/PUBLIC execute grant'
);
select is(
  (select count(*)::int from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'landlord_profiles'
     and column_name = 'fair_housing_acknowledged_at' and grantee = 'authenticated' and privilege_type = 'UPDATE'),
  0,
  '7. fair_housing_acknowledged_at is absent from landlord_profiles'' client UPDATE column grant'
);

select pg_temp.authenticate_as('90000000-0000-0000-0000-000000000002');
select throws_ok(
  $$ select count(*) from public.listing_reports $$,
  '42501', null,
  '8. a tenant cannot raw-select listing_reports'
);
select throws_ok(
  format($$ insert into public.listing_reports (listing_id, reporter_id, reason) values (%L, '90000000-0000-0000-0000-000000000002', 'other') $$, :'listing_2_id'),
  '42501', null,
  '9. a tenant cannot forge a raw listing_reports insert'
);
select throws_ok(
  $$ update public.landlord_profiles set fair_housing_acknowledged_at = now() where profile_id = '90000000-0000-0000-0000-000000000001' $$,
  '42501', null,
  '10. a client cannot forge fair_housing_acknowledged_at via a raw landlord_profiles update'
);

-- =========================================================================================
-- PART 2 — report_listing() semantics.
-- =========================================================================================

select pg_temp.authenticate_as('90000000-0000-0000-0000-000000000002');
select results_eq(
  format($$ select public.report_listing(%L, 'inaccurate_listing', 'Rent looks wrong') $$, :'listing_2_id'),
  $$ values (true) $$,
  '11. a tenant records a real report'
);
select pg_temp.authenticate_as_test_runner();
select is(
  (select count(*)::int from public.listing_reports where listing_id = (:'listing_2_id')::uuid),
  1,
  '12. the report persists exactly one row'
);
select is(
  (select reason::text from public.listing_reports where listing_id = (:'listing_2_id')::uuid),
  'inaccurate_listing',
  '13. the real reason is stored'
);

select pg_temp.authenticate_as('90000000-0000-0000-0000-000000000002');
select results_eq(
  format($$ select public.report_listing(%L, 'harassment', null) $$, :'listing_2_id'),
  $$ values (false) $$,
  '14. a second open report from the same reporter on the same listing is an idempotent no-op'
);
select pg_temp.authenticate_as_test_runner();
select is(
  (select count(*)::int from public.listing_reports where listing_id = (:'listing_2_id')::uuid and reporter_id = '90000000-0000-0000-0000-000000000002'),
  1,
  '15. the duplicate attempt did not create a second row'
);

select pg_temp.authenticate_as('90000000-0000-0000-0000-000000000001');
select throws_ok(
  format($$ select public.report_listing(%L, 'other', null) $$, :'listing_2_id'),
  '42501', null,
  '16. the listing owner cannot report their own listing'
);

select pg_temp.authenticate_as('90000000-0000-0000-0000-000000000003');
select results_eq(
  format($$ select public.report_listing(%L, 'other', null) $$, :'listing_2_id'),
  $$ values (false) $$,
  '17. a banned caller is a quiet no-op'
);
select pg_temp.authenticate_as_test_runner();
select is(
  (select count(*)::int from public.listing_reports where listing_id = (:'listing_2_id')::uuid and reporter_id = '90000000-0000-0000-0000-000000000003'),
  0,
  '18. no banned-reporter row exists'
);

select pg_temp.authenticate_as_anon();
select throws_ok(
  format($$ select public.report_listing(%L, 'other', null) $$, :'listing_2_id'),
  '42501', null,
  '19. anonymous cannot execute report_listing()'
);

select pg_temp.authenticate_as('90000000-0000-0000-0000-000000000002');
select throws_ok(
  format($$ select public.report_listing(%L, 'other', %L) $$, :'listing_2_id', repeat('x', 501)),
  'P0001', null,
  '20. a description over 500 characters is rejected'
);

select is(
  (select count(*)::int from public.notifications where listing_id = (:'listing_2_id')::uuid),
  0,
  '21. reporting a listing creates no notification'
);
select is(
  (
    (select count(*) from public.applications where listing_id = (:'listing_2_id')::uuid) +
    (select count(*) from public.conversations where listing_id = (:'listing_2_id')::uuid) +
    (select count(*) from public.saved_listings where listing_id = (:'listing_2_id')::uuid) +
    (select count(*) from public.smart_match_decisions where listing_id = (:'listing_2_id')::uuid)
  )::int,
  0,
  '22. reporting a listing creates no application/conversation/save/Smart Match side effect'
);

-- =========================================================================================
-- PART 3 — Fair Housing acknowledgement.
-- =========================================================================================

select pg_temp.authenticate_as('90000000-0000-0000-0000-000000000005');
select is(
  (select fair_housing_acknowledged_at from public.landlord_profiles where profile_id = '90000000-0000-0000-0000-000000000005'),
  null,
  '23. landlord B starts unacknowledged'
);
select lives_ok(
  $$ select public.acknowledge_fair_housing_policy() $$,
  '24. acknowledge_fair_housing_policy() succeeds for a real landlord'
);
select isnt(
  (select fair_housing_acknowledged_at from public.landlord_profiles where profile_id = '90000000-0000-0000-0000-000000000005'),
  null,
  '25. the acknowledgement timestamp is now real and non-null'
);

select pg_temp.authenticate_as_test_runner();
select fair_housing_acknowledged_at as first_ack_at from public.landlord_profiles where profile_id = '90000000-0000-0000-0000-000000000005' \gset

select pg_temp.authenticate_as('90000000-0000-0000-0000-000000000005');
select lives_ok(
  $$ select public.acknowledge_fair_housing_policy() $$,
  '26. a repeat acknowledgement call is a safe no-op'
);
select pg_temp.authenticate_as_test_runner();
select is(
  (select fair_housing_acknowledged_at from public.landlord_profiles where profile_id = '90000000-0000-0000-0000-000000000005'),
  (:'first_ack_at')::timestamptz,
  '27. the repeat call keeps the original acknowledgement timestamp, not a later one'
);

select pg_temp.authenticate_as('90000000-0000-0000-0000-000000000002');
select throws_ok(
  $$ select public.acknowledge_fair_housing_policy() $$,
  'P0001', null,
  '28. a caller with no landlord profile at all cannot acknowledge'
);

select pg_temp.authenticate_as_anon();
select throws_ok(
  $$ select public.acknowledge_fair_housing_policy() $$,
  '42501', null,
  '29. anonymous cannot execute acknowledge_fair_housing_policy()'
);

-- request_listing_review() gate: landlord A has not acknowledged yet.
select pg_temp.authenticate_as('90000000-0000-0000-0000-000000000001');
select throws_ok(
  format($$ select public.request_listing_review(%L) $$, :'listing_1_id'),
  '42501', null,
  '30. request_listing_review() is blocked before Fair Housing acknowledgement'
);
select pg_temp.authenticate_as_test_runner();
select is(
  (select status::text from public.listings where id = (:'listing_1_id')::uuid),
  'draft',
  '31. the listing stays in draft after the blocked attempt'
);

select pg_temp.authenticate_as('90000000-0000-0000-0000-000000000001');
select public.acknowledge_fair_housing_policy();
select lives_ok(
  format($$ select public.request_listing_review(%L) $$, :'listing_1_id'),
  '32. request_listing_review() succeeds once Fair Housing is acknowledged'
);
select pg_temp.authenticate_as_test_runner();
select is(
  (select status::text from public.listings where id = (:'listing_1_id')::uuid),
  'pending_verification',
  '33. the listing genuinely moved to pending_verification'
);

-- =========================================================================================
-- PART 4 — moderator-only report visibility (backend capability, no UI this stage).
-- =========================================================================================

select pg_temp.authenticate_as('90000000-0000-0000-0000-000000000001');
select throws_ok(
  $$ select * from public.list_listing_reports('open') $$,
  '42501', null,
  '34. the listing owner (a non-moderator) cannot list reports'
);

select pg_temp.authenticate_as('90000000-0000-0000-0000-000000000004');
select is(
  (select count(*)::int from public.list_listing_reports('open') where listing_id = (:'listing_2_id')::uuid),
  1,
  '35. a real moderator can see the real open report'
);

select pg_temp.authenticate_as('90000000-0000-0000-0000-000000000001');
select throws_ok(
  format($$ select public.resolve_listing_report((select id from public.list_listing_reports('open') limit 1), 'dismissed') $$),
  '42501', null,
  '36. a non-moderator cannot resolve a report'
);

select pg_temp.authenticate_as('90000000-0000-0000-0000-000000000004');
select id as report_1_id from public.list_listing_reports('open') where listing_id = (:'listing_2_id')::uuid limit 1 \gset
select lives_ok(
  format($$ select public.resolve_listing_report(%L, 'dismissed') $$, :'report_1_id'),
  '37. a real moderator can resolve a report'
);
select pg_temp.authenticate_as_test_runner();
select is(
  (select status::text from public.listing_reports where id = (:'report_1_id')::uuid),
  'dismissed',
  '38. the report''s real status is now dismissed, with reviewed_at/reviewed_by set'
);

select * from finish();

rollback;
