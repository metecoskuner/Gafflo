-- Public profile summary tests — real pgTAP tests run against a real Postgres instance (see
-- the report for exactly which checks were also run against the real Supabase project vs. this
-- repeatable committed suite). Everything runs inside one transaction and rolls back at the end.

begin;

create extension if not exists pgtap with schema extensions;

select plan(25);

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
-- Fixtures.
--
-- 0001 = reader — the caller in every test below, with its own display_name/avatar set so
--        "own summary works" has a real value to assert against, not just a null passthrough.
-- 0002 = plain target — display_name + avatar_url set directly on profiles, no landlord_profiles
--        row. Proves the ordinary (non-landlord) resolution path.
-- 0003 = landlord target — profiles.display_name AND landlord_profiles.display_name both set to
--        DIFFERENT values. Proves landlord_profiles.display_name (the public listing-facing
--        name) wins, never the account-level profiles.display_name.
-- 0004 = suspended landlord target — has a landlord_profiles row, platform_status = suspended.
--        Proves suspension does not remove the row or change its content.
-- 0005 = banned target — profiles.display_name only, no landlord_profiles row, platform_status
--        = banned. Proves banning does not remove the row or change its content.
-- 0006 = soft-deleted target — deleted_at set. Proves deleted_at IS honoured (only column that
--        legitimately suppresses a row, per the migration's own stated design).
-- 0007 = blank target — no display_name/avatar_url ever set (both stay null), no landlord
--        profile. Proves an existing-but-empty profile still returns a row (null fields), never
--        gets treated the same as "does not exist".
-- 59999999-... = a syntactically valid but entirely unknown uuid, never inserted anywhere.
-- =========================================================================================

insert into auth.users (id, email) values
  ('50000000-0000-0000-0000-000000000001', 'pps-reader@example.test'),
  ('50000000-0000-0000-0000-000000000002', 'pps-plain@example.test'),
  ('50000000-0000-0000-0000-000000000003', 'pps-landlord@example.test'),
  ('50000000-0000-0000-0000-000000000004', 'pps-landlord-suspended@example.test'),
  ('50000000-0000-0000-0000-000000000005', 'pps-banned@example.test'),
  ('50000000-0000-0000-0000-000000000006', 'pps-deleted@example.test'),
  ('50000000-0000-0000-0000-000000000007', 'pps-blank@example.test');

set local role service_role;

update public.profiles set display_name = 'Reader Self', avatar_url = 'https://example.test/reader.png'
  where id = '50000000-0000-0000-0000-000000000001';
update public.profiles set display_name = 'Aisling Tenant', avatar_url = 'https://example.test/aisling.png'
  where id = '50000000-0000-0000-0000-000000000002';
update public.profiles set display_name = 'Private Legal Name'
  where id = '50000000-0000-0000-0000-000000000003';
update public.profiles set display_name = 'Suspended Landlord Legal Name', platform_status = 'suspended'
  where id = '50000000-0000-0000-0000-000000000004';
update public.profiles set display_name = 'Banned Person', platform_status = 'banned'
  where id = '50000000-0000-0000-0000-000000000005';
update public.profiles set display_name = 'Deleted Person', deleted_at = now()
  where id = '50000000-0000-0000-0000-000000000006';

insert into public.landlord_profiles (profile_id, display_name, landlord_type) values
  ('50000000-0000-0000-0000-000000000003', 'North Quay Lettings', 'private_landlord'),
  ('50000000-0000-0000-0000-000000000004', 'Suspended Lettings Co', 'private_landlord');

reset role;

-- =========================================================================================
-- PART 1 — content correctness: plain resolution, self-read, landlord-name precedence,
-- suspended/banned non-leak, blank profile, soft-delete suppression, unknown id.
-- =========================================================================================

select pg_temp.authenticate_as('50000000-0000-0000-0000-000000000001');

select results_eq(
  $$ select id::text, display_name, avatar_url from public.get_public_profile_summaries(array['50000000-0000-0000-0000-000000000002']::uuid[]) $$,
  $$ values ('50000000-0000-0000-0000-000000000002', 'Aisling Tenant', 'https://example.test/aisling.png') $$,
  '1. authenticated caller can fetch another user''s public summary'
);

select results_eq(
  $$ select id::text, display_name, avatar_url from public.get_public_profile_summaries(array['50000000-0000-0000-0000-000000000001']::uuid[]) $$,
  $$ values ('50000000-0000-0000-0000-000000000001', 'Reader Self', 'https://example.test/reader.png') $$,
  '2. own summary works'
);

select results_eq(
  $$ select id::text, display_name from public.get_public_profile_summaries(array['50000000-0000-0000-0000-000000000003']::uuid[]) $$,
  $$ values ('50000000-0000-0000-0000-000000000003', 'North Quay Lettings') $$,
  '3. landlord_profiles.display_name (public listing-facing name) wins over profiles.display_name (account-level name)'
);

select results_eq(
  $$ select id::text, display_name from public.get_public_profile_summaries(array['50000000-0000-0000-0000-000000000004']::uuid[]) $$,
  $$ values ('50000000-0000-0000-0000-000000000004', 'Suspended Lettings Co') $$,
  '4. suspended target''s row is returned normally, with its real display_name, not suppressed'
);

select results_eq(
  $$ select id::text, display_name from public.get_public_profile_summaries(array['50000000-0000-0000-0000-000000000005']::uuid[]) $$,
  $$ values ('50000000-0000-0000-0000-000000000005', 'Banned Person') $$,
  '5. banned target''s row is returned normally, with its real display_name, not suppressed'
);

select results_eq(
  $$ select id::text, display_name, avatar_url from public.get_public_profile_summaries(array['50000000-0000-0000-0000-000000000007']::uuid[]) $$,
  $$ values ('50000000-0000-0000-0000-000000000007', null::text, null::text) $$,
  '6. a target with no display_name/avatar ever set still returns a row (nulls), not omitted'
);

select results_eq(
  $$ select count(*)::int from public.get_public_profile_summaries(array['50000000-0000-0000-0000-000000000006']::uuid[]) $$,
  $$ values (0) $$,
  '7. a soft-deleted target (deleted_at set) is excluded from the result'
);

select lives_ok(
  $$ select * from public.get_public_profile_summaries(array['59999999-9999-9999-9999-999999999999']::uuid[]) $$,
  '8. an unknown (well-formed, never-inserted) uuid does not raise'
);
select results_eq(
  $$ select count(*)::int from public.get_public_profile_summaries(array['59999999-9999-9999-9999-999999999999']::uuid[]) $$,
  $$ values (0) $$,
  '9. an unknown uuid simply produces no row, not an error'
);

-- =========================================================================================
-- PART 2 — batching behaviour: one call, multiple targets, dedup, nulls, empty, oversized.
-- =========================================================================================

select results_eq(
  $$
    select id::text, display_name
    from public.get_public_profile_summaries(array[
      '50000000-0000-0000-0000-000000000002',
      '50000000-0000-0000-0000-000000000003',
      '50000000-0000-0000-0000-000000000004',
      '50000000-0000-0000-0000-000000000005'
    ]::uuid[])
    order by id
  $$,
  $$
    values
      ('50000000-0000-0000-0000-000000000002', 'Aisling Tenant'),
      ('50000000-0000-0000-0000-000000000003', 'North Quay Lettings'),
      ('50000000-0000-0000-0000-000000000004', 'Suspended Lettings Co'),
      ('50000000-0000-0000-0000-000000000005', 'Banned Person')
    order by 1
  $$,
  '10. a single batched call resolves multiple distinct targets correctly in one round trip'
);

select results_eq(
  $$ select count(*)::int from public.get_public_profile_summaries(array['50000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000002']::uuid[]) $$,
  $$ values (1) $$,
  '11. a duplicate id in the input array is deduplicated to one row'
);

select lives_ok(
  $$ select * from public.get_public_profile_summaries(array['50000000-0000-0000-0000-000000000002', null]::uuid[]) $$,
  '12. a null element in the input array does not raise'
);
select results_eq(
  $$ select count(*)::int from public.get_public_profile_summaries(array['50000000-0000-0000-0000-000000000002', null]::uuid[]) $$,
  $$ values (1) $$,
  '13. a null element in the input array is simply ignored, not treated as a request'
);

select results_eq(
  $$ select count(*)::int from public.get_public_profile_summaries(array[]::uuid[]) $$,
  $$ values (0) $$,
  '14. an empty input array returns zero rows without error'
);

select throws_ok(
  $$ select * from public.get_public_profile_summaries((select array_agg(gen_random_uuid()) from generate_series(1, 201))) $$,
  'P0001', null,
  '15. an oversized input array (>200 ids) is rejected'
);

-- =========================================================================================
-- PART 3 — column-level non-exposure: prove the actual runtime row shape never contains a
-- privileged field, and that the function's own declared signature structurally excludes them.
-- =========================================================================================

select ok(
  (select not (to_jsonb(t) ? 'email') from public.get_public_profile_summaries(array['50000000-0000-0000-0000-000000000002']::uuid[]) t),
  '16. result row never contains an "email" field'
);
select ok(
  (select not (to_jsonb(t) ? 'phone') from public.get_public_profile_summaries(array['50000000-0000-0000-0000-000000000002']::uuid[]) t),
  '17. result row never contains a "phone" field'
);
select ok(
  (select not (to_jsonb(t) ? 'platform_role') from public.get_public_profile_summaries(array['50000000-0000-0000-0000-000000000002']::uuid[]) t),
  '18. result row never contains a "platform_role" field'
);
select ok(
  (select not (to_jsonb(t) ? 'platform_status') from public.get_public_profile_summaries(array['50000000-0000-0000-0000-000000000005']::uuid[]) t),
  '19. result row never contains a "platform_status" field, even for a banned target'
);
select ok(
  (select not (to_jsonb(t) ? 'last_active_role') from public.get_public_profile_summaries(array['50000000-0000-0000-0000-000000000002']::uuid[]) t),
  '20. result row never contains a "last_active_role" field'
);

select is(
  pg_get_function_result('public.get_public_profile_summaries(uuid[])'::regprocedure),
  'TABLE(id uuid, display_name text, avatar_url text)',
  '21. the function''s declared return signature is exactly (id, display_name, avatar_url) — structurally excludes every other column'
);

-- =========================================================================================
-- PART 4 — grants and RLS boundary.
-- =========================================================================================

select ok(
  has_function_privilege('authenticated', 'public.get_public_profile_summaries(uuid[])', 'EXECUTE'),
  '22. authenticated role has EXECUTE on get_public_profile_summaries'
);
select ok(
  not has_function_privilege('anon', 'public.get_public_profile_summaries(uuid[])', 'EXECUTE'),
  '23. anon role does NOT have EXECUTE on get_public_profile_summaries'
);

select pg_temp.authenticate_as_anon();
select throws_ok(
  $$ select * from public.get_public_profile_summaries(array['50000000-0000-0000-0000-000000000002']::uuid[]) $$,
  '42501', null,
  '24. anon cannot execute get_public_profile_summaries at all'
);

select pg_temp.authenticate_as('50000000-0000-0000-0000-000000000001');
select results_eq(
  $$ select count(*)::int from public.profiles where id = '50000000-0000-0000-0000-000000000002' $$,
  $$ values (0) $$,
  '25. this migration does not widen profiles RLS — a direct SELECT of another user''s row still returns nothing'
);

select * from finish();

rollback;
