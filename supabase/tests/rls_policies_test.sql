-- Phase 1A RLS/policy tests — real pgTAP tests run by `supabase test db` against a real local
-- Postgres instance (not JavaScript assertions about SQL strings). Everything runs inside one
-- transaction and rolls back at the end, so no fixture data is ever left behind.
--
-- These require Docker (`supabase start`) to actually execute. See the final report for what
-- could and could not be run in this environment.

begin;

create extension if not exists pgtap with schema extensions;

select plan(20);

-- =========================================================================================
-- Helpers — simulate PostgREST's per-request auth context inside a plain SQL session.
-- Standard Supabase pgTAP pattern: auth.uid() reads the `sub` claim out of the
-- `request.jwt.claims` GUC, and RLS's `to authenticated`/`to anon` clauses check the actual
-- Postgres role, so both have to be set together for a faithful simulation.
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

-- Back to the connecting (superuser/test-runner) role — needed to set up or inspect fixtures
-- that must bypass RLS entirely, the same way a migration or an admin script would.
create function pg_temp.authenticate_as_test_runner() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', ''::text, true);
  reset role;
end;
$$;

-- =========================================================================================
-- Fixtures — two real auth.users rows. This also implicitly exercises the on_auth_user_created
-- bootstrap trigger: each insert below must produce exactly one public.profiles row with no
-- extra tenant_profiles/landlord_profiles rows invented alongside it.
-- =========================================================================================

select pg_temp.authenticate_as_test_runner();

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'user-a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'user-b@example.test');

select results_eq(
  $$ select count(*)::int from public.profiles where id in
     ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222') $$,
  $$ values (2) $$,
  'bootstrap: inserting two auth.users rows creates exactly one profiles row each, automatically'
);

-- =========================================================================================
-- 1. User A can access own profiles row.
-- =========================================================================================

select pg_temp.authenticate_as('11111111-1111-1111-1111-111111111111');

select isnt_empty(
  $$ select 1 from public.profiles where id = '11111111-1111-1111-1111-111111111111' $$,
  'profiles_select_own: User A can read their own bootstrap-created profiles row'
);

-- =========================================================================================
-- 2. User A cannot access User B's private profile.
-- =========================================================================================

select is_empty(
  $$ select 1 from public.profiles where id = '22222222-2222-2222-2222-222222222222' $$,
  'profiles_select_own: User A cannot read User B''s profiles row (RLS returns zero rows)'
);

-- =========================================================================================
-- 3. User A can create/update own tenant profile.
-- =========================================================================================

select lives_ok(
  $$ insert into public.tenant_profiles (profile_id, target_city, looking_for)
     values ('11111111-1111-1111-1111-111111111111', 'Dublin', 'any') $$,
  'tenant_profiles_insert_own: User A can insert their own tenant profile'
);

select lives_ok(
  $$ update public.tenant_profiles set target_city = 'Cork'
     where profile_id = '11111111-1111-1111-1111-111111111111' $$,
  'tenant_profiles_update_own: User A can update their own tenant profile'
);

select results_eq(
  $$ select target_city from public.tenant_profiles
     where profile_id = '11111111-1111-1111-1111-111111111111' $$,
  $$ values ('Cork'::text) $$,
  'the update actually persisted the new value'
);

-- Not asserted here: within a single pgTAP test transaction, now() is frozen for the whole
-- transaction, so created_at and updated_at would be identical regardless of whether the
-- trigger works — that would only be testing a timing artifact, not the trigger. The
-- set_updated_at() trigger is instead verified directly against two separate, real
-- transactions — see the final report.

-- =========================================================================================
-- 4. User A can create/update own landlord profile.
-- =========================================================================================

select lives_ok(
  $$ insert into public.landlord_profiles (profile_id, display_name)
     values ('11111111-1111-1111-1111-111111111111', 'Test Landlord A') $$,
  'landlord_profiles_insert_own: User A can insert their own landlord profile'
);

select lives_ok(
  $$ update public.landlord_profiles set display_name = 'Updated Landlord A'
     where profile_id = '11111111-1111-1111-1111-111111111111' $$,
  'landlord_profiles_update_own: User A can update their own landlord profile'
);

