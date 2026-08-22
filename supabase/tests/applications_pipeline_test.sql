-- Phase 2 applications pipeline tests — real pgTAP tests run against a real Postgres instance
-- (see the Phase 2 report for exactly which runs were against the real Supabase project vs.
-- this repeatable committed suite). Everything runs inside one transaction and rolls back.

begin;

create extension if not exists pgtap with schema extensions;

select plan(60);

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

select pg_temp.authenticate_as_test_runner();

-- =========================================================================================
-- PART 1 — Rental Fit parity against the real frontend (src/utils/calculatePropertyMatch.js).
-- Every expected value below was captured by actually running the frontend function (via
-- vitest, not hand-computed) against these exact fixtures — see the Phase 2 report.
-- jsonb_populate_record lets each case start from one real base row and override just the
-- fields that case changes, without needing 11 separate real INSERTs or a fragile positional
-- ROW(...) literal for every one of tenant_profiles'/listings' ~20-46 columns.
-- =========================================================================================

insert into auth.users (id, email) values
  ('ab000000-0000-0000-0000-00000000ab01', 'rf-landlord@example.test'),
  ('ab000000-0000-0000-0000-00000000ab02', 'rf-tenant@example.test');

insert into public.tenant_profiles (
  profile_id, target_city, preferred_areas, budget_min, budget_max, move_in_date,
  household_size, lease_length_months, looking_for, furnished_preference, parking_needed,
  smoking, pets, references_ready, income_ready, id_ready
) values (
  'ab000000-0000-0000-0000-00000000ab02', 'Dublin', array['Rathmines'], 1400, 2200, '2027-02-01',
  2, 12, 'any', 'furnished', false,
  'no', 'none', true, true, true
);

insert into public.listings (
  owner_id, listing_category, city, area, rent, available_from, max_occupants, min_stay_months,
  furnished, parking, smoking_policy, pets_policy, property_type, bedrooms, bathrooms
) values (
  'ab000000-0000-0000-0000-00000000ab01', 'entire_property', 'Dublin', 'Rathmines', 1200, '2027-02-10', 2, 6,
  'furnished', 'none', 'no', 'not_allowed', 'apartment', 2, 1
);

insert into public.listings (
  owner_id, listing_category, city, area, rent, available_from, max_occupants, min_stay_months,
  furnished, parking, smoking_policy, pets_policy,
  parent_property_type, room_type, total_bedrooms, bathroom_arrangement,
  current_household_size, max_household_size, couples_accepted, bills_included
) values (
  'ab000000-0000-0000-0000-00000000ab01', 'private_room', 'Dublin', 'Rathmines', 1200, '2027-02-10', 1, 6,
  'furnished', 'none', 'no', 'not_allowed',
  'apartment', 'double', 2, 'shared',
  1, 2, false, false
);

insert into public.listings (
  owner_id, listing_category, city, area, rent, available_from, max_occupants, min_stay_months,
  furnished, parking, smoking_policy, pets_policy,
  parent_property_type, room_type, total_bedrooms, bathroom_arrangement,
  current_household_size, max_household_size, couples_accepted, owner_lives_in_property
) values (
  'ab000000-0000-0000-0000-00000000ab01', 'owner_occupied_room', 'Dublin', 'Rathmines', 1200, '2027-02-10', 1, 6,
  'furnished', 'none', 'no', 'not_allowed',
  'apartment', 'ensuite', 2, 'ensuite',
  1, 2, false, true
);

do $$
declare
  v_tenant public.tenant_profiles;
  v_listing public.listings;
  v_room public.listings;
  v_owner_room public.listings;
begin
  select * into v_tenant from public.tenant_profiles where profile_id = 'ab000000-0000-0000-0000-00000000ab02';
  select * into v_listing from public.listings where owner_id = 'ab000000-0000-0000-0000-00000000ab01' and listing_category = 'entire_property';
  select * into v_room from public.listings where owner_id = 'ab000000-0000-0000-0000-00000000ab01' and listing_category = 'private_room';
  select * into v_owner_room from public.listings where owner_id = 'ab000000-0000-0000-0000-00000000ab01' and listing_category = 'owner_occupied_room';

  perform set_config('pgtap.v_tenant_id', v_tenant.profile_id::text, false);
  perform set_config('pgtap.v_listing_id', v_listing.id::text, false);
  perform set_config('pgtap.v_room_id', v_room.id::text, false);
  perform set_config('pgtap.v_owner_room_id', v_owner_room.id::text, false);
end;
$$;

-- 1. Base case: known city/area match, rent below stated minimum (a reason, not a hard stop),
-- full readiness, everything else compatible.
select is(
  public.calculate_rental_fit(
    (select t from public.tenant_profiles t where t.profile_id = current_setting('pgtap.v_tenant_id')::uuid),
    (select l from public.listings l where l.id = current_setting('pgtap.v_listing_id')::uuid)
  ),
  '{"score":100,"reasons":["This listing is in Dublin, matching your target city.","It is located in one of your preferred areas.","The monthly rent is below your stated minimum budget.","The available date is close to your move-in date.","The listed occupancy can fit your household size.","The minimum lease term fits your preference.","The furnishing setup fits your preference.","The listing rules fit your smoking and pet preferences.","Your references, income proof and ID readiness are strong for this listing."],"warnings":[],"hard_stops":[]}'::jsonb,
  '1. base case matches the real frontend output exactly (score 100, all 9 reasons, no warnings/hard stops)'
);

