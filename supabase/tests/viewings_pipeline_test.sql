-- Phase 4 viewings pipeline tests — real pgTAP tests run against a real Postgres instance (see
-- the Phase 4 report for exactly which runs were against the real Supabase project vs. this
-- repeatable committed suite). Everything runs inside one transaction and rolls back. Real
-- concurrency (parallel HTTP races) cannot be exercised inside a single pgTAP transaction —
-- that is proven separately against the live project and reported alongside this suite.

begin;

create extension if not exists pgtap with schema extensions;

select plan(85);

-- =========================================================================================
-- Helpers.
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

create function pg_temp.make_published_listing(p_owner uuid, p_title text default 'Viewing test listing')
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

-- Builds a shortlisted application end-to-end using only the real Phase 2 functions, switching
-- auth context internally. Leaves the caller authenticated as test-runner afterward.
create function pg_temp.make_shortlisted_application(p_tenant uuid, p_landlord uuid, p_listing uuid)
returns uuid
language plpgsql as $$
declare
  v_app_id uuid;
begin
  perform pg_temp.authenticate_as(p_tenant);
  v_app_id := public.create_application(p_listing);
  perform pg_temp.authenticate_as(p_landlord);
  perform public.mark_application_viewed(v_app_id);
  perform public.landlord_set_application_status(v_app_id, 'shortlisted');
  perform pg_temp.authenticate_as_test_runner();
  return v_app_id;
end;
$$;

select pg_temp.authenticate_as_test_runner();

-- =========================================================================================
-- Fixtures.
-- =========================================================================================

insert into auth.users (id, email) values
  ('40000000-0000-0000-0000-000000000001', 'view-landlord-a@example.test'),
  ('40000000-0000-0000-0000-000000000002', 'view-landlord-b@example.test'),
  ('40000000-0000-0000-0000-000000000003', 'view-tenant-a@example.test'),
  ('40000000-0000-0000-0000-000000000004', 'view-tenant-b@example.test'),
  ('40000000-0000-0000-0000-000000000005', 'view-moderator@example.test'),
  ('40000000-0000-0000-0000-000000000006', 'view-tenant-suspended@example.test'),
  ('40000000-0000-0000-0000-000000000007', 'view-tenant-banned@example.test'),
  ('40000000-0000-0000-0000-000000000008', 'view-landlord-suspended@example.test');

set local role service_role;
update public.profiles set platform_role = 'moderator' where id = '40000000-0000-0000-0000-000000000005';
reset role;
-- 006/007/008 (eventually suspended/banned) deliberately stay active here — each one's
-- application/listing is built while still active, matching every earlier suite's established
-- fixture ordering, since is_caller_active() would block the setup steps otherwise.

insert into public.tenant_profiles (profile_id, target_city, looking_for) values
  ('40000000-0000-0000-0000-000000000003', 'Dublin', 'any'),
  ('40000000-0000-0000-0000-000000000004', 'Dublin', 'any'),
  ('40000000-0000-0000-0000-000000000006', 'Dublin', 'any'),
  ('40000000-0000-0000-0000-000000000007', 'Dublin', 'any');

select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000001');
select pg_temp.make_published_listing('40000000-0000-0000-0000-000000000001', 'Listing A1') as listing_a1_id \gset
select pg_temp.publish_listing(:'listing_a1_id');
select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000001');
select pg_temp.make_published_listing('40000000-0000-0000-0000-000000000001', 'Listing A2') as listing_a2_id \gset
select pg_temp.publish_listing(:'listing_a2_id');
select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000001');
select pg_temp.make_published_listing('40000000-0000-0000-0000-000000000001', 'Listing A3') as listing_a3_id \gset
select pg_temp.publish_listing(:'listing_a3_id');
select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000001');
select pg_temp.make_published_listing('40000000-0000-0000-0000-000000000001', 'Listing A4') as listing_a4_id \gset
select pg_temp.publish_listing(:'listing_a4_id');
select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000001');
select pg_temp.make_published_listing('40000000-0000-0000-0000-000000000001', 'Listing A5') as listing_a5_id \gset
select pg_temp.publish_listing(:'listing_a5_id');
select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000001');
select pg_temp.make_published_listing('40000000-0000-0000-0000-000000000001', 'Listing A6') as listing_a6_id \gset
select pg_temp.publish_listing(:'listing_a6_id');
select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000001');
select pg_temp.make_published_listing('40000000-0000-0000-0000-000000000001', 'Listing A7') as listing_a7_id \gset
select pg_temp.publish_listing(:'listing_a7_id');
select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000001');
select pg_temp.make_published_listing('40000000-0000-0000-0000-000000000001', 'Listing A8') as listing_a8_id \gset
select pg_temp.publish_listing(:'listing_a8_id');
select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000001');
select pg_temp.make_published_listing('40000000-0000-0000-0000-000000000001', 'Listing A9') as listing_a9_id \gset
select pg_temp.publish_listing(:'listing_a9_id');
select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000001');
select pg_temp.make_published_listing('40000000-0000-0000-0000-000000000001', 'Listing A10') as listing_a10_id \gset
select pg_temp.publish_listing(:'listing_a10_id');