-- =========================================================================================
-- 5. Same account can own BOTH tenant and landlord profile rows.
-- =========================================================================================

select isnt_empty(
  $$ select 1 from public.tenant_profiles where profile_id = '11111111-1111-1111-1111-111111111111' $$,
  'User A has a tenant_profiles row'
);

select isnt_empty(
  $$ select 1 from public.landlord_profiles where profile_id = '11111111-1111-1111-1111-111111111111' $$,
  'the SAME User A also has a landlord_profiles row — one identity, both roles, no exclusivity rule'
);

-- =========================================================================================
-- 6. User A cannot update User B's tenant profile.
-- =========================================================================================

select pg_temp.authenticate_as('22222222-2222-2222-2222-222222222222');

select lives_ok(
  $$ insert into public.tenant_profiles (profile_id, target_city, looking_for)
     values ('22222222-2222-2222-2222-222222222222', 'Galway', 'room') $$,
  'setup: User B can insert their own tenant profile'
);

select pg_temp.authenticate_as('11111111-1111-1111-1111-111111111111');

select lives_ok(
  $$ update public.tenant_profiles set target_city = 'Hacked-By-A'
     where profile_id = '22222222-2222-2222-2222-222222222222' $$,
  'the UPDATE statement itself does not error — RLS just makes it match zero rows, not a hard failure'
);

select pg_temp.authenticate_as_test_runner();

select results_eq(
  $$ select target_city from public.tenant_profiles
     where profile_id = '22222222-2222-2222-2222-222222222222' $$,
  $$ values ('Galway'::text) $$,
  'tenant_profiles_update_own: User B''s tenant profile is unchanged after User A''s attempted update'
);

-- =========================================================================================
-- 7. User A cannot change own platform_role.
-- =========================================================================================

select pg_temp.authenticate_as('11111111-1111-1111-1111-111111111111');

select throws_ok(
  $$ update public.profiles set platform_role = 'admin'
     where id = '11111111-1111-1111-1111-111111111111' $$,
  '42501',
  null,
  'User A cannot set their own platform_role — blocked by column-level privilege + trigger (42501 permission denied)'
);

select pg_temp.authenticate_as_test_runner();

select results_eq(
  $$ select platform_role::text from public.profiles where id = '11111111-1111-1111-1111-111111111111' $$,
  $$ values ('user'::text) $$,
  'User A''s platform_role is still the default ''user'' after the blocked attempt'
);

-- =========================================================================================
-- 8. User A cannot change own platform_status.
-- =========================================================================================

select pg_temp.authenticate_as('11111111-1111-1111-1111-111111111111');

select throws_ok(
  $$ update public.profiles set platform_status = 'banned'
     where id = '11111111-1111-1111-1111-111111111111' $$,
  '42501',
  null,
  'User A cannot set their own platform_status — blocked by column-level privilege + trigger (42501 permission denied)'
);

select pg_temp.authenticate_as_test_runner();

select results_eq(
  $$ select platform_status::text from public.profiles where id = '11111111-1111-1111-1111-111111111111' $$,
  $$ values ('active'::text) $$,
  'User A''s platform_status is still the default ''active'' after the blocked attempt'
);

-- =========================================================================================
-- 9. Anonymous users cannot read private profile data.
-- =========================================================================================

select pg_temp.authenticate_as_anon();

select throws_ok(
  $$ select 1 from public.profiles where id = '11111111-1111-1111-1111-111111111111' $$,
  '42501',
  null,
  'anon has no SELECT privilege on profiles at all — a hard permission error, not merely zero rows'
);

select throws_ok(
  $$ select 1 from public.tenant_profiles where profile_id = '11111111-1111-1111-1111-111111111111' $$,
  '42501',
  null,
  'anon has no SELECT privilege on tenant_profiles either'
);

select throws_ok(
  $$ select 1 from public.landlord_profiles where profile_id = '11111111-1111-1111-1111-111111111111' $$,
  '42501',
  null,
  'anon has no SELECT privilege on landlord_profiles either'
);

select * from finish();

rollback;
