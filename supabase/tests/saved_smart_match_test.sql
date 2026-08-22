-- Stage G saved listings / Smart Match tests — real pgTAP tests run against a real Postgres
-- instance (gafflo-dev — see the Stage G report). Everything runs inside one transaction and
-- rolls back. Quota-boundary tests (30th/31st Smart Match, 10th/11th Interested) create their
-- own throwaway published listings inside this same rolled-back transaction rather than
-- consuming any of the tiny shared production-like listing pool real E2E runs share — see the
-- Stage G report's own note on this exact tradeoff. Real concurrency (parallel HTTP races)
-- cannot be exercised inside a single pgTAP transaction — proven separately against the live
-- project and reported alongside this suite.

begin;

create extension if not exists pgtap with schema extensions;

select plan(58);

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

create function pg_temp.make_published_listing(p_owner uuid, p_title text default 'Smart Match test listing')
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
  ('50000000-0000-0000-0000-000000000001', 'sg-landlord-a@example.test'),
  ('50000000-0000-0000-0000-000000000002', 'sg-tenant-a@example.test'),
  ('50000000-0000-0000-0000-000000000003', 'sg-tenant-b@example.test'),
  ('50000000-0000-0000-0000-000000000004', 'sg-tenant-suspended@example.test'),
  ('50000000-0000-0000-0000-000000000005', 'sg-tenant-banned@example.test'),
  ('50000000-0000-0000-0000-000000000006', 'sg-tenant-no-profile@example.test'),
  ('50000000-0000-0000-0000-000000000007', 'sg-tenant-quota-smartmatch@example.test'),
  ('50000000-0000-0000-0000-000000000008', 'sg-tenant-quota-interested@example.test');
-- 004/005 (eventually suspended/banned) deliberately stay active during setup, matching every
-- earlier suite's fixture ordering.

-- request_listing_review() also gates on Fair Housing acknowledgement (Stage J1) — a real,
-- account-level prerequisite unrelated to what this suite is testing (saved listings/Smart
-- Match). Pre-seed the landlord fixture that calls make_published_listing() below as already-
-- acknowledged. See Stage P.
set local role service_role;
insert into public.landlord_profiles (profile_id, display_name, fair_housing_acknowledged_at) values
  ('50000000-0000-0000-0000-000000000001', 'Saved/Smart Match Landlord A', now());
reset role;

insert into public.tenant_profiles (profile_id, target_city, looking_for) values
  -- Landlord A also holds a tenant_profiles row — a real dual-role account — specifically so the
  -- own-listing rejection tests below can authenticate as the actual owner of own_listing_id,
  -- not a different, unrelated tenant identity (which would trivially pass ownership checks for
  -- the wrong reason).
  ('50000000-0000-0000-0000-000000000001', 'Dublin', 'any'),
  ('50000000-0000-0000-0000-000000000002', 'Dublin', 'any'),
  ('50000000-0000-0000-0000-000000000003', 'Dublin', 'any'),
  ('50000000-0000-0000-0000-000000000004', 'Dublin', 'any'),
  ('50000000-0000-0000-0000-000000000005', 'Dublin', 'any'),
  ('50000000-0000-0000-0000-000000000007', 'Dublin', 'any'),
  ('50000000-0000-0000-0000-000000000008', 'Dublin', 'any');
-- 006 deliberately has NO tenant_profiles row — used for the "tenant profile required" checks.

select pg_temp.authenticate_as('50000000-0000-0000-0000-000000000001');
select pg_temp.make_published_listing('50000000-0000-0000-0000-000000000001', 'SG Listing 1') as listing_1_id \gset
select pg_temp.publish_listing(:'listing_1_id');
select pg_temp.authenticate_as('50000000-0000-0000-0000-000000000001');
select pg_temp.make_published_listing('50000000-0000-0000-0000-000000000001', 'SG Listing 2') as listing_2_id \gset
select pg_temp.publish_listing(:'listing_2_id');
select pg_temp.authenticate_as('50000000-0000-0000-0000-000000000001');
select pg_temp.make_published_listing('50000000-0000-0000-0000-000000000001', 'SG Own Listing') as own_listing_id \gset
select pg_temp.publish_listing(:'own_listing_id');