select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000002');
select pg_temp.make_published_listing('40000000-0000-0000-0000-000000000002', 'Listing B1') as listing_b1_id \gset
select pg_temp.publish_listing(:'listing_b1_id');
select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000002');
select pg_temp.make_published_listing('40000000-0000-0000-0000-000000000002', 'Listing B2') as listing_b2_id \gset
select pg_temp.publish_listing(:'listing_b2_id');

select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000008');
select pg_temp.make_published_listing('40000000-0000-0000-0000-000000000008', 'Listing Suspended Owner') as listing_susp_id \gset
select pg_temp.publish_listing(:'listing_susp_id');

-- Applications at each of the required prior states for the "not shortlisted" rejection tests.
select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000003');
select public.create_application(:'listing_a2_id') as app_sent_id \gset
select public.create_application(:'listing_a3_id') as app_viewed_id \gset
select public.create_application(:'listing_a4_id') as app_interested_id \gset
select public.create_application(:'listing_a5_id') as app_terminal_id \gset

select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000001');
select public.mark_application_viewed(:'app_viewed_id');
select public.mark_application_viewed(:'app_interested_id');
select public.landlord_set_application_status(:'app_interested_id', 'landlord_interested');
select public.mark_application_viewed(:'app_terminal_id');
select public.landlord_set_application_status(:'app_terminal_id', 'closed');

-- The main shortlisted application used for the propose/accept happy path.
select pg_temp.make_shortlisted_application('40000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001', :'listing_a1_id') as app_main_id \gset

-- =========================================================================================
-- PART 1 — propose_viewing: authorization and application-status prerequisites.
-- =========================================================================================

select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000001');
select lives_ok(
  format(
    $$ select public.propose_viewing(%L, jsonb_build_array(
         jsonb_build_object('starts_at', (now() + interval '2 days')::text, 'ends_at', (now() + interval '2 days' + interval '30 minutes')::text),
         jsonb_build_object('starts_at', (now() + interval '3 days')::text, 'ends_at', (now() + interval '3 days' + interval '30 minutes')::text)
       )) $$,
    :'app_main_id'
  ),
  '1. an active landlord can propose viewing slots for their own shortlisted application'
);

select pg_temp.authenticate_as_test_runner();
select results_eq(
  format($$ select status::text from public.applications where id = %L $$, :'app_main_id'),
  $$ values ('viewing_proposed') $$,
  '2. the application transitions to viewing_proposed'
);
select id as proposal_main_id from public.viewing_proposals where application_id = (:'app_main_id')::uuid \gset
select results_eq(
  format($$ select tenant_id::text, landlord_id::text from public.viewing_proposals where id = %L $$, :'proposal_main_id'),
  $$ values ('40000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001') $$,
  '3. the proposal''s tenant_id/landlord_id are server-derived from the application/listing, never client-suppliable'
);
select results_eq(
  format($$ select count(*)::int from public.viewing_slots where proposal_id = %L $$, :'proposal_main_id'),
  $$ values (2) $$,
  '4. both proposed slots were created'
);
select results_eq(
  format($$ select to_status::text from public.application_status_events where application_id = %L order by created_at $$, :'app_main_id'),
  $$ values ('sent'), ('viewed'), ('shortlisted'), ('viewing_proposed') $$,
  '5. exactly the expected application_status_events chain exists, ending in one viewing_proposed event'
);

select pg_temp.authenticate_as_anon();
select throws_ok(
  format($$ select public.propose_viewing(%L, '[]'::jsonb) $$, :'listing_a2_id'),
  '42501', null,
  '6. anonymous cannot call propose_viewing at all (no execute grant)'
);

select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000003');
select throws_ok(
  format(
    $$ select public.propose_viewing(%L, jsonb_build_array(jsonb_build_object('starts_at', (now() + interval '2 days')::text, 'ends_at', (now() + interval '2 days 30 minutes')::text))) $$,
    :'app_sent_id'
  ),
  '42501', null,
  '7. the tenant on an application cannot propose a viewing on it themselves'
);

select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000002');
select throws_ok(
  format(
    $$ select public.propose_viewing(%L, jsonb_build_array(jsonb_build_object('starts_at', (now() + interval '2 days')::text, 'ends_at', (now() + interval '2 days 30 minutes')::text))) $$,
    :'app_sent_id'
  ),
  '42501', null,
  '8. landlord B cannot propose a viewing on landlord A''s application'
);

select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000001');
select throws_ok(
  format(
    $$ select public.propose_viewing(%L, jsonb_build_array(jsonb_build_object('starts_at', (now() + interval '2 days')::text, 'ends_at', (now() + interval '2 days 30 minutes')::text))) $$,
    :'app_sent_id'
  ),
  null::char(5), null,
  '9. a proposal against a "sent" application is rejected'
);
select throws_ok(
  format(
    $$ select public.propose_viewing(%L, jsonb_build_array(jsonb_build_object('starts_at', (now() + interval '2 days')::text, 'ends_at', (now() + interval '2 days 30 minutes')::text))) $$,
    :'app_viewed_id'
  ),
  null::char(5), null,
  '10. a proposal against a "viewed" application is rejected'
);
select throws_ok(
  format(
    $$ select public.propose_viewing(%L, jsonb_build_array(jsonb_build_object('starts_at', (now() + interval '2 days')::text, 'ends_at', (now() + interval '2 days 30 minutes')::text))) $$,
    :'app_interested_id'
  ),
  null::char(5), null,
  '11. a proposal against a "landlord_interested" application is rejected'
);
select throws_ok(
  format(
    $$ select public.propose_viewing(%L, jsonb_build_array(jsonb_build_object('starts_at', (now() + interval '2 days')::text, 'ends_at', (now() + interval '2 days 30 minutes')::text))) $$,
    :'app_terminal_id'
  ),
  null::char(5), null,
  '12. a proposal against a terminal (closed) application is rejected'
);
select throws_ok(
  format(
    $$ select public.propose_viewing(%L, jsonb_build_array(jsonb_build_object('starts_at', (now() + interval '2 days')::text, 'ends_at', (now() + interval '2 days 30 minutes')::text))) $$,
    :'app_main_id'
  ),
  null::char(5), null,
  '13. a second proposal against an application already at viewing_proposed is rejected'
);

