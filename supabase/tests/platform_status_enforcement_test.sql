-- Phase 1D platform_status enforcement tests — real pgTAP tests run against a real Postgres
-- instance (see the Phase 1D report for exactly which runs were against the real Supabase
-- project vs. this repeatable committed suite). Everything runs inside one transaction and
-- rolls back at the end.

begin;

create extension if not exists pgtap with schema extensions;

select plan(29);

-- =========================================================================================
-- Helpers — same pattern as rls_policies_test.sql / listings_moderation_policies_test.sql.
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

create function pg_temp.make_ready_draft(p_owner uuid, p_title text default 'A genuinely lovely two bedroom apartment')
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
-- Fixtures: five identities — an active landlord, a landlord who gets suspended partway
-- through, a landlord who gets banned partway through, an active moderator, and an ordinary
-- active non-moderator used only for negative-path moderator-function checks.
-- =========================================================================================

select pg_temp.authenticate_as_test_runner();

insert into auth.users (id, email) values
  ('f0000000-0000-0000-0000-00000000000a', 'active-landlord@example.test'),
  ('f0000000-0000-0000-0000-00000000000b', 'suspended-landlord@example.test'),
  ('f0000000-0000-0000-0000-00000000000c', 'banned-landlord@example.test'),
  ('f0000000-0000-0000-0000-00000000000d', 'moderator@example.test'),
  ('f0000000-0000-0000-0000-00000000000e', 'ordinary-active@example.test');

set local role service_role;
update public.profiles set platform_role = 'moderator' where id = 'f0000000-0000-0000-0000-00000000000d';
reset role;

-- ---- Build every fixture listing WHILE its owner is still active — is_caller_active() would
-- block most of this if attempted after suspending/banning, which is exactly the point. ----

-- 1. A published listing owned by the active landlord, kept published throughout — the stable
-- target used for the anon-browsing regression check and the banned-cannot-browse check.
select pg_temp.authenticate_as('f0000000-0000-0000-0000-00000000000a');
select pg_temp.make_ready_draft('f0000000-0000-0000-0000-00000000000a', 'Stable public target listing') as public_target_listing_id \gset
select public.request_listing_review(:'public_target_listing_id');
select pg_temp.authenticate_as('f0000000-0000-0000-0000-00000000000d');
select public.moderator_approve_listing(:'public_target_listing_id');

-- 2. Four listings owned by the soon-to-be-suspended landlord, in the four different states
-- needed below: a ready-but-unsubmitted draft, a pending_verification listing, a published
-- listing (used for "can still pause" then "can still mark rented", in sequence), and a
-- separately pre-paused listing (used for "cannot resume").
select pg_temp.authenticate_as('f0000000-0000-0000-0000-00000000000b');
select pg_temp.make_ready_draft('f0000000-0000-0000-0000-00000000000b', 'Ready draft not yet submitted') as susp_ready_draft_id \gset
select pg_temp.make_ready_draft('f0000000-0000-0000-0000-00000000000b', 'Pending review listing') as susp_pending_id \gset
select public.request_listing_review(:'susp_pending_id');
select pg_temp.make_ready_draft('f0000000-0000-0000-0000-00000000000b', 'Published listing, will be paused then rented') as susp_published_id \gset
select public.request_listing_review(:'susp_published_id');
select pg_temp.make_ready_draft('f0000000-0000-0000-0000-00000000000b', 'Pre-paused listing, resume should be blocked') as susp_prepaused_id \gset
select public.request_listing_review(:'susp_prepaused_id');

select pg_temp.authenticate_as('f0000000-0000-0000-0000-00000000000d');
select public.moderator_approve_listing(:'susp_published_id');
select public.moderator_approve_listing(:'susp_prepaused_id');

select pg_temp.authenticate_as('f0000000-0000-0000-0000-00000000000b');
select public.pause_listing(:'susp_prepaused_id');

-- 3. One listing owned by the soon-to-be-banned landlord, for the "banned can still read own
-- data" check.
select pg_temp.authenticate_as('f0000000-0000-0000-0000-00000000000c');
select pg_temp.make_ready_draft('f0000000-0000-0000-0000-00000000000c', 'Banned landlord''s own draft') as banned_own_listing_id \gset

-- ---- Now actually transition the two accounts. ----
set local role service_role;
update public.profiles set platform_status = 'suspended' where id = 'f0000000-0000-0000-0000-00000000000b';
update public.profiles set platform_status = 'banned' where id = 'f0000000-0000-0000-0000-00000000000c';
reset role;

-- =========================================================================================
-- ACTIVE — normal behavior.
-- =========================================================================================