-- A draft (never published) listing, for the "listing not eligible" checks.
select pg_temp.authenticate_as('50000000-0000-0000-0000-000000000001');
insert into public.listings (
  owner_id, listing_category, city, area, rent, deposit, available_from, min_stay_months,
  property_type, bedrooms, bathrooms, max_occupants, title, description
) values (
  '50000000-0000-0000-0000-000000000001', 'entire_property', 'Dublin', 'Rathmines', 1800, 1800, current_date + 30, 6,
  'apartment', 2, 1.0, 3, 'SG Draft Listing',
  'A genuinely lovely two bedroom apartment close to the village, with easy access to the city centre and public transport.'
) returning id as draft_listing_id \gset

-- =========================================================================================
-- PART 1 — schema/grants sanity.
-- =========================================================================================

select has_table('public', 'saved_listings', '1. saved_listings exists');
select has_table('public', 'smart_match_decisions', '2. smart_match_decisions exists');
select has_table('public', 'smart_match_daily_usage', '3. smart_match_daily_usage exists');

select pg_temp.authenticate_as_test_runner();
select is(
  (select count(*)::int from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'saved_listings' and grantee = 'authenticated' and privilege_type in ('INSERT', 'UPDATE', 'DELETE')),
  0,
  '4. authenticated has no direct write grant on saved_listings'
);
select is(
  (select count(*)::int from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'smart_match_decisions' and grantee = 'authenticated' and privilege_type in ('INSERT', 'UPDATE', 'DELETE')),
  0,
  '5. authenticated has no direct write grant on smart_match_decisions'
);
select is(
  (select count(*)::int from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'smart_match_daily_usage' and grantee = 'authenticated' and privilege_type in ('INSERT', 'UPDATE', 'DELETE')),
  0,
  '6. authenticated has no direct write/counter grant on smart_match_daily_usage'
);
select is(
  (select count(*)::int from information_schema.role_table_grants
   where table_schema = 'public' and table_name in ('saved_listings', 'smart_match_decisions', 'smart_match_daily_usage') and grantee = 'anon'),
  0,
  '7. anon has zero grants across all three tables'
);

-- =========================================================================================
-- PART 2 — set_listing_saved.
-- =========================================================================================

select pg_temp.authenticate_as('50000000-0000-0000-0000-000000000002');
select lives_ok(format($$ select public.set_listing_saved(%L, true) $$, :'listing_1_id'), '8. tenant A saves a real published listing');
select results_eq(
  format($$ select listing_id::text from public.saved_listings where tenant_id = '50000000-0000-0000-0000-000000000002' $$),
  format($$ values (%L) $$, :'listing_1_id'),
  '9. the save is persisted for real'
);
select lives_ok(format($$ select public.set_listing_saved(%L, true) $$, :'listing_1_id'), '10. re-saving the same listing is an idempotent no-op');
select is(
  (select count(*)::int from public.saved_listings where tenant_id = '50000000-0000-0000-0000-000000000002' and listing_id = (:'listing_1_id')::uuid),
  1,
  '11. the idempotent re-save did not create a duplicate row'
);

select pg_temp.authenticate_as('50000000-0000-0000-0000-000000000001');
select throws_ok(
  format($$ select public.set_listing_saved(%L, true) $$, :'own_listing_id'),
  '42501', null,
  '12. a landlord-tenant dual-role cannot save their own listing'
);
select pg_temp.authenticate_as('50000000-0000-0000-0000-000000000002');
select throws_ok(
  format($$ select public.set_listing_saved(%L, true) $$, :'draft_listing_id'),
  null::char(5), null,
  '13. a non-published listing cannot be newly saved'
);

select pg_temp.authenticate_as('50000000-0000-0000-0000-000000000003');
select is(
  (select count(*)::int from public.saved_listings where tenant_id = '50000000-0000-0000-0000-000000000003'),
  0,
  '14. tenant B cannot read tenant A''s save (RLS)'
);