-- =========================================================================================
-- PART 2 — propose_viewing: slot validation.
-- =========================================================================================

select pg_temp.make_shortlisted_application('40000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001', :'listing_a6_id') as app_validation_id \gset
select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000001');

select throws_ok(
  format(
    $$ select public.propose_viewing(%L, jsonb_build_array(jsonb_build_object('starts_at', (now() - interval '1 day')::text, 'ends_at', (now() - interval '1 day' + interval '30 minutes')::text))) $$,
    :'app_validation_id'
  ),
  null::char(5), null,
  '14. a proposal containing a past slot is rejected'
);
select throws_ok(
  format(
    $$ select public.propose_viewing(%L, jsonb_build_array(jsonb_build_object('starts_at', (now() + interval '2 days')::text, 'ends_at', (now() + interval '2 days' - interval '5 minutes')::text))) $$,
    :'app_validation_id'
  ),
  null::char(5), null,
  '15. a slot whose end is not after its start is rejected'
);
select throws_ok(
  format(
    $$ select public.propose_viewing(%L, jsonb_build_array(
         jsonb_build_object('starts_at', (now() + interval '2 days')::text, 'ends_at', (now() + interval '2 days 30 minutes')::text),
         jsonb_build_object('starts_at', (now() + interval '2 days')::text, 'ends_at', (now() + interval '2 days 45 minutes')::text)
       )) $$,
    :'app_validation_id'
  ),
  null::char(5), null,
  '16. duplicate identical slot start times within one proposal are rejected'
);
select throws_ok(
  format($$ select public.propose_viewing(%L, '[]'::jsonb) $$, :'app_validation_id'),
  null::char(5), null,
  '17. an empty slot list is rejected'
);
select throws_ok(
  format(
    $$ select public.propose_viewing(%L, jsonb_build_array(
         jsonb_build_object('starts_at', (now() + interval '2 days')::text, 'ends_at', (now() + interval '2 days 30 minutes')::text),
         jsonb_build_object('starts_at', (now() + interval '3 days')::text, 'ends_at', (now() + interval '3 days 30 minutes')::text),
         jsonb_build_object('starts_at', (now() + interval '4 days')::text, 'ends_at', (now() + interval '4 days 30 minutes')::text),
         jsonb_build_object('starts_at', (now() + interval '5 days')::text, 'ends_at', (now() + interval '5 days 30 minutes')::text)
       )) $$,
    :'app_validation_id'
  ),
  null::char(5), null,
  '18. a proposal with more than 3 slots (the frontend''s own MAX_VIEWING_PROPOSALS) is rejected'
);
select lives_ok(
  format(
    $$ select public.propose_viewing(%L, jsonb_build_array(jsonb_build_object('starts_at', (now() + interval '2 days')::text, 'ends_at', (now() + interval '2 days 30 minutes')::text))) $$,
    :'app_validation_id'
  ),
  '19. a single valid future slot is accepted after all the invalid attempts above were rejected'
);

-- =========================================================================================
-- PART 3 — accept_viewing_slot.
-- =========================================================================================

select pg_temp.authenticate_as_test_runner();
select id as slot_main_1 from public.viewing_slots where proposal_id = (:'proposal_main_id')::uuid order by starts_at limit 1 \gset
select id as slot_main_2 from public.viewing_slots where proposal_id = (:'proposal_main_id')::uuid order by starts_at desc limit 1 \gset

select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000003');
select lives_ok(
  format($$ select public.accept_viewing_slot(%L, %L) $$, :'proposal_main_id', :'slot_main_1'),
  '20. the tenant can accept one of the proposed slots'
);

select pg_temp.authenticate_as_test_runner();
select results_eq(
  format($$ select status::text, confirmed_slot_id::text from public.viewing_proposals where id = %L $$, :'proposal_main_id'),
  format($$ values ('confirmed', %L) $$, :'slot_main_1'),
  '21. the proposal is now confirmed with exactly the accepted slot'
);
select results_eq(
  format($$ select status::text from public.applications where id = %L $$, :'app_main_id'),
  $$ values ('viewing_confirmed') $$,
  '22. the application transitions to viewing_confirmed'
);
select results_eq(
  format($$ select count(*)::int from public.application_status_events where application_id = %L and to_status = 'viewing_confirmed' $$, :'app_main_id'),
  $$ values (1) $$,
  '23. exactly one viewing_confirmed event exists'
);
select results_eq(
  format($$ select count(*)::int from public.viewing_slots where proposal_id = %L $$, :'proposal_main_id'),
  $$ values (2) $$,
  '24. the non-accepted slot remains as a historical row, not deleted'
);