-- 2. Occupancy hard stop caps score at 58.
select is(
  public.calculate_rental_fit(
    (select t from public.tenant_profiles t where t.profile_id = current_setting('pgtap.v_tenant_id')::uuid),
    jsonb_populate_record((select l from public.listings l where l.id = current_setting('pgtap.v_listing_id')::uuid), '{"max_occupants": 1}'::jsonb)
  ),
  '{"score":58,"reasons":["This listing is in Dublin, matching your target city.","It is located in one of your preferred areas.","The monthly rent is below your stated minimum budget.","The available date is close to your move-in date.","The minimum lease term fits your preference.","The furnishing setup fits your preference.","The listing rules fit your smoking and pet preferences.","Your references, income proof and ID readiness are strong for this listing."],"warnings":[],"hard_stops":["The listed maximum occupancy is too small for your household."]}'::jsonb,
  '2. an occupancy hard stop caps score at 58, matching the frontend'
);

-- 3. Skipped budget is unscored, never a hard stop, score stays above the hard-stop cap.
select is(
  public.calculate_rental_fit(
    jsonb_populate_record((select t from public.tenant_profiles t where t.profile_id = current_setting('pgtap.v_tenant_id')::uuid), '{"budget_min": null, "budget_max": null}'::jsonb),
    (select l from public.listings l where l.id = current_setting('pgtap.v_listing_id')::uuid)
  ),
  '{"score":100,"reasons":["This listing is in Dublin, matching your target city.","It is located in one of your preferred areas.","The available date is close to your move-in date.","The listed occupancy can fit your household size.","The minimum lease term fits your preference.","The furnishing setup fits your preference.","The listing rules fit your smoking and pet preferences.","Your references, income proof and ID readiness are strong for this listing."],"warnings":["Budget is not set yet, so rent fit is not scored."],"hard_stops":[]}'::jsonb,
  '3. a skipped budget is unscored (warning only), never treated as a EUR0 hard stop'
);

-- 4. A max-only budget treats the unset min as unbounded (0), not as a mismatch.
select is(
  public.calculate_rental_fit(
    jsonb_populate_record((select t from public.tenant_profiles t where t.profile_id = current_setting('pgtap.v_tenant_id')::uuid), '{"budget_min": null, "budget_max": 1500}'::jsonb),
    (select l from public.listings l where l.id = current_setting('pgtap.v_listing_id')::uuid)
  ),
  '{"score":100,"reasons":["This listing is in Dublin, matching your target city.","It is located in one of your preferred areas.","The monthly rent is within your budget.","The available date is close to your move-in date.","The listed occupancy can fit your household size.","The minimum lease term fits your preference.","The furnishing setup fits your preference.","The listing rules fit your smoking and pet preferences.","Your references, income proof and ID readiness are strong for this listing."],"warnings":[],"hard_stops":[]}'::jsonb,
  '4. a max-only budget treats the unset minimum as unbounded, not zero'
);

-- 5. A min-only budget treats the unset max as unbounded (never Infinity, which numeric can''t
-- represent — see the migration comment on calculate_rental_fit for why this is provably
-- equivalent to the frontend without needing an infinite value at all).
select is(
  public.calculate_rental_fit(
    jsonb_populate_record((select t from public.tenant_profiles t where t.profile_id = current_setting('pgtap.v_tenant_id')::uuid), '{"budget_min": 1000, "budget_max": null}'::jsonb),
    jsonb_populate_record((select l from public.listings l where l.id = current_setting('pgtap.v_listing_id')::uuid), '{"rent": 5000}'::jsonb)
  ),
  '{"score":100,"reasons":["This listing is in Dublin, matching your target city.","It is located in one of your preferred areas.","The monthly rent is within your budget.","The available date is close to your move-in date.","The listed occupancy can fit your household size.","The minimum lease term fits your preference.","The furnishing setup fits your preference.","The listing rules fit your smoking and pet preferences.","Your references, income proof and ID readiness are strong for this listing."],"warnings":[],"hard_stops":[]}'::jsonb,
  '5. a min-only budget treats the unset maximum as unbounded, even at 5000 rent'
);

-- 6. A minimal/near-empty tenant profile never invents a household size or move-in date.
select is(
  public.calculate_rental_fit(
    jsonb_populate_record(null::public.tenant_profiles, '{"target_city": "Dublin", "looking_for": "any", "budget_min": null, "budget_max": null, "move_in_date": null, "household_size": null, "preferred_areas": [], "furnished_preference": "any", "pets": "none", "smoking": "no", "parking_needed": false, "applying_as_couple": false, "owner_occupied_acceptable": true, "references_ready": false, "income_ready": false, "id_ready": false, "private_bathroom_preferred": false, "bills_included_preferred": false}'::jsonb),
    (select l from public.listings l where l.id = current_setting('pgtap.v_listing_id')::uuid)
  ),
  '{"score":78,"reasons":["This listing is in Dublin, matching your target city.","The listed occupancy can fit your household size.","The minimum lease term fits your preference.","The furnishing setup fits your preference.","The listing rules fit your smoking and pet preferences."],"warnings":["Budget is not set yet, so rent fit is not scored.","Move-in timing is incomplete, so date fit is not scored.","Application readiness is not set yet."],"hard_stops":[]}'::jsonb,
  '6. a minimal tenant profile scores 78 with no hard stops, matching the frontend exactly'
);