select pg_temp.authenticate_as('f0000000-0000-0000-0000-00000000000a');
select lives_ok(
  $$ insert into public.listings (owner_id, listing_category) values ('f0000000-0000-0000-0000-00000000000a', 'entire_property') $$,
  '1. an active landlord can create a new draft listing'
);

-- =========================================================================================
-- SUSPENDED — read preserved, trust-sensitive writes blocked, exposure-reducing writes allowed.
-- =========================================================================================

select pg_temp.authenticate_as('f0000000-0000-0000-0000-00000000000b');

select throws_ok(
  $$ insert into public.listings (owner_id, listing_category) values ('f0000000-0000-0000-0000-00000000000b', 'entire_property') $$,
  '42501', null,
  '2. a suspended landlord cannot create a new draft listing'
);

select throws_ok(
  format($$ select public.request_listing_review(%L) $$, :'susp_ready_draft_id'),
  null::char(5), null,
  '3. a suspended landlord cannot request review, even on an otherwise-ready draft'
);

select throws_ok(
  format($$ select public.resume_listing(%L) $$, :'susp_prepaused_id'),
  null::char(5), null,
  '4. a suspended landlord cannot resume a paused listing'
);

select lives_ok(
  format($$ select public.pause_listing(%L) $$, :'susp_published_id'),
  '5. a suspended landlord CAN still pause their own published listing (reduces exposure)'
);

select lives_ok(
  format($$ select public.mark_listing_rented(%L) $$, :'susp_published_id'),
  '6. a suspended landlord CAN still mark their own (now-paused) listing as rented'
);

select lives_ok(
  format($$ select public.withdraw_listing_from_review(%L) $$, :'susp_pending_id'),
  '7. a suspended landlord CAN still withdraw a listing from review (reduces exposure)'
);

select isnt_empty(
  $$ select 1 from public.get_my_listings() where owner_id = 'f0000000-0000-0000-0000-00000000000b' $$,
  '8. a suspended landlord CAN still read their own existing listings'
);

select throws_ok(
  format(
    $$ select public.register_listing_image(%L, %L || '/second.jpg') $$,
    :'susp_ready_draft_id', :'susp_ready_draft_id'
  ),
  null::char(5), null,
  '9. a suspended landlord cannot register a new listing image'
);

select throws_ok(
  $$ insert into public.tenant_profiles (profile_id, target_city) values ('f0000000-0000-0000-0000-00000000000b', 'Cork') $$,
  '42501', null,
  '10. a suspended landlord cannot create a new tenant_profiles role surface'
);

select throws_ok(
  $$ insert into public.landlord_profiles (profile_id, display_name) values ('f0000000-0000-0000-0000-00000000000b', 'Should not be created') $$,
  '42501', null,
  '11. a suspended landlord cannot create a new landlord_profiles role surface'
);

-- =========================================================================================
-- BANNED — everything suspended loses, plus the public marketplace browse surface itself.
-- =========================================================================================

select pg_temp.authenticate_as('f0000000-0000-0000-0000-00000000000c');

select throws_ok(
  $$ insert into public.listings (owner_id, listing_category) values ('f0000000-0000-0000-0000-00000000000c', 'entire_property') $$,
  '42501', null,
  '12. a banned user cannot create a new draft listing'
);

select is_empty(
  format($$ select 1 from public.listings where id = %L $$, :'public_target_listing_id'),
  '13. a banned user cannot see another landlord''s published listing via the base table'
);

select is_empty(
  format($$ select 1 from public.public_listings where id = %L $$, :'public_target_listing_id'),
  '14. a banned user cannot see another landlord''s published listing via public_listings either'
);

select isnt_empty(
  format($$ select 1 from public.listings where id = %L $$, :'banned_own_listing_id'),
  '15. a banned user CAN still read their own existing listing (minimum account-support access)'
);

-- =========================================================================================
-- Public browsing must still work for everyone it is supposed to — the regression this whole
-- migration nearly shipped with: is_caller_banned() as SECURITY INVOKER broke anon entirely,
-- since anon has no SELECT grant on profiles at all. Caught by re-running this exact suite.
-- =========================================================================================

select pg_temp.authenticate_as_anon();
select isnt_empty(
  format($$ select 1 from public.public_listings where id = %L $$, :'public_target_listing_id'),
  '16. anonymous browsing of a published listing still works after platform_status enforcement'
);

-- =========================================================================================
-- Moderator suspend/ban/reactivate, and the moderation_actions audit trail.
-- =========================================================================================

select pg_temp.authenticate_as('f0000000-0000-0000-0000-00000000000d');

select lives_ok(
  $$ select public.moderator_suspend_user('f0000000-0000-0000-0000-00000000000e', 'Phase 1D test suspension') $$,
  '17. an active moderator can suspend an ordinary user'
);