select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000004');
select throws_ok(
  format($$ select public.accept_viewing_slot(%L, %L) $$, :'proposal_main_id', :'slot_main_2'),
  '42501', null,
  '25. tenant B cannot accept a slot from tenant A''s proposal'
);

select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000003');
select throws_ok(
  format($$ select public.accept_viewing_slot(%L, %L) $$, :'proposal_main_id', :'slot_main_2'),
  '42501', null,
  '26. accepting a different slot on an already-confirmed proposal is rejected'
);
select lives_ok(
  format($$ select public.accept_viewing_slot(%L, %L) $$, :'proposal_main_id', :'slot_main_1'),
  '27. retrying acceptance of the SAME already-confirmed slot is idempotent, not an error'
);
select results_eq(
  format($$ select count(*)::int from public.application_status_events where application_id = %L and to_status = 'viewing_confirmed' $$, :'app_main_id'),
  $$ values (1) $$,
  '28. the idempotent retry did not create a duplicate viewing_confirmed event'
);

-- A slot belonging to a different proposal cannot be accepted for this one.
select pg_temp.make_shortlisted_application('40000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000001', :'listing_a1_id') as app_other_id \gset
select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000001');
select public.propose_viewing(:'app_other_id', jsonb_build_array(jsonb_build_object('starts_at', (now() + interval '6 days')::text, 'ends_at', (now() + interval '6 days 30 minutes')::text)));
select pg_temp.authenticate_as_test_runner();
select id as proposal_other_id from public.viewing_proposals where application_id = (:'app_other_id')::uuid \gset
select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000004');
select throws_ok(
  format($$ select public.accept_viewing_slot(%L, %L) $$, :'proposal_other_id', :'slot_main_1'),
  null::char(5), null,
  '29. a slot from a different proposal cannot be accepted here'
);

-- A backdated slot (set directly by the test-runner to simulate real time having passed) fails
-- acceptance safely rather than silently confirming an already-past viewing.
select pg_temp.authenticate_as_test_runner();
select id as slot_other_id from public.viewing_slots where proposal_id = (:'proposal_other_id')::uuid \gset
update public.viewing_slots set starts_at = now() - interval '1 hour', ends_at = now() - interval '30 minutes' where id = (:'slot_other_id')::uuid;
select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000004');
select throws_ok(
  format($$ select public.accept_viewing_slot(%L, %L) $$, :'proposal_other_id', :'slot_other_id'),
  null::char(5), null,
  '30. accepting a now-past slot fails safely'
);

-- =========================================================================================
-- PART 4 — decline_viewing.
-- =========================================================================================

select pg_temp.make_shortlisted_application('40000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001', :'listing_a7_id') as app_decline_id \gset
select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000001');
select public.propose_viewing(:'app_decline_id', jsonb_build_array(jsonb_build_object('starts_at', (now() + interval '2 days')::text, 'ends_at', (now() + interval '2 days 30 minutes')::text)));
select pg_temp.authenticate_as_test_runner();
select id as proposal_decline_id from public.viewing_proposals where application_id = (:'app_decline_id')::uuid \gset

select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000003');
select lives_ok(
  format($$ select public.decline_viewing(%L) $$, :'proposal_decline_id'),
  '31. the tenant can decline a pending proposal'
);
select pg_temp.authenticate_as_test_runner();
select results_eq(
  format($$ select status::text from public.viewing_proposals where id = %L $$, :'proposal_decline_id'),
  $$ values ('declined') $$,
  '32. the proposal is now declined'
);
select results_eq(
  format($$ select status::text from public.applications where id = %L $$, :'app_decline_id'),
  $$ values ('shortlisted') $$,
  '33. the application reverts to shortlisted after decline'
);
select results_eq(
  format($$ select count(*)::int from public.application_status_events where application_id = %L and from_status = 'viewing_proposed' and to_status = 'shortlisted' $$, :'app_decline_id'),
  $$ values (1) $$,
  '34. exactly one event records the viewing_proposed -> shortlisted reversion'
);

select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000003');
select lives_ok(
  format($$ select public.decline_viewing(%L) $$, :'proposal_decline_id'),
  '35. declining an already-declined proposal is idempotent, not an error'
);
select pg_temp.authenticate_as_test_runner();
select results_eq(
  format($$ select count(*)::int from public.application_status_events where application_id = %L and from_status = 'viewing_proposed' and to_status = 'shortlisted' $$, :'app_decline_id'),
  $$ values (1) $$,
  '36. the repeated decline did not create a duplicate reversion event'
);

select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000001');
select lives_ok(
  format(
    $$ select public.propose_viewing(%L, jsonb_build_array(jsonb_build_object('starts_at', (now() + interval '7 days')::text, 'ends_at', (now() + interval '7 days 30 minutes')::text))) $$,
    :'app_decline_id'
  ),
  '37. the landlord can create a brand new proposal for the same application after a decline'
);
select pg_temp.authenticate_as_test_runner();
select results_eq(
  format($$ select count(*)::int from public.viewing_proposals where application_id = %L $$, :'app_decline_id'),
  $$ values (2) $$,
  '38. the old declined proposal remains as a separate historical row alongside the new one'
);

-- =========================================================================================
-- PART 5 — cancel_viewing.
-- =========================================================================================