-- 7. Multiple room-specific hard stops (couple room refused, capacity exceeded, occupancy too
-- small) stack, still capped at 58, alongside independent warnings for bathroom/bills.
select is(
  public.calculate_rental_fit(
    jsonb_populate_record((select t from public.tenant_profiles t where t.profile_id = current_setting('pgtap.v_tenant_id')::uuid), '{"looking_for": "room", "household_size": 2, "applying_as_couple": true, "private_bathroom_preferred": true, "bills_included_preferred": true}'::jsonb),
    (select l from public.listings l where l.id = current_setting('pgtap.v_room_id')::uuid)
  ),
  '{"score":58,"reasons":["This room matches what you are looking for.","This listing is in Dublin, matching your target city.","It is located in one of your preferred areas.","The monthly rent is below your stated minimum budget.","The available date is close to your move-in date.","The minimum lease term fits your preference.","The furnishing setup fits your preference.","The listing rules fit your smoking and pet preferences.","Your references, income proof and ID readiness are strong for this listing."],"warnings":["This room has a shared bathroom.","Bills are separate for this room."],"hard_stops":["This room occupancy is too small for the applicants.","Couples are not accepted for this room.","Household capacity exceeded."]}'::jsonb,
  '7. three stacked room hard stops still cap at 58, matching the frontend'
);

-- 8. Pets "considered" is a warning, not a hard stop.
select is(
  public.calculate_rental_fit(
    jsonb_populate_record((select t from public.tenant_profiles t where t.profile_id = current_setting('pgtap.v_tenant_id')::uuid), '{"pets": "dog"}'::jsonb),
    jsonb_populate_record((select l from public.listings l where l.id = current_setting('pgtap.v_listing_id')::uuid), '{"pets_policy": "considered"}'::jsonb)
  ),
  '{"score":100,"reasons":["This listing is in Dublin, matching your target city.","It is located in one of your preferred areas.","The monthly rent is below your stated minimum budget.","The available date is close to your move-in date.","The listed occupancy can fit your household size.","The minimum lease term fits your preference.","The furnishing setup fits your preference.","Your references, income proof and ID readiness are strong for this listing."],"warnings":["Pets are considered for this listing, but acceptance is not guaranteed."],"hard_stops":[]}'::jsonb,
  '8. pets policy "considered" is a warning, not a hard stop, matching the frontend'
);

-- 9. Pets "not_allowed" for a pet-owning tenant IS a hard stop.
select is(
  public.calculate_rental_fit(
    jsonb_populate_record((select t from public.tenant_profiles t where t.profile_id = current_setting('pgtap.v_tenant_id')::uuid), '{"pets": "dog"}'::jsonb),
    (select l from public.listings l where l.id = current_setting('pgtap.v_listing_id')::uuid)
  ),
  '{"score":58,"reasons":["This listing is in Dublin, matching your target city.","It is located in one of your preferred areas.","The monthly rent is below your stated minimum budget.","The available date is close to your move-in date.","The listed occupancy can fit your household size.","The minimum lease term fits your preference.","The furnishing setup fits your preference.","Your references, income proof and ID readiness are strong for this listing."],"warnings":[],"hard_stops":["Some listing rules may not fit your smoking or pet preferences."]}'::jsonb,
  '9. pets policy "not_allowed" for a pet-owning tenant is a hard stop, matching the frontend'
);

-- 10. Owner-occupied excluded by explicit tenant preference is a hard stop.
select is(
  public.calculate_rental_fit(
    jsonb_populate_record((select t from public.tenant_profiles t where t.profile_id = current_setting('pgtap.v_tenant_id')::uuid), '{"looking_for": "room", "household_size": 1, "owner_occupied_acceptable": false}'::jsonb),
    (select l from public.listings l where l.id = current_setting('pgtap.v_owner_room_id')::uuid)
  ),
  '{"score":58,"reasons":["This room matches what you are looking for.","This listing is in Dublin, matching your target city.","It is located in one of your preferred areas.","The monthly rent is below your stated minimum budget.","The available date is close to your move-in date.","The listed occupancy can fit your household size.","The minimum lease term fits your preference.","The furnishing setup fits your preference.","The listing rules fit your smoking and pet preferences.","Your references, income proof and ID readiness are strong for this listing."],"warnings":[],"hard_stops":["Owner-occupied excluded by tenant preference."]}'::jsonb,
  '10. owner-occupied explicitly excluded by tenant preference is a hard stop, matching the frontend'
);