select pg_temp.authenticate_as_test_runner();
select is(
  (select count(*)::int from public.saved_listings where tenant_id = '50000000-0000-0000-0000-000000000001'),
  0,
  '15. the listing owner (landlord) has no save row of their own and no visibility into tenant A''s'
);

select pg_temp.authenticate_as('50000000-0000-0000-0000-000000000002');
select lives_ok(format($$ select public.set_listing_saved(%L, false) $$, :'listing_1_id'), '16. tenant A unsaves the listing');
select is(
  (select count(*)::int from public.saved_listings where tenant_id = '50000000-0000-0000-0000-000000000002' and listing_id = (:'listing_1_id')::uuid),
  0,
  '17. the unsave is persisted for real'
);
select lives_ok(format($$ select public.set_listing_saved(%L, false) $$, :'listing_1_id'), '18. re-unsaving an already-absent save is an idempotent no-op');

select pg_temp.authenticate_as_anon();
select throws_ok(
  format($$ select public.set_listing_saved(%L, true) $$, :'listing_1_id'),
  null::char(5), null,
  '19. anonymous cannot save anything'
);

-- =========================================================================================
-- PART 3 — record_smart_match_decision: persistence, idempotency, conflict, eligibility.
-- =========================================================================================

select pg_temp.authenticate_as('50000000-0000-0000-0000-000000000002');
select lives_ok(format($$ select public.record_smart_match_decision(%L, 'pass') $$, :'listing_1_id'), '20. tenant A records a real Pass decision');
select results_eq(
  format($$ select decision::text from public.smart_match_decisions where tenant_id = '50000000-0000-0000-0000-000000000002' and listing_id = %L $$, :'listing_1_id'),
  $$ values ('pass') $$,
  '21. the Pass decision is persisted for real'
);

select lives_ok(format($$ select public.record_smart_match_decision(%L, 'interested') $$, :'listing_2_id'), '22. tenant A records a real Interested decision on a different listing');
select results_eq(
  format($$ select decision::text from public.smart_match_decisions where tenant_id = '50000000-0000-0000-0000-000000000002' and listing_id = %L $$, :'listing_2_id'),
  $$ values ('interested') $$,
  '23. the Interested decision is persisted for real'
);

select lives_ok(format($$ select public.record_smart_match_decision(%L, 'pass') $$, :'listing_1_id'), '24. retrying the SAME decision on the SAME listing is an idempotent no-op');
select is(
  (select count(*)::int from public.smart_match_decisions where tenant_id = '50000000-0000-0000-0000-000000000002' and listing_id = (:'listing_1_id')::uuid),
  1,
  '25. the idempotent retry did not create a second decision row'
);

select throws_ok(
  format($$ select public.record_smart_match_decision(%L, 'interested') $$, :'listing_1_id'),
  '42501', null,
  '26. an opposite second decision on the same listing is rejected, never silently mutated'
);
select results_eq(
  format($$ select decision::text from public.smart_match_decisions where tenant_id = '50000000-0000-0000-0000-000000000002' and listing_id = %L $$, :'listing_1_id'),
  $$ values ('pass') $$,
  '27. the original decision is unchanged after the rejected opposite attempt'
);

select pg_temp.authenticate_as('50000000-0000-0000-0000-000000000001');
select throws_ok(
  format($$ select public.record_smart_match_decision(%L, 'pass') $$, :'own_listing_id'),
  '42501', null,
  '28. a landlord-tenant dual-role cannot Smart Match their own listing'
);
select pg_temp.authenticate_as('50000000-0000-0000-0000-000000000002');
select throws_ok(
  format($$ select public.record_smart_match_decision(%L, 'pass') $$, :'draft_listing_id'),
  null::char(5), null,
  '29. a non-published listing is not a valid Smart Match candidate'
);

select pg_temp.authenticate_as('50000000-0000-0000-0000-000000000006');
select throws_ok(
  format($$ select public.record_smart_match_decision(%L, 'pass') $$, :'listing_2_id'),
  null::char(5), null,
  '30. an identity with no tenant profile cannot record a Smart Match decision'
);