select pg_temp.make_shortlisted_application('40000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001', :'listing_a8_id') as app_cancel_pending_id \gset
select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000001');
select public.propose_viewing(:'app_cancel_pending_id', jsonb_build_array(jsonb_build_object('starts_at', (now() + interval '2 days')::text, 'ends_at', (now() + interval '2 days 30 minutes')::text)));
select lives_ok(
  format($$ select public.cancel_viewing((select id from public.viewing_proposals where application_id = %L)) $$, :'app_cancel_pending_id'),
  '39. the landlord can cancel their own pending proposal'
);
select pg_temp.authenticate_as_test_runner();
select results_eq(
  format($$ select status::text from public.applications where id = %L $$, :'app_cancel_pending_id'),
  $$ values ('shortlisted') $$,
  '40. the application reverts to shortlisted after cancelling a pending proposal'
);

select pg_temp.make_shortlisted_application('40000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000001', :'listing_a4_id') as app_cancel_confirmed_id \gset
select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000001');
select public.propose_viewing(:'app_cancel_confirmed_id', jsonb_build_array(jsonb_build_object('starts_at', (now() + interval '2 days')::text, 'ends_at', (now() + interval '2 days 30 minutes')::text)));
select pg_temp.authenticate_as_test_runner();
select id as proposal_cc_id from public.viewing_proposals where application_id = (:'app_cancel_confirmed_id')::uuid \gset
select id as slot_cc_id from public.viewing_slots where proposal_id = (:'proposal_cc_id')::uuid \gset
select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000004');
select public.accept_viewing_slot(:'proposal_cc_id', :'slot_cc_id');
select lives_ok(
  format($$ select public.cancel_viewing(%L) $$, :'proposal_cc_id'),
  '41. the tenant can cancel their own CONFIRMED viewing'
);
select pg_temp.authenticate_as_test_runner();
select results_eq(
  format($$ select status::text from public.applications where id = %L $$, :'app_cancel_confirmed_id'),
  $$ values ('shortlisted') $$,
  '42. the application reverts to shortlisted after cancelling a confirmed viewing'
);
select results_eq(
  format($$ select count(*)::int from public.application_status_events where application_id = %L and to_status = 'shortlisted' and from_status = 'viewing_confirmed' $$, :'app_cancel_confirmed_id'),
  $$ values (1) $$,
  '43. the reversion event correctly records viewing_confirmed as the prior status, not the proposal''s own status enum'
);

select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000001');
select lives_ok(
  format($$ select public.cancel_viewing(%L) $$, :'proposal_cc_id'),
  '44. cancelling an already-cancelled proposal is idempotent, not an error'
);
select throws_ok(
  format($$ select public.cancel_viewing(%L) $$, :'proposal_decline_id'),
  null::char(5), null,
  '45. cancelling a DECLINED proposal (a different terminal outcome) is rejected'
);

-- =========================================================================================
-- PART 6 — Terminal-application interaction (auto-cancel).
-- =========================================================================================

select pg_temp.make_shortlisted_application('40000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001', :'listing_a9_id') as app_term_close_id \gset
select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000001');
select public.propose_viewing(:'app_term_close_id', jsonb_build_array(jsonb_build_object('starts_at', (now() + interval '2 days')::text, 'ends_at', (now() + interval '2 days 30 minutes')::text)));
select pg_temp.authenticate_as_test_runner();
select id as proposal_term_close_id from public.viewing_proposals where application_id = (:'app_term_close_id')::uuid \gset

select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000001');
select lives_ok(
  format($$ select public.landlord_set_application_status(%L, 'closed') $$, :'app_term_close_id'),
  '46. the landlord can close a viewing_proposed application directly to a terminal state'
);
select pg_temp.authenticate_as_test_runner();
select results_eq(
  format($$ select status::text from public.viewing_proposals where id = %L $$, :'proposal_term_close_id'),
  $$ values ('cancelled') $$,
  '47. the open viewing was automatically cancelled when the application closed'
);
select results_eq(
  format($$ select count(*)::int from public.application_status_events where application_id = %L $$, :'app_term_close_id'),
  $$ values (5) $$,
  '48. exactly the expected event count exists — no extra fabricated event was created merely for the automatic viewing cancellation'
);

select pg_temp.make_shortlisted_application('40000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000001', :'listing_a6_id') as app_term_withdraw_id \gset
select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000001');
select public.propose_viewing(:'app_term_withdraw_id', jsonb_build_array(jsonb_build_object('starts_at', (now() + interval '2 days')::text, 'ends_at', (now() + interval '2 days 30 minutes')::text)));
select pg_temp.authenticate_as_test_runner();
select id as proposal_tw_id from public.viewing_proposals where application_id = (:'app_term_withdraw_id')::uuid \gset
select id as slot_tw_id from public.viewing_slots where proposal_id = (:'proposal_tw_id')::uuid \gset
select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000004');
select public.accept_viewing_slot(:'proposal_tw_id', :'slot_tw_id');
select lives_ok(
  format($$ select public.withdraw_application(%L) $$, :'app_term_withdraw_id'),
  '49. the tenant can withdraw an application that has a CONFIRMED viewing attached'
);
select pg_temp.authenticate_as_test_runner();
select results_eq(
  format($$ select status::text from public.applications where id = %L $$, :'app_term_withdraw_id'),
  $$ values ('withdrawn') $$,
  '50. the application is withdrawn'
);
select results_eq(
  format($$ select status::text from public.viewing_proposals where id = %L $$, :'proposal_tw_id'),
  $$ values ('cancelled') $$,
  '51. the confirmed viewing was automatically cancelled on withdrawal'
);