-- 11. Owner-occupied accepted yields a positive reason instead, no hard stop.
select is(
  public.calculate_rental_fit(
    jsonb_populate_record((select t from public.tenant_profiles t where t.profile_id = current_setting('pgtap.v_tenant_id')::uuid), '{"looking_for": "room", "household_size": 1, "owner_occupied_acceptable": true}'::jsonb),
    (select l from public.listings l where l.id = current_setting('pgtap.v_owner_room_id')::uuid)
  ),
  '{"score":100,"reasons":["This room matches what you are looking for.","This listing is in Dublin, matching your target city.","It is located in one of your preferred areas.","The monthly rent is below your stated minimum budget.","The available date is close to your move-in date.","The listed occupancy can fit your household size.","Owner lives in the property.","The minimum lease term fits your preference.","The furnishing setup fits your preference.","The listing rules fit your smoking and pet preferences.","Your references, income proof and ID readiness are strong for this listing."],"warnings":[],"hard_stops":[]}'::jsonb,
  '11. owner-occupied accepted yields "Owner lives in the property" reason, no hard stop, matching the frontend'
);

-- =========================================================================================
-- PART 2 — create_application: auth, ownership, duplicates, atomicity.
-- =========================================================================================

insert into auth.users (id, email) values
  ('20000000-0000-0000-0000-000000000001', 'app-landlord-a@example.test'),
  ('20000000-0000-0000-0000-000000000002', 'app-landlord-b@example.test'),
  ('20000000-0000-0000-0000-000000000003', 'app-tenant-a@example.test'),
  ('20000000-0000-0000-0000-000000000004', 'app-tenant-b@example.test'),
  ('20000000-0000-0000-0000-000000000005', 'app-moderator@example.test'),
  ('20000000-0000-0000-0000-000000000006', 'app-tenant-suspended@example.test'),
  ('20000000-0000-0000-0000-000000000007', 'app-tenant-banned@example.test'),
  ('20000000-0000-0000-0000-000000000008', 'app-landlord-suspended@example.test');

set local role service_role;
update public.profiles set platform_role = 'moderator' where id = '20000000-0000-0000-0000-000000000005';
update public.profiles set platform_status = 'suspended' where id = '20000000-0000-0000-0000-000000000006';
update public.profiles set platform_status = 'banned' where id = '20000000-0000-0000-0000-000000000007';
reset role;

-- request_listing_review() also gates on Fair Housing acknowledgement (Stage J1) — a real,
-- account-level prerequisite unrelated to what this suite is testing (the application pipeline).
-- Pre-seed every landlord fixture that calls make_published_listing() below as already-
-- acknowledged, so those calls succeed for the reason this file actually cares about, never
-- because a fixture forgot to acknowledge a policy. See Stage P.
set local role service_role;
insert into public.landlord_profiles (profile_id, display_name, fair_housing_acknowledged_at) values
  ('20000000-0000-0000-0000-000000000001', 'Applications Landlord A', now()),
  ('20000000-0000-0000-0000-000000000002', 'Applications Landlord B', now()),
  ('20000000-0000-0000-0000-000000000008', 'Applications Suspended Landlord', now());
reset role;

-- identity 008 (the eventually-suspended landlord) is deliberately NOT suspended yet here —
-- its own listing has to be built while still active, exactly like Phase 1D''s fixtures: below,
-- make_published_listing() calls request_listing_review() internally, which is itself gated on
-- is_caller_active() and would fail immediately if 008 were already suspended at this point.

insert into public.tenant_profiles (profile_id, target_city, looking_for) values
  ('20000000-0000-0000-0000-000000000003', 'Dublin', 'any'),
  ('20000000-0000-0000-0000-000000000004', 'Dublin', 'any'),
  ('20000000-0000-0000-0000-000000000006', 'Dublin', 'any'),
  ('20000000-0000-0000-0000-000000000007', 'Dublin', 'any');

create function pg_temp.make_published_listing(p_owner uuid, p_title text default 'Applications test listing')
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