select pg_temp.authenticate_as('50000000-0000-0000-0000-000000000003');
select is(
  (select count(*)::int from public.smart_match_decisions where tenant_id = '50000000-0000-0000-0000-000000000003'),
  0,
  '31. tenant B cannot read tenant A''s Smart Match decisions (RLS)'
);

select pg_temp.authenticate_as_test_runner();
select is(
  (select count(*)::int from public.smart_match_decisions where listing_id = (:'listing_1_id')::uuid and tenant_id <> '50000000-0000-0000-0000-000000000002'),
  0,
  '32. the listing owner (landlord) has no visibility into who Smart Matched their listing'
);

select pg_temp.authenticate_as_anon();
select throws_ok(
  format($$ select public.record_smart_match_decision(%L, 'pass') $$, :'listing_2_id'),
  null::char(5), null,
  '33. anonymous cannot record a Smart Match decision'
);

-- =========================================================================================
-- PART 4 — Interested is not an application and does not touch Messaging.
-- =========================================================================================

select pg_temp.authenticate_as_test_runner();
select is(
  (select count(*)::int from public.applications where tenant_id = '50000000-0000-0000-0000-000000000002' and listing_id = (:'listing_2_id')::uuid),
  0,
  '34. recording Interested created no application row'
);
select is(
  (select count(*)::int from public.conversations where tenant_id = '50000000-0000-0000-0000-000000000002' and listing_id = (:'listing_2_id')::uuid),
  0,
  '35. recording Interested created no conversation row'
);
select is(
  (select count(*)::int from public.messages m join public.conversations c on c.id = m.conversation_id where c.listing_id = (:'listing_2_id')::uuid),
  0,
  '36. recording Interested sent no message'
);

-- =========================================================================================
-- PART 5 — Quotas: Pass vs Interested consumption, Dublin usage day, boundary enforcement.
-- =========================================================================================

select pg_temp.authenticate_as('50000000-0000-0000-0000-000000000007');
select pg_temp.authenticate_as('50000000-0000-0000-0000-000000000001');
select pg_temp.make_published_listing('50000000-0000-0000-0000-000000000001', 'SG Quota Listing Pass') as quota_pass_listing_id \gset
select pg_temp.publish_listing(:'quota_pass_listing_id');
select pg_temp.authenticate_as('50000000-0000-0000-0000-000000000001');
select pg_temp.make_published_listing('50000000-0000-0000-0000-000000000001', 'SG Quota Listing Interested') as quota_interested_listing_id \gset
select pg_temp.publish_listing(:'quota_interested_listing_id');

select pg_temp.authenticate_as('50000000-0000-0000-0000-000000000007');
select public.record_smart_match_decision(:'quota_pass_listing_id'::uuid, 'pass');
select results_eq(
  $$ select smart_match_count, interested_count from public.smart_match_daily_usage where tenant_id = '50000000-0000-0000-0000-000000000007' $$,
  $$ values (1, 0) $$,
  '37. a Pass increments smart_match_count only'
);

select public.record_smart_match_decision(:'quota_interested_listing_id'::uuid, 'interested');
select results_eq(
  $$ select smart_match_count, interested_count from public.smart_match_daily_usage where tenant_id = '50000000-0000-0000-0000-000000000007' $$,
  $$ values (2, 1) $$,
  '38. an Interested increments BOTH smart_match_count and interested_count'
);

select results_eq(
  $$ select usage_date from public.smart_match_daily_usage where tenant_id = '50000000-0000-0000-0000-000000000007' $$,
  $$ values ((timezone('Europe/Dublin', now()))::date) $$,
  '39. the usage row''s date is the real server-derived Europe/Dublin day'
);

select pg_temp.authenticate_as('50000000-0000-0000-0000-000000000003');
select results_eq(
  $$ select usage_date, smart_match_count, interested_count from public.get_smart_match_usage() $$,
  format($$ values ((timezone('Europe/Dublin', now()))::date, %s, %s) $$, 0, 0),
  '40. get_smart_match_usage() returns zeros for a tenant with no decisions yet today, not an error'
);