select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000004');
select lives_ok(
  format($$ select public.cancel_viewing(%L) $$, :'proposal_tw_id'),
  '52. calling cancel_viewing again on the auto-cancelled proposal is idempotent'
);
select pg_temp.authenticate_as_test_runner();
select results_eq(
  format($$ select status::text from public.applications where id = %L $$, :'app_term_withdraw_id'),
  $$ values ('withdrawn') $$,
  '53. the withdrawn application is NEVER resurrected back to shortlisted by cancel_viewing'
);

-- =========================================================================================
-- PART 7 — Generic application-status function hardening.
-- =========================================================================================

select throws_ok(
  format($$ select public.landlord_set_application_status(%L, 'viewing_proposed') $$, :'app_decline_id'),
  null::char(5), null,
  '54. landlord_set_application_status still cannot manually set viewing_proposed'
);
select throws_ok(
  format($$ select public.landlord_set_application_status(%L, 'viewing_confirmed') $$, :'app_decline_id'),
  null::char(5), null,
  '55. landlord_set_application_status still cannot manually set viewing_confirmed'
);

-- A fresh viewing-stage application (currently viewing_proposed, from the "second proposal"
-- rejection fixture at test 13) to prove the non-terminal-reversal guard.
select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000001');
select throws_ok(
  format($$ select public.landlord_set_application_status(%L, 'shortlisted') $$, :'app_main_id'),
  '42501', null,
  '56. landlord_set_application_status cannot move a viewing-stage application back to shortlisted directly — cancel_viewing() is required'
);
select throws_ok(
  format($$ select public.landlord_set_application_status(%L, 'landlord_interested') $$, :'app_main_id'),
  '42501', null,
  '57. landlord_set_application_status cannot move a viewing-stage application to landlord_interested either'
);
select lives_ok(
  format($$ select public.landlord_set_application_status(%L, 'not_selected') $$, :'app_main_id'),
  '58. landlord_set_application_status CAN still close out a viewing-stage application to a terminal state'
);
select pg_temp.authenticate_as_test_runner();
select results_eq(
  format($$ select status::text from public.viewing_proposals where id = %L $$, :'proposal_main_id'),
  $$ values ('cancelled') $$,
  '59. the confirmed viewing tied to app_main was automatically cancelled when the application was closed out via the generic function'
);

-- =========================================================================================
-- PART 8 — Platform status enforcement.
-- =========================================================================================

select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000006'); -- eventually-suspended tenant
select public.create_application(:'listing_b1_id') as app_susp_tenant_id \gset
select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000002');
select public.mark_application_viewed(:'app_susp_tenant_id');
select public.landlord_set_application_status(:'app_susp_tenant_id', 'shortlisted');
select public.propose_viewing(:'app_susp_tenant_id', jsonb_build_array(jsonb_build_object('starts_at', (now() + interval '2 days')::text, 'ends_at', (now() + interval '2 days 30 minutes')::text)));
select pg_temp.authenticate_as_test_runner();
select id as proposal_susp_tenant_id from public.viewing_proposals where application_id = (:'app_susp_tenant_id')::uuid \gset
select id as slot_susp_tenant_id from public.viewing_slots where proposal_id = (:'proposal_susp_tenant_id')::uuid \gset

set local role service_role;
update public.profiles set platform_status = 'suspended' where id = '40000000-0000-0000-0000-000000000006';
reset role;

select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000006');
select throws_ok(
  format($$ select public.accept_viewing_slot(%L, %L) $$, :'proposal_susp_tenant_id', :'slot_susp_tenant_id'),
  '42501', null,
  '60. a suspended tenant cannot accept a viewing slot'
);
select lives_ok(
  format($$ select public.decline_viewing(%L) $$, :'proposal_susp_tenant_id'),
  '61. a suspended tenant CAN still decline a pending proposal'
);

-- A separate suspended-tenant fixture for the cancel check (decline above already consumed the
-- first one).
select pg_temp.authenticate_as_test_runner();
insert into public.applications (listing_id, tenant_id, status, tenant_snapshot, rental_fit_score, rental_fit_breakdown, rental_fit_algorithm_version)
values ((:'listing_b2_id')::uuid, '40000000-0000-0000-0000-000000000006', 'shortlisted', '{}'::jsonb, 50, '{}'::jsonb, 'v1')
returning id as app_susp_tenant2_id \gset
insert into public.application_status_events (application_id, from_status, to_status, actor_id)
values ((:'app_susp_tenant2_id')::uuid, null, 'shortlisted', '40000000-0000-0000-0000-000000000002');
insert into public.viewing_proposals (application_id, landlord_id, tenant_id)
values ((:'app_susp_tenant2_id')::uuid, '40000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000006')
returning id as proposal_susp_tenant2_id \gset
update public.applications set status = 'viewing_proposed' where id = (:'app_susp_tenant2_id')::uuid;

select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000006');
select lives_ok(
  format($$ select public.cancel_viewing(%L) $$, :'proposal_susp_tenant2_id'),
  '62. a suspended tenant CAN still cancel a pending proposal'
);