-- Publishing itself is a separate step, run as the test-runner: authenticated has no grant on
-- status/published_at at all (by design), and the real moderator_approve_listing() pathway is
-- already exhaustively covered in Phase 1B''s own suite, so this fixture shortcut skips
-- re-testing that here. Callers must explicitly re-authenticate afterward, exactly like every
-- other authenticate_as_test_runner() call elsewhere in this file.
create function pg_temp.publish_listing(p_listing_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', ''::text, true);
  reset role;
  update public.listings set status = 'published', published_at = now() where id = p_listing_id;
end;
$$;

select pg_temp.authenticate_as('20000000-0000-0000-0000-000000000001');
select pg_temp.make_published_listing('20000000-0000-0000-0000-000000000001', 'Landlord A listing') as listing_a_id \gset
select pg_temp.publish_listing(:'listing_a_id');

select pg_temp.authenticate_as('20000000-0000-0000-0000-000000000002');
select pg_temp.make_published_listing('20000000-0000-0000-0000-000000000002', 'Landlord B listing') as listing_b_id \gset
select pg_temp.publish_listing(:'listing_b_id');

select pg_temp.authenticate_as('20000000-0000-0000-0000-000000000008');
select pg_temp.make_published_listing('20000000-0000-0000-0000-000000000008', 'Suspended landlord listing') as listing_suspended_owner_id \gset
select pg_temp.publish_listing(:'listing_suspended_owner_id');

-- Now that 008''s listing genuinely exists and is published, suspend the account.
-- publish_listing() already left the session in the test-runner (postgres) context.
set local role service_role;
update public.profiles set platform_status = 'suspended' where id = '20000000-0000-0000-0000-000000000008';
reset role;

-- 12. Active tenant can apply.
select pg_temp.authenticate_as('20000000-0000-0000-0000-000000000003');
select lives_ok(
  format($$ select public.create_application(%L) $$, :'listing_a_id'),
  '12. an active tenant with a tenant profile can apply to a published listing'
);

-- 13. Anonymous cannot apply — no execute grant at all, not merely an RLS/data rejection.
select pg_temp.authenticate_as_anon();
select throws_ok(
  format($$ select public.create_application(%L) $$, :'listing_b_id'),
  '42501', null,
  '13. anonymous cannot call create_application at all (no execute grant)'
);

-- 14. An account without a tenant_profiles row cannot apply.
select pg_temp.authenticate_as('20000000-0000-0000-0000-000000000001'); -- landlord A, no tenant profile
select throws_ok(
  format($$ select public.create_application(%L) $$, :'listing_b_id'),
  null::char(5), null,
  '14. an account without a tenant_profiles row cannot apply'
);

-- 15. A tenant cannot apply to their own listing (landlord B also has a tenant profile: give
-- them one now and try applying to their own published listing).
select pg_temp.authenticate_as_test_runner();
insert into public.tenant_profiles (profile_id, target_city, looking_for) values ('20000000-0000-0000-0000-000000000002', 'Dublin', 'any');
select pg_temp.authenticate_as('20000000-0000-0000-0000-000000000002');
select throws_ok(
  format($$ select public.create_application(%L) $$, :'listing_b_id'),
  '42501', null,
  '15. a landlord (who also has a tenant profile) cannot apply to their own listing'
);

-- 16. A tenant cannot apply to a non-published (still draft) listing.
select pg_temp.authenticate_as('20000000-0000-0000-0000-000000000001');
insert into public.listings (owner_id, listing_category) values ('20000000-0000-0000-0000-000000000001', 'entire_property');
-- The draft is only visible (via RLS) to its own owner or a moderator, so its id has to be
-- captured as the test-runner before switching to the applicant tenant — otherwise the tenant's
-- own query sees zero rows, create_application() is never even called, and throws_ok wrongly
-- reports "no exception" for a reason that has nothing to do with the check being tested.
select pg_temp.authenticate_as_test_runner();
select id as draft_listing_id from public.listings where owner_id = '20000000-0000-0000-0000-000000000001' and status = 'draft' limit 1 \gset
select pg_temp.authenticate_as('20000000-0000-0000-0000-000000000003');
select throws_ok(
  format($$ select public.create_application(%L) $$, :'draft_listing_id'),
  null::char(5), null,
  '16. a tenant cannot apply to a listing that is not published'
);

-- 17. A listing owned by a non-active (suspended) landlord cannot receive a new application.
select pg_temp.authenticate_as('20000000-0000-0000-0000-000000000003');
select throws_ok(
  format($$ select public.create_application(%L) $$, :'listing_suspended_owner_id'),
  null::char(5), null,
  '17. a listing owned by a suspended landlord cannot receive a new application'
);

-- 18. A tenant cannot forge the applicant identity, owner, status, snapshot, or Rental Fit —
-- create_application only ever takes a listing_id, so there is nothing else to pass; confirm
-- the created row''s tenant_id is genuinely the caller, not anything else.
select results_eq(
  format($$ select tenant_id::text from public.applications where listing_id = %L and tenant_id = '20000000-0000-0000-0000-000000000003' $$, :'listing_a_id'),
  $$ values ('20000000-0000-0000-0000-000000000003') $$,
  '18. the application''s tenant_id is exactly the calling auth.uid(), never client-suppliable'
);

-- 19. Second application, same tenant/listing, is blocked (already applied at test 12).
select throws_ok(
  format($$ select public.create_application(%L) $$, :'listing_a_id'),
  '23505', null,
  '19. a second application for the same tenant + listing is blocked'
);

-- 20. Withdrawal does not permit a duplicate re-application.
select pg_temp.authenticate_as_test_runner();
select id as app_a3_id from public.applications where listing_id = (:'listing_a_id')::uuid and tenant_id = '20000000-0000-0000-0000-000000000003' \gset
select pg_temp.authenticate_as('20000000-0000-0000-0000-000000000003');
select lives_ok(
  format($$ select public.withdraw_application(%L) $$, :'app_a3_id'),
  '20a. the tenant can withdraw their own application'
);
select throws_ok(
  format($$ select public.create_application(%L) $$, :'listing_a_id'),
  '23505', null,
  '20b. re-applying to the same listing after withdrawal is still blocked (permanent history)'
);

-- =========================================================================================
-- PART 3 — Frozen snapshot immutability.
-- =========================================================================================

select pg_temp.authenticate_as('20000000-0000-0000-0000-000000000001');
select pg_temp.make_published_listing('20000000-0000-0000-0000-000000000001', 'Snapshot test listing') as snapshot_listing_id \gset
select pg_temp.publish_listing(:'snapshot_listing_id');
select pg_temp.authenticate_as('20000000-0000-0000-0000-000000000004');
select public.create_application(:'snapshot_listing_id');

select results_eq(
  format($$ select (tenant_snapshot ->> 'target_city') from public.applications where listing_id = %L and tenant_id = '20000000-0000-0000-0000-000000000004' $$, :'snapshot_listing_id'),
  $$ values ('Dublin') $$,
  '21. the frozen snapshot captures target_city at creation time'
);

update public.tenant_profiles set target_city = 'Cork' where profile_id = '20000000-0000-0000-0000-000000000004';

select results_eq(
  format($$ select (tenant_snapshot ->> 'target_city') from public.applications where listing_id = %L and tenant_id = '20000000-0000-0000-0000-000000000004' $$, :'snapshot_listing_id'),
  $$ values ('Dublin') $$,
  '22. updating tenant_profiles afterward does not change the already-stored snapshot'
);

select throws_ok(
  format($$ update public.applications set tenant_snapshot = '{}'::jsonb where listing_id = %L $$, :'snapshot_listing_id'),
  '42501', null,
  '23. a client cannot directly mutate the tenant_snapshot column at all'
);

select throws_ok(
  format($$ update public.applications set rental_fit_score = 100 where listing_id = %L $$, :'snapshot_listing_id'),
  '42501', null,
  '24. a client cannot directly forge the stored rental_fit_score either'
);

-- =========================================================================================
-- PART 4 — RLS privacy.
-- =========================================================================================

select pg_temp.authenticate_as('20000000-0000-0000-0000-000000000003');
select is_empty(
  format($$ select 1 from public.applications where listing_id = %L and tenant_id = '20000000-0000-0000-0000-000000000004' $$, :'snapshot_listing_id'),
  '25. tenant A cannot read tenant B''s application'
);

select pg_temp.authenticate_as('20000000-0000-0000-0000-000000000001');
select isnt_empty(
  format($$ select 1 from public.applications where listing_id = %L $$, :'listing_a_id'),
  '26. landlord A can see applicants to landlord A''s own listing'
);

select pg_temp.authenticate_as('20000000-0000-0000-0000-000000000002');
select is_empty(
  format($$ select 1 from public.applications where listing_id = %L $$, :'listing_a_id'),
  '27. landlord B cannot see applicants to landlord A''s listing'
);

select pg_temp.authenticate_as_anon();
select throws_ok(
  format($$ select 1 from public.applications where listing_id = %L $$, :'listing_a_id'),
  null::char(5), null,
  '28. anon has no read access to applications at all'
);
select throws_ok(
  $$ select 1 from public.application_status_events limit 1 $$,
  null::char(5), null,
  '29. anon has no read access to application_status_events at all'
);

-- Moderators get no broad application-browsing right just from being a moderator.
select pg_temp.authenticate_as('20000000-0000-0000-0000-000000000005');
select is_empty(
  format($$ select 1 from public.applications where listing_id = %L $$, :'listing_a_id'),
  '30. a moderator (not the listing owner or the tenant) cannot browse this application either'
);

-- No leak of listing privacy fields through any application-adjacent surface: a landlord
-- reading their own applications still cannot pull exact_address from the joined listing via
-- anything except the same owner-only path already validated in Phase 1B/1C.
select pg_temp.authenticate_as('20000000-0000-0000-0000-000000000001');
select throws_ok(
  format($$ select l.exact_address from public.applications a join public.listings l on l.id = a.listing_id where a.listing_id = %L $$, :'listing_a_id'),
  '42501', null,
  '31. joining applications to listings still cannot read exact_address (no new bypass introduced)'
);

-- =========================================================================================
-- PART 5 — Status transitions + audit.
-- =========================================================================================

select pg_temp.authenticate_as('20000000-0000-0000-0000-000000000004');
select pg_temp.authenticate_as_test_runner();
select id as app_snap_id from public.applications where listing_id = (:'snapshot_listing_id')::uuid and tenant_id = '20000000-0000-0000-0000-000000000004' \gset

-- 32. Exactly one creation event exists for a fresh application.
select results_eq(
  format($$ select to_status::text from public.application_status_events where application_id = %L order by created_at $$, :'app_snap_id'),
  $$ values ('sent') $$,
  '32. exactly one "sent" creation event exists for a fresh application'
);

select pg_temp.authenticate_as('20000000-0000-0000-0000-000000000001');

-- 33. mark_application_viewed works and transitions sent -> viewed.
select lives_ok(
  format($$ select public.mark_application_viewed(%L) $$, :'app_snap_id'),
  '33. the listing owner can mark an application viewed'
);
select results_eq(
  format($$ select status::text from public.applications where id = %L $$, :'app_snap_id'),
  $$ values ('viewed') $$,
  '34. the application is now "viewed"'
);

-- 35. Repeated mark_application_viewed is idempotent: no duplicate event, no regression.
select lives_ok(
  format($$ select public.mark_application_viewed(%L) $$, :'app_snap_id'),
  '35. calling mark_application_viewed again does not error'
);
select results_eq(
  format($$ select count(*)::int from public.application_status_events where application_id = %L and to_status = 'viewed' $$, :'app_snap_id'),
  $$ values (1) $$,
  '36. repeated mark_application_viewed does not create a duplicate "viewed" event'
);

-- 37. landlord_interested works.
select lives_ok(
  format($$ select public.landlord_set_application_status(%L, 'landlord_interested') $$, :'app_snap_id'),
  '37. the listing owner can mark an application landlord_interested'
);

-- 38. shortlisted works directly from landlord_interested.
select lives_ok(
  format($$ select public.landlord_set_application_status(%L, 'shortlisted') $$, :'app_snap_id'),
  '38. the listing owner can shortlist the same application'
);

-- 39. Manual viewing_proposed is rejected outright by the generic decision function.
select throws_ok(
  format($$ select public.landlord_set_application_status(%L, 'viewing_proposed') $$, :'app_snap_id'),
  null::char(5), null,
  '39. landlord_set_application_status rejects viewing_proposed as a target status'
);
select throws_ok(
  format($$ select public.landlord_set_application_status(%L, 'viewing_confirmed') $$, :'app_snap_id'),
  null::char(5), null,
  '40. landlord_set_application_status rejects viewing_confirmed as a target status'
);

-- 41. not_selected works and is terminal.
select lives_ok(
  format($$ select public.landlord_set_application_status(%L, 'not_selected') $$, :'app_snap_id'),
  '41. the listing owner can mark the application not_selected'
);
select throws_ok(
  format($$ select public.landlord_set_application_status(%L, 'shortlisted') $$, :'app_snap_id'),
  null::char(5), null,
  '42. terminal resurrection is blocked: not_selected cannot move to shortlisted'
);
-- mark_application_viewed only ever transitions FROM 'sent', so calling it on an already
-- terminal (or any non-'sent') application is a correct, silent, idempotent no-op — not an
-- error. The real regression guard is that status/event count are unchanged afterward.
select lives_ok(
  format($$ select public.mark_application_viewed(%L) $$, :'app_snap_id'),
  '43a. mark_application_viewed on a terminal application does not error'
);
select results_eq(
  format($$ select status::text from public.applications where id = %L $$, :'app_snap_id'),
  $$ values ('not_selected') $$,
  '43b. mark_application_viewed on a terminal application does not resurrect or regress its status'
);

-- Separate application for the "close" path.
select pg_temp.authenticate_as('20000000-0000-0000-0000-000000000001');
select pg_temp.make_published_listing('20000000-0000-0000-0000-000000000001', 'Close-path test listing') as close_listing_id \gset
select pg_temp.publish_listing(:'close_listing_id');
select pg_temp.authenticate_as('20000000-0000-0000-0000-000000000004');
select public.create_application(:'close_listing_id');
select pg_temp.authenticate_as_test_runner();
select id as app_close_id from public.applications where listing_id = (:'close_listing_id')::uuid and tenant_id = '20000000-0000-0000-0000-000000000004' \gset

select pg_temp.authenticate_as('20000000-0000-0000-0000-000000000001');
select lives_ok(
  format($$ select public.landlord_set_application_status(%L, 'closed') $$, :'app_close_id'),
  '44. the listing owner can close an application directly from "sent"'
);
select throws_ok(
  format($$ select public.landlord_set_application_status(%L, 'landlord_interested') $$, :'app_close_id'),
  null::char(5), null,
  '45. terminal resurrection is blocked: closed cannot move to landlord_interested'
);

-- 46. applicant A status cannot be modified by landlord B.
select pg_temp.authenticate_as('20000000-0000-0000-0000-000000000002');
select throws_ok(
  format($$ select public.landlord_set_application_status(%L, 'shortlisted') $$, :'app_snap_id'),
  '42501', null,
  '46. landlord B cannot modify an application belonging to landlord A''s listing'
);

-- 47. Withdrawn is terminal for the tenant too.
select pg_temp.authenticate_as('20000000-0000-0000-0000-000000000003');
select throws_ok(
  format($$ select public.withdraw_application(%L) $$, :'app_a3_id'),
  null::char(5), null,
  '47. withdrawing an already-withdrawn application is blocked (idempotent-reject, not a duplicate event)'
);

-- =========================================================================================
-- PART 6 — Platform status enforcement for applications.
-- =========================================================================================

-- 48. A suspended tenant cannot create a new application.
select pg_temp.authenticate_as('20000000-0000-0000-0000-000000000006');
select throws_ok(
  format($$ select public.create_application(%L) $$, :'listing_b_id'),
  '42501', null,
  '48. a suspended tenant cannot create a new application'
);

-- 49. A suspended tenant CAN withdraw an existing active application.
select pg_temp.authenticate_as_test_runner();
insert into public.applications (listing_id, tenant_id, status, tenant_snapshot, rental_fit_score, rental_fit_breakdown, rental_fit_algorithm_version)
select :'listing_b_id'::uuid, '20000000-0000-0000-0000-000000000006', 'sent', '{}'::jsonb, 50, '{}'::jsonb, 'v1'
returning id as susp_app_id \gset
insert into public.application_status_events (application_id, from_status, to_status, actor_id)
values (:'susp_app_id', null, 'sent', '20000000-0000-0000-0000-000000000006');

select pg_temp.authenticate_as('20000000-0000-0000-0000-000000000006');
select lives_ok(
  format($$ select public.withdraw_application(%L) $$, :'susp_app_id'),
  '49. a suspended tenant CAN withdraw their own existing active application'
);

-- 50. A banned tenant cannot create an application.
select pg_temp.authenticate_as('20000000-0000-0000-0000-000000000007');
select throws_ok(
  format($$ select public.create_application(%L) $$, :'listing_b_id'),
  '42501', null,
  '50. a banned tenant cannot create a new application'
);

-- 51. A banned tenant cannot withdraw either.
select pg_temp.authenticate_as_test_runner();
insert into public.applications (listing_id, tenant_id, status, tenant_snapshot, rental_fit_score, rental_fit_breakdown, rental_fit_algorithm_version)
select :'listing_b_id'::uuid, '20000000-0000-0000-0000-000000000007', 'sent', '{}'::jsonb, 50, '{}'::jsonb, 'v1'
returning id as banned_app_id \gset
insert into public.application_status_events (application_id, from_status, to_status, actor_id)
values (:'banned_app_id', null, 'sent', '20000000-0000-0000-0000-000000000007');
select pg_temp.authenticate_as('20000000-0000-0000-0000-000000000007');
select throws_ok(
  format($$ select public.withdraw_application(%L) $$, :'banned_app_id'),
  '42501', null,
  '51. a banned tenant cannot withdraw an application (no marketplace writes at all)'
);
select isnt_empty(
  format($$ select 1 from public.applications where id = %L $$, :'banned_app_id'),
  '52. a banned tenant retains read access to their own historical application'
);

-- Fixtures against listing_suspended_owner_id itself (owned by 008) — create_application()
-- cannot be used here since 008 is already suspended (it would correctly reject the listing as
-- not accepting applications, per test 17), so these are inserted directly as the test-runner,
-- exactly as create_application() itself would have, to isolate the landlord-decision checks.
select pg_temp.authenticate_as_test_runner();
insert into public.applications (listing_id, tenant_id, status, tenant_snapshot, rental_fit_score, rental_fit_breakdown, rental_fit_algorithm_version)
select :'listing_suspended_owner_id'::uuid, '20000000-0000-0000-0000-000000000004', 'sent', '{}'::jsonb, 50, '{}'::jsonb, 'v1'
returning id as landlord008_app_id \gset
insert into public.application_status_events (application_id, from_status, to_status, actor_id)
values (:'landlord008_app_id', null, 'sent', '20000000-0000-0000-0000-000000000004');

insert into public.applications (listing_id, tenant_id, status, tenant_snapshot, rental_fit_score, rental_fit_breakdown, rental_fit_algorithm_version)
select :'listing_suspended_owner_id'::uuid, '20000000-0000-0000-0000-000000000003', 'sent', '{}'::jsonb, 50, '{}'::jsonb, 'v1'
returning id as landlord008_app2_id \gset
insert into public.application_status_events (application_id, from_status, to_status, actor_id)
values (:'landlord008_app2_id', null, 'sent', '20000000-0000-0000-0000-000000000003');

-- 53. A suspended landlord cannot mark landlord_interested/shortlisted.
select pg_temp.authenticate_as('20000000-0000-0000-0000-000000000008');
select throws_ok(
  format($$ select public.landlord_set_application_status(%L, 'landlord_interested') $$, :'landlord008_app_id'),
  '42501', null,
  '53. a suspended landlord cannot mark an application landlord_interested'
);

-- 54. A suspended landlord MAY still close/not_select (exposure-reducing).
select lives_ok(
  format($$ select public.landlord_set_application_status(%L, 'not_selected') $$, :'landlord008_app_id'),
  '54. a suspended landlord may still mark an application not_selected'
);

-- 55. A banned landlord cannot perform any decision write, not even the exposure-reducing ones
-- a suspended landlord is allowed (using the second, still-open fixture application here).
set local role service_role;
update public.profiles set platform_status = 'banned' where id = '20000000-0000-0000-0000-000000000008';
reset role;
select pg_temp.authenticate_as('20000000-0000-0000-0000-000000000008');
select throws_ok(
  format($$ select public.landlord_set_application_status(%L, 'closed') $$, :'landlord008_app2_id'),
  '42501', null,
  '55. a banned landlord cannot perform any application decision write, including exposure-reducing ones'
);

-- =========================================================================================
-- PART 7 — Audit correctness.
-- =========================================================================================

select pg_temp.authenticate_as_test_runner();
select results_eq(
  format($$ select actor_id::text from public.application_status_events where application_id = %L and to_status = 'viewed' $$, :'app_snap_id'),
  $$ values ('20000000-0000-0000-0000-000000000001') $$,
  '56. the actor_id recorded for the "viewed" event is genuinely the listing owner who called it'
);

-- Both of these must run as an ordinary authenticated client, not the test-runner (which is
-- postgres, unrestricted by grants entirely) — otherwise the assertion proves nothing about
-- what a real client can or cannot do.
select pg_temp.authenticate_as('20000000-0000-0000-0000-000000000003');
select throws_ok(
  $$ insert into public.application_status_events (application_id, to_status, actor_id) select id, 'withdrawn', tenant_id from public.applications limit 1 $$,
  '42501', null,
  '57. no client role can directly INSERT into application_status_events'
);
select throws_ok(
  format($$ delete from public.applications where id = %L $$, :'app_snap_id'),
  '42501', null,
  '58. no client role can directly DELETE an application'
);

select * from finish();

rollback;