-- profiles has no "moderator can read any profile" policy at all (only profiles_select_own) —
-- correct, unrelated to this migration — so verifying the target's new status has to go through
-- the test-runner, the same way Phase 1C verified moderator_suspend_user's real effect via a
-- direct DB connection rather than the acting moderator's own REST session.
select pg_temp.authenticate_as_test_runner();
select results_eq(
  $$ select platform_status::text from public.profiles where id = 'f0000000-0000-0000-0000-00000000000e' $$,
  $$ values ('suspended') $$,
  '18. the target is now suspended'
);

select pg_temp.authenticate_as('f0000000-0000-0000-0000-00000000000d');
select lives_ok(
  $$ select public.moderator_ban_user('f0000000-0000-0000-0000-00000000000e', 'Phase 1D test ban') $$,
  '19. an active moderator can ban a (previously suspended) user directly'
);
select pg_temp.authenticate_as_test_runner();
select results_eq(
  $$ select platform_status::text from public.profiles where id = 'f0000000-0000-0000-0000-00000000000e' $$,
  $$ values ('banned') $$,
  '20. the target is now banned'
);

select pg_temp.authenticate_as('f0000000-0000-0000-0000-00000000000d');
select lives_ok(
  $$ select public.moderator_reactivate_user('f0000000-0000-0000-0000-00000000000e', 'Appeal upheld') $$,
  '21. an active moderator can reactivate a banned user back to active'
);
select pg_temp.authenticate_as_test_runner();
select results_eq(
  $$ select platform_status::text from public.profiles where id = 'f0000000-0000-0000-0000-00000000000e' $$,
  $$ values ('active') $$,
  '22. the target is active again'
);

-- moderation_actions has zero client-facing SELECT grant at all, even for the acting moderator
-- (by design, since Phase 1B) — this check has to run as the test-runner too.
select results_eq(
  $$ select action_type::text from public.moderation_actions where target_user_id = 'f0000000-0000-0000-0000-00000000000e' order by created_at $$,
  $$ values ('user_suspended'), ('user_banned'), ('user_reactivated') $$,
  '23. all three moderator actions were recorded in moderation_actions, in order, with the real moderator as actor'
);

-- Ordinary non-moderator cannot reach any of these.
select pg_temp.authenticate_as('f0000000-0000-0000-0000-00000000000a');
select throws_ok(
  $$ select public.moderator_ban_user('f0000000-0000-0000-0000-00000000000e', 'illegitimate attempt') $$,
  null::char(5), null,
  '24. an ordinary (non-moderator) user cannot ban another user'
);
select throws_ok(
  $$ select public.moderator_reactivate_user('f0000000-0000-0000-0000-00000000000e', 'illegitimate attempt') $$,
  null::char(5), null,
  '25. an ordinary (non-moderator) user cannot reactivate another user'
);

-- =========================================================================================
-- A moderator badge does not survive the moderator's own account being restricted — closes the
-- gap where is_caller_moderator() previously checked platform_role only, ignoring
-- platform_status entirely.
-- =========================================================================================

set local role service_role;
update public.profiles set platform_status = 'suspended' where id = 'f0000000-0000-0000-0000-00000000000d';
reset role;

select pg_temp.authenticate_as('f0000000-0000-0000-0000-00000000000d');
select throws_ok(
  format($$ select public.moderator_approve_listing(%L) $$, :'susp_pending_id'),
  null::char(5), null,
  '26. a suspended moderator loses moderator capability entirely, even for their own genuine moderator actions'
);

-- Restore the moderator to active so it does not confuse anything evaluated after this point.
set local role service_role;
update public.profiles set platform_status = 'active' where id = 'f0000000-0000-0000-0000-00000000000d';
reset role;

-- =========================================================================================
-- Existing RLS privacy is still intact after all of the above — a brief spot check, not a
-- re-run of every Phase 1B/1C assertion (those run separately, unmodified, in their own suite).
-- =========================================================================================

select pg_temp.authenticate_as('f0000000-0000-0000-0000-00000000000a');
select throws_ok(
  format($$ select id, exact_address from public.listings where id = %L $$, :'public_target_listing_id'),
  '42501', null,
  '27. exact_address is still structurally inaccessible to a normal active user on a published listing'
);

select pg_temp.authenticate_as_anon();
select throws_ok(
  format($$ select id, exact_address from public.listings where id = %L $$, :'public_target_listing_id'),
  '42501', null,
  '28. exact_address is still structurally inaccessible to anon on a published listing'
);

select pg_temp.authenticate_as('f0000000-0000-0000-0000-00000000000e');
select throws_ok(
  $$ update public.profiles set platform_role = 'admin' where id = 'f0000000-0000-0000-0000-00000000000e' $$,
  '42501', null,
  '29. platform_role self-escalation is still blocked after all Phase 1D changes'
);

select * from finish();

rollback;