-- Suspended landlord: propose blocked, cancel allowed.
select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000003');
select public.create_application(:'listing_susp_id') as app_susp_landlord_id \gset
select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000008');
select public.mark_application_viewed(:'app_susp_landlord_id');
select public.landlord_set_application_status(:'app_susp_landlord_id', 'shortlisted');
select public.propose_viewing(:'app_susp_landlord_id', jsonb_build_array(jsonb_build_object('starts_at', (now() + interval '2 days')::text, 'ends_at', (now() + interval '2 days 30 minutes')::text)));
select pg_temp.authenticate_as_test_runner();
select id as proposal_susp_landlord_id from public.viewing_proposals where application_id = (:'app_susp_landlord_id')::uuid \gset

set local role service_role;
update public.profiles set platform_status = 'suspended' where id = '40000000-0000-0000-0000-000000000008';
reset role;

select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000008');
select lives_ok(
  format($$ select public.cancel_viewing(%L) $$, :'proposal_susp_landlord_id'),
  '63. a suspended landlord CAN still cancel their own pending proposal'
);

-- A fresh shortlisted application owned by the now-suspended landlord, to prove propose is
-- blocked going forward.
select pg_temp.authenticate_as_test_runner();
insert into public.applications (listing_id, tenant_id, status, tenant_snapshot, rental_fit_score, rental_fit_breakdown, rental_fit_algorithm_version)
values ((:'listing_susp_id')::uuid, '40000000-0000-0000-0000-000000000004', 'shortlisted', '{}'::jsonb, 50, '{}'::jsonb, 'v1')
returning id as app_susp_landlord2_id \gset
insert into public.application_status_events (application_id, from_status, to_status, actor_id)
values ((:'app_susp_landlord2_id')::uuid, null, 'shortlisted', '40000000-0000-0000-0000-000000000008');

select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000008');
select throws_ok(
  format(
    $$ select public.propose_viewing(%L, jsonb_build_array(jsonb_build_object('starts_at', (now() + interval '2 days')::text, 'ends_at', (now() + interval '2 days 30 minutes')::text))) $$,
    :'app_susp_landlord2_id'
  ),
  '42501', null,
  '64. a suspended landlord cannot propose a new viewing'
);

-- An active landlord cannot propose to a now-suspended tenant''s shortlisted application
-- either (both-participants-active is required for proposing).
select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000002');
select throws_ok(
  format(
    $$ select public.propose_viewing(%L, jsonb_build_array(jsonb_build_object('starts_at', (now() + interval '2 days')::text, 'ends_at', (now() + interval '2 days 30 minutes')::text))) $$,
    :'app_susp_tenant2_id'
  ),
  null::char(5), null,
  '65. an active landlord cannot propose a NEW viewing to a now-suspended tenant''s application (already viewing_proposed, so this also proves the shortlisted-only gate holds)'
);

-- Banned participant cannot write.
select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000007');
select public.create_application(:'listing_a2_id') as app_banned_tenant_id \gset
select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000001');
select public.mark_application_viewed(:'app_banned_tenant_id');
select public.landlord_set_application_status(:'app_banned_tenant_id', 'shortlisted');
select public.propose_viewing(:'app_banned_tenant_id', jsonb_build_array(jsonb_build_object('starts_at', (now() + interval '2 days')::text, 'ends_at', (now() + interval '2 days 30 minutes')::text)));
select pg_temp.authenticate_as_test_runner();
select id as proposal_banned_tenant_id from public.viewing_proposals where application_id = (:'app_banned_tenant_id')::uuid \gset
select id as slot_banned_tenant_id from public.viewing_slots where proposal_id = (:'proposal_banned_tenant_id')::uuid \gset

set local role service_role;
update public.profiles set platform_status = 'banned' where id = '40000000-0000-0000-0000-000000000007';
reset role;

select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000007');
select throws_ok(
  format($$ select public.accept_viewing_slot(%L, %L) $$, :'proposal_banned_tenant_id', :'slot_banned_tenant_id'),
  '42501', null,
  '66. a banned tenant cannot accept a viewing'
);
select throws_ok(
  format($$ select public.decline_viewing(%L) $$, :'proposal_banned_tenant_id'),
  '42501', null,
  '67. a banned tenant cannot even decline — no marketplace writes at all, unlike suspended'
);
select throws_ok(
  format($$ select public.cancel_viewing(%L) $$, :'proposal_banned_tenant_id'),
  '42501', null,
  '68. a banned tenant cannot cancel either'
);
select isnt_empty(
  format($$ select 1 from public.viewing_proposals where id = %L $$, :'proposal_banned_tenant_id'),
  '69. a banned tenant retains read access to their own viewing history'
);

-- =========================================================================================
-- PART 9 — Blocking.
-- =========================================================================================

select pg_temp.make_shortlisted_application('40000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001', :'listing_a10_id') as app_block_id \gset
select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000003');
select public.block_user('40000000-0000-0000-0000-000000000001');

select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000001');
select throws_ok(
  format(
    $$ select public.propose_viewing(%L, jsonb_build_array(jsonb_build_object('starts_at', (now() + interval '2 days')::text, 'ends_at', (now() + interval '2 days 30 minutes')::text))) $$,
    :'app_block_id'
  ),
  '42501', null,
  '70. a landlord cannot propose a new viewing when either party has blocked the other'
);