-- Drive tenant 007's usage to the boundary (2 already recorded above -> 28 more Pass decisions
-- to reach exactly 30), each against its own throwaway listing, entirely inside this rolled-back
-- transaction — never touching the real shared listing pool.
select pg_temp.authenticate_as('50000000-0000-0000-0000-000000000007');
do $$
declare
  v_listing_id uuid;
  i integer;
begin
  for i in 1..28 loop
    perform pg_temp.authenticate_as('50000000-0000-0000-0000-000000000001');
    v_listing_id := pg_temp.make_published_listing('50000000-0000-0000-0000-000000000001', 'SG Quota Filler ' || i);
    perform pg_temp.publish_listing(v_listing_id);
    perform pg_temp.authenticate_as('50000000-0000-0000-0000-000000000007');
    perform public.record_smart_match_decision(v_listing_id, 'pass');
  end loop;
end;
$$;

select results_eq(
  $$ select smart_match_count from public.smart_match_daily_usage where tenant_id = '50000000-0000-0000-0000-000000000007' $$,
  $$ values (30) $$,
  '41. smart_match_count reached exactly 30 after the 30th decision'
);

select pg_temp.authenticate_as('50000000-0000-0000-0000-000000000001');
select pg_temp.make_published_listing('50000000-0000-0000-0000-000000000001', 'SG Quota 31st') as quota_31_listing_id \gset
select pg_temp.publish_listing(:'quota_31_listing_id');
select pg_temp.authenticate_as('50000000-0000-0000-0000-000000000007');
select throws_ok(
  format($$ select public.record_smart_match_decision(%L, 'pass') $$, :'quota_31_listing_id'),
  '42501', null,
  '42. the 31st Smart Match decision is rejected'
);
select is(
  (select count(*)::int from public.smart_match_decisions where tenant_id = '50000000-0000-0000-0000-000000000007' and listing_id = (:'quota_31_listing_id')::uuid),
  0,
  '43. the rejected 31st attempt created no decision row'
);
select results_eq(
  $$ select smart_match_count from public.smart_match_daily_usage where tenant_id = '50000000-0000-0000-0000-000000000007' $$,
  $$ values (30) $$,
  '44. the rejected 31st attempt did not increment usage'
);

-- A genuinely separate, fresh tenant (007 is already pinned at exactly 30/30 above) for the
-- Interested-specific 10/11 boundary, so smart_match_count staying comfortably under 30 is what
-- isolates this as a real test of the interested_count limit specifically, not the general one.
select pg_temp.authenticate_as('50000000-0000-0000-0000-000000000008');
do $$
declare
  v_listing_id uuid;
  i integer;
begin
  for i in 1..10 loop
    perform pg_temp.authenticate_as('50000000-0000-0000-0000-000000000001');
    v_listing_id := pg_temp.make_published_listing('50000000-0000-0000-0000-000000000001', 'SG Interested Filler ' || i);
    perform pg_temp.publish_listing(v_listing_id);
    perform pg_temp.authenticate_as('50000000-0000-0000-0000-000000000008');
    perform public.record_smart_match_decision(v_listing_id, 'interested');
  end loop;
end;
$$;

select results_eq(
  $$ select smart_match_count, interested_count from public.smart_match_daily_usage where tenant_id = '50000000-0000-0000-0000-000000000008' $$,
  $$ values (10, 10) $$,
  '45. interested_count reached exactly 10 after the 10th Interested decision (smart_match_count also 10, well under its own 30 limit)'
);

select pg_temp.authenticate_as('50000000-0000-0000-0000-000000000001');
select pg_temp.make_published_listing('50000000-0000-0000-0000-000000000001', 'SG Interested 11th') as interested_11_listing_id \gset
select pg_temp.publish_listing(:'interested_11_listing_id');
select pg_temp.authenticate_as('50000000-0000-0000-0000-000000000008');
select throws_ok(
  format($$ select public.record_smart_match_decision(%L, 'interested') $$, :'interested_11_listing_id'),
  '42501', null,
  '46. the 11th Interested decision is rejected even though Smart Match quota (10/30) is not exhausted'
);
select is(
  (select count(*)::int from public.smart_match_decisions where tenant_id = '50000000-0000-0000-0000-000000000008' and listing_id = (:'interested_11_listing_id')::uuid),
  0,
  '47. the rejected 11th Interested attempt created no decision row'
);