-- Build a viewing the normal way, then have the tenant block the landlord afterward, to test
-- that acceptance is blocked while decline/cancel remain available.
select pg_temp.make_shortlisted_application('40000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000001', :'listing_a3_id') as app_block2_id \gset
select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000001');
select public.propose_viewing(:'app_block2_id', jsonb_build_array(jsonb_build_object('starts_at', (now() + interval '2 days')::text, 'ends_at', (now() + interval '2 days 30 minutes')::text)));
select pg_temp.authenticate_as_test_runner();
select id as proposal_block2_id from public.viewing_proposals where application_id = (:'app_block2_id')::uuid \gset
select id as slot_block2_id from public.viewing_slots where proposal_id = (:'proposal_block2_id')::uuid \gset

select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000004');
select public.block_user('40000000-0000-0000-0000-000000000001');
select throws_ok(
  format($$ select public.accept_viewing_slot(%L, %L) $$, :'proposal_block2_id', :'slot_block2_id'),
  '42501', null,
  '71. accepting a viewing is blocked once either party has blocked the other'
);
select lives_ok(
  format($$ select public.decline_viewing(%L) $$, :'proposal_block2_id'),
  '72. declining a viewing still works even while blocked (a safety action, not a new interaction)'
);

select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000003');
select public.unblock_user('40000000-0000-0000-0000-000000000001');

-- =========================================================================================
-- PART 10 — Privacy / RLS.
-- =========================================================================================

select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000004');
select is_empty(
  format($$ select 1 from public.viewing_proposals where id = %L $$, :'proposal_main_id'),
  '73. an unrelated tenant cannot read another tenant''s viewing proposal'
);

select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000002');
select is_empty(
  format($$ select 1 from public.viewing_proposals where id = %L $$, :'proposal_main_id'),
  '74. an unrelated landlord cannot read another landlord''s viewing proposal'
);
select is_empty(
  format($$ select 1 from public.viewing_slots where proposal_id = %L $$, :'proposal_main_id'),
  '75. an unrelated landlord cannot read another landlord''s viewing slots either'
);

select pg_temp.authenticate_as_anon();
select throws_ok(
  format($$ select 1 from public.viewing_proposals where id = %L $$, :'proposal_main_id'),
  null::char(5), null,
  '76. anonymous has no read access to viewing_proposals at all'
);
select throws_ok(
  $$ select 1 from public.viewing_slots limit 1 $$,
  null::char(5), null,
  '77. anonymous has no read access to viewing_slots at all'
);

select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000005');
select is_empty(
  format($$ select 1 from public.viewing_proposals where id = %L $$, :'proposal_main_id'),
  '78. a moderator (not a participant) is not automatically granted access to this viewing'
);

select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000001');
select throws_ok(
  format($$ select l.exact_address from public.viewing_proposals vp join public.applications a on a.id = vp.application_id join public.listings l on l.id = a.listing_id where vp.id = %L $$, :'proposal_main_id'),
  '42501', null,
  '79. joining viewing_proposals through to listings still cannot read exact_address'
);

-- =========================================================================================
-- PART 11 — Immutability.
-- =========================================================================================

select throws_ok(
  $$ insert into public.viewing_proposals (application_id, landlord_id, tenant_id) values ('00000000-0000-0000-0000-000000000000', '40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003') $$,
  '42501', null,
  '80. a client cannot directly INSERT into viewing_proposals, bypassing propose_viewing()'
);
select throws_ok(
  format($$ update public.viewing_proposals set status = 'confirmed' where id = %L $$, :'proposal_main_id'),
  '42501', null,
  '81. a client cannot directly forge a viewing_proposals status/confirmed_slot_id'
);
select throws_ok(
  format($$ delete from public.viewing_proposals where id = %L $$, :'proposal_main_id'),
  '42501', null,
  '82. a client cannot directly DELETE a viewing_proposals row'
);
select throws_ok(
  format($$ update public.viewing_slots set starts_at = now() + interval '100 days' where proposal_id = %L $$, :'proposal_main_id'),
  '42501', null,
  '83. a client cannot directly forge a viewing_slots timestamp'
);

-- =========================================================================================
-- PART 12 — Messaging boundary: proposing/accepting a viewing must not touch messages at all.
-- =========================================================================================

select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000003');
select public.start_conversation(:'listing_a2_id', 'Hi, is this listing still open for viewing?');
select pg_temp.authenticate_as_test_runner();
select id as conv_boundary_id from public.conversations where listing_id = (:'listing_a2_id')::uuid and tenant_id = '40000000-0000-0000-0000-000000000003' \gset
select results_eq(
  format($$ select count(*)::int from public.messages where conversation_id = %L $$, :'conv_boundary_id'),
  $$ values (1) $$,
  '84. proposing/accepting a viewing does not create any message — exactly the tenant''s original enquiry message exists'
);
select pg_temp.authenticate_as('40000000-0000-0000-0000-000000000003');
select throws_ok(
  format($$ select public.send_message(%L, 'following up since a viewing was proposed') $$, :'conv_boundary_id'),
  '42501', null,
  '85. a viewing proposal existing for this listing/tenant does not unlock the tenant''s second unsolicited message — only a real landlord-authored message would'
);

select * from finish();

rollback;