-- The canonical Stage G example: Interested exhausted (10/10) but Smart Match is not (10/30) —
-- Pass must still work on that same tenant, on a fresh listing.
select lives_ok(
  format($$ select public.record_smart_match_decision(%L, 'pass') $$, :'interested_11_listing_id'),
  '48. Pass still works for the same tenant after their Interested quota (10/10) is exhausted, since Smart Match (10/30) is not'
);
select results_eq(
  $$ select smart_match_count, interested_count from public.smart_match_daily_usage where tenant_id = '50000000-0000-0000-0000-000000000008' $$,
  $$ values (11, 10) $$,
  '49. that Pass incremented smart_match_count only, leaving interested_count at its capped 10'
);

-- =========================================================================================
-- PART 6 — No client-forgeable quota/plan/date parameters.
-- =========================================================================================

select is(
  (select pg_get_function_identity_arguments('public.record_smart_match_decision'::regproc)),
  'p_listing_id uuid, p_decision smart_match_decision_t',
  '50. record_smart_match_decision() accepts only a listing id and a real enum decision — no plan/limit/date/tenant parameter exists to forge'
);
select is(
  (select pg_get_function_identity_arguments('public.get_smart_match_usage'::regproc)),
  '',
  '51. get_smart_match_usage() takes no arguments at all — the usage day can only ever be the server''s own Europe/Dublin "now"'
);

-- =========================================================================================
-- PART 7 — Platform status: banned/suspended, matching the documented Stage G policy (Save is
-- banned-gated only, like mute/archive; a NEW Smart Match decision requires full active, like
-- create_application()).
-- =========================================================================================

set local role service_role;
update public.profiles set platform_status = 'suspended' where id = '50000000-0000-0000-0000-000000000004';
update public.profiles set platform_status = 'banned' where id = '50000000-0000-0000-0000-000000000005';
reset role;

select pg_temp.authenticate_as('50000000-0000-0000-0000-000000000004');
select lives_ok(
  format($$ select public.set_listing_saved(%L, true) $$, :'listing_1_id'),
  '52. a SUSPENDED tenant can still save a listing (private, zero-exposure action)'
);
select throws_ok(
  format($$ select public.record_smart_match_decision(%L, 'pass') $$, :'listing_2_id'),
  '42501', null,
  '53. a SUSPENDED tenant cannot record a NEW Smart Match decision (creates a new interaction, matches create_application()''s own gate)'
);

select pg_temp.authenticate_as('50000000-0000-0000-0000-000000000005');
select throws_ok(
  format($$ select public.set_listing_saved(%L, true) $$, :'listing_1_id'),
  '42501', null,
  '54. a BANNED tenant cannot save a listing'
);
select throws_ok(
  format($$ select public.record_smart_match_decision(%L, 'pass') $$, :'listing_2_id'),
  '42501', null,
  '55. a BANNED tenant cannot record a Smart Match decision'
);

-- =========================================================================================
-- PART 8 — Immutability: no client bypass of the guarded functions via direct DML.
-- =========================================================================================

select pg_temp.authenticate_as('50000000-0000-0000-0000-000000000002');
select throws_ok(
  format($$ insert into public.saved_listings (tenant_id, listing_id) values ('50000000-0000-0000-0000-000000000002', %L) $$, :'listing_2_id'),
  null::char(5), null,
  '56. a forged direct insert into saved_listings is blocked'
);
select throws_ok(
  format($$ insert into public.smart_match_decisions (tenant_id, listing_id, decision) values ('50000000-0000-0000-0000-000000000002', %L, 'pass') $$, :'quota_31_listing_id'),
  null::char(5), null,
  '57. a forged direct insert into smart_match_decisions is blocked'
);
select throws_ok(
  $$ update public.smart_match_daily_usage set smart_match_count = 0 where tenant_id = '50000000-0000-0000-0000-000000000002' $$,
  null::char(5), null,
  '58. a forged direct counter reset/decrement on smart_match_daily_usage is blocked'
);

select * from finish();
rollback;
