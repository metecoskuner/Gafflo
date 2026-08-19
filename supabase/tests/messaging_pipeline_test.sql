-- Phase 3 messaging pipeline tests — real pgTAP tests run against a real Postgres instance
-- (see the Phase 3 report for exactly which runs were against the real Supabase project vs.
-- this repeatable committed suite). Everything runs inside one transaction and rolls back.
-- Real concurrency (parallel HTTP races) cannot be exercised inside a single pgTAP transaction
-- — that is proven separately against the live project and reported alongside this suite.

begin;

create extension if not exists pgtap with schema extensions;

select plan(79);

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

create function pg_temp.make_published_listing(p_owner uuid, p_title text default 'Messaging test listing')
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
  ('30000000-0000-0000-0000-000000000001', 'msg-landlord-a@example.test'),
  ('30000000-0000-0000-0000-000000000002', 'msg-landlord-b@example.test'),
  ('30000000-0000-0000-0000-000000000003', 'msg-tenant-a@example.test'),
  ('30000000-0000-0000-0000-000000000004', 'msg-tenant-b@example.test'),
  ('30000000-0000-0000-0000-000000000005', 'msg-moderator@example.test'),
  ('30000000-0000-0000-0000-000000000006', 'msg-tenant-suspended@example.test'),
  ('30000000-0000-0000-0000-000000000007', 'msg-tenant-banned@example.test'),
  ('30000000-0000-0000-0000-000000000008', 'msg-landlord-suspended@example.test');

set local role service_role;
update public.profiles set platform_role = 'moderator' where id = '30000000-0000-0000-0000-000000000005';
reset role;
-- 006, 007 and 008 (the eventually-suspended/banned identities) deliberately stay active here
-- — each one's conversation is built while they are still active, and the status change is
-- applied later, in context, right before the specific test that needs it. This matches every
-- earlier suite's established fixture ordering (a suspended/banned caller cannot pass
-- is_caller_active() to build a conversation via start_conversation() in the first place).

insert into public.tenant_profiles (profile_id, target_city, looking_for) values
  ('30000000-0000-0000-0000-000000000003', 'Dublin', 'any'),
  ('30000000-0000-0000-0000-000000000004', 'Dublin', 'any'),
  ('30000000-0000-0000-0000-000000000006', 'Dublin', 'any'),
  ('30000000-0000-0000-0000-000000000007', 'Dublin', 'any');

select pg_temp.authenticate_as('30000000-0000-0000-0000-000000000001');
select pg_temp.make_published_listing('30000000-0000-0000-0000-000000000001', 'Landlord A listing') as listing_a_id \gset
select pg_temp.publish_listing(:'listing_a_id');

select pg_temp.authenticate_as('30000000-0000-0000-0000-000000000002');
select pg_temp.make_published_listing('30000000-0000-0000-0000-000000000002', 'Landlord B listing') as listing_b_id \gset
select pg_temp.publish_listing(:'listing_b_id');

select pg_temp.authenticate_as('30000000-0000-0000-0000-000000000008');
select pg_temp.make_published_listing('30000000-0000-0000-0000-000000000008', 'Suspended landlord listing') as listing_susp_owner_id \gset
select pg_temp.publish_listing(:'listing_susp_owner_id');

set local role service_role;
update public.profiles set platform_status = 'suspended' where id = '30000000-0000-0000-0000-000000000008';
reset role;

-- Also a draft listing, owned by A, for the "not published" check.
select pg_temp.authenticate_as('30000000-0000-0000-0000-000000000001');
insert into public.listings (owner_id, listing_category) values ('30000000-0000-0000-0000-000000000001', 'entire_property');
select pg_temp.authenticate_as_test_runner();
select id as draft_listing_id from public.listings where owner_id = '30000000-0000-0000-0000-000000000001' and status = 'draft' limit 1 \gset

-- =========================================================================================
-- PART 1 — start_conversation: auth, ownership, duplicates.
-- =========================================================================================

select pg_temp.authenticate_as('30000000-0000-0000-0000-000000000003');
select lives_ok(
  format($$ select public.start_conversation(%L, 'Hi, is this still available? I would love to know more.') $$, :'listing_a_id'),
  '1. an active tenant with a tenant profile can start a conversation on a published listing'
);

select pg_temp.authenticate_as_test_runner();
select id as conv_a3_id from public.conversations where listing_id = (:'listing_a_id')::uuid and tenant_id = '30000000-0000-0000-0000-000000000003' \gset

select results_eq(
  format($$ select tenant_id::text, landlord_id::text from public.conversations where id = %L $$, :'conv_a3_id'),
  $$ values ('30000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001') $$,
  '2. the conversation''s tenant_id/landlord_id are exactly the caller and the listing owner, both server-derived'
);

select results_eq(
  format($$ select count(*)::int from public.messages where conversation_id = %L $$, :'conv_a3_id'),
  $$ values (1) $$,
  '3. exactly one initial message exists after conversation creation'
);

select results_eq(
  format($$ select sender_id::text from public.messages where conversation_id = %L $$, :'conv_a3_id'),
  $$ values ('30000000-0000-0000-0000-000000000003') $$,
  '4. the initial message''s sender_id is genuinely the tenant, never client-forgeable'
);

select results_eq(
  format($$ select count(*)::int from public.conversation_participant_state where conversation_id = %L $$, :'conv_a3_id'),
  $$ values (2) $$,
  '5. both participant-state rows were created atomically alongside the conversation'
);

select pg_temp.authenticate_as_anon();
select throws_ok(
  format($$ select public.start_conversation(%L, 'hello') $$, :'listing_b_id'),
  '42501', null,
  '6. anonymous cannot call start_conversation at all (no execute grant)'
);

select pg_temp.authenticate_as('30000000-0000-0000-0000-000000000001'); -- landlord A, no tenant profile
select throws_ok(
  format($$ select public.start_conversation(%L, 'hello') $$, :'listing_b_id'),
  null::char(5), null,
  '7. an account without a tenant_profiles row cannot start a conversation'
);

-- Give landlord A a tenant profile too (a valid, real scenario — the same identity can hold
-- both) so test 8 below exercises the "own listing" rejection specifically, not the earlier
-- "no tenant profile" rejection which would otherwise fire first and mask it.
select pg_temp.authenticate_as_test_runner();
insert into public.tenant_profiles (profile_id, target_city, looking_for) values ('30000000-0000-0000-0000-000000000001', 'Dublin', 'any');
select pg_temp.authenticate_as('30000000-0000-0000-0000-000000000001');

select throws_ok(
  format($$ select public.start_conversation(%L, 'hello') $$, :'listing_a_id'),
  '42501', null,
  '8. a landlord cannot start a conversation about their own listing'
);

select pg_temp.authenticate_as('30000000-0000-0000-0000-000000000003');
select throws_ok(
  format($$ select public.start_conversation(%L, 'hello') $$, :'draft_listing_id'),
  null::char(5), null,
  '9. a tenant cannot start a conversation on an unpublished (draft) listing'
);

select throws_ok(
  format($$ select public.start_conversation(%L, 'hello') $$, :'listing_susp_owner_id'),
  null::char(5), null,
  '10. a tenant cannot start a conversation with a suspended landlord''s listing'
);

-- Duplicate: same tenant + listing again returns the SAME conversation, no new message.
select results_eq(
  format($$ select public.start_conversation(%L, 'a different message entirely')::text $$, :'listing_a_id'),
  format($$ values (%L) $$, :'conv_a3_id'),
  '11. calling start_conversation again for the same listing+tenant returns the existing conversation id'
);
select results_eq(
  format($$ select count(*)::int from public.messages where conversation_id = %L $$, :'conv_a3_id'),
  $$ values (1) $$,
  '12. the duplicate start_conversation call did not create a second message'
);
select results_eq(
  $$ select count(*)::int from public.conversations where listing_id = (select listing_id from public.conversations limit 1) and tenant_id = '30000000-0000-0000-0000-000000000003' $$,
  $$ values (1) $$,
  '13. still exactly one conversation row for this listing+tenant pair'
);

-- =========================================================================================
-- PART 2 — send_message: anti-spam, ownership, validation.
-- =========================================================================================

select throws_ok(
  format($$ select public.send_message(%L, 'This is my second unsolicited message.') $$, :'conv_a3_id'),
  '42501', null,
  '14. a tenant cannot send a second message before the landlord has replied'
);

select pg_temp.authenticate_as('30000000-0000-0000-0000-000000000002'); -- landlord B, not a participant
select throws_ok(
  format($$ select public.send_message(%L, 'butting in') $$, :'conv_a3_id'),
  '42501', null,
  '15. a non-participant landlord cannot send into another landlord''s conversation'
);

select pg_temp.authenticate_as('30000000-0000-0000-0000-000000000001');
select lives_ok(
  format($$ select public.send_message(%L, 'Thanks for reaching out! Yes, it is still available.') $$, :'conv_a3_id'),
  '16. the listing owner (landlord) can reply'
);

select pg_temp.authenticate_as('30000000-0000-0000-0000-000000000003');
select lives_ok(
  format($$ select public.send_message(%L, 'Great, could we arrange a viewing?') $$, :'conv_a3_id'),
  '17. after a real landlord reply, the tenant can send a follow-up message'
);

select pg_temp.authenticate_as('30000000-0000-0000-0000-000000000001');
select lives_ok(
  format($$ select public.send_message(%L, 'Sure, how about this weekend?') $$, :'conv_a3_id'),
  '18. normal two-way messaging continues to work for the landlord'
);

select throws_ok(
  $$ select public.send_message('00000000-0000-0000-0000-000000000000', 'hi') $$,
  '42501', null,
  '19. sending into a nonexistent conversation id is rejected the same as an unauthorized one'
);

select throws_ok(
  format($$ select public.send_message(%L, '   ') $$, :'conv_a3_id'),
  null::char(5), null,
  '20. a whitespace-only message body is rejected'
);

select throws_ok(
  format($$ select public.send_message(%L, repeat('x', 1201)) $$, :'conv_a3_id'),
  null::char(5), null,
  '21. a message body over 1200 characters is rejected'
);

select lives_ok(
  format($$ select public.send_message(%L, repeat('x', 1200)) $$, :'conv_a3_id'),
  '22. a message body at exactly 1200 characters is accepted'
);

-- now() is constant for the whole duration of this transaction (transaction_timestamp()
-- semantics), so created_at cannot be used to find "the message just sent" within this test
-- file — every row inserted anywhere in this suite shares the same created_at. Capture the
-- message id directly instead.
select public.send_message(:'conv_a3_id', '   Great,   could we   arrange a viewing?   ') as msg_whitespace_id \gset
select pg_temp.authenticate_as_test_runner();
select results_eq(
  format($$ select body from public.messages where id = %L $$, :'msg_whitespace_id'),
  $$ values ('Great, could we arrange a viewing?') $$,
  '23. message bodies have surrounding/repeated whitespace cleaned up, not otherwise rewritten'
);

-- =========================================================================================
-- PART 3 — RLS / cross-user privacy.
-- =========================================================================================

select pg_temp.authenticate_as('30000000-0000-0000-0000-000000000004'); -- tenant B, unrelated
select is_empty(
  format($$ select 1 from public.conversations where id = %L $$, :'conv_a3_id'),
  '24. tenant B cannot read tenant A''s conversation'
);
select throws_ok(
  format($$ select public.send_message(%L, 'intruding') $$, :'conv_a3_id'),
  '42501', null,
  '25. tenant B cannot send into tenant A''s conversation'
);

select pg_temp.authenticate_as('30000000-0000-0000-0000-000000000002'); -- landlord B, unrelated
select is_empty(
  format($$ select 1 from public.conversations where id = %L $$, :'conv_a3_id'),
  '26. landlord B cannot read landlord A''s conversation'
);
select is_empty(
  format($$ select 1 from public.messages where conversation_id = %L $$, :'conv_a3_id'),
  '27. landlord B cannot read landlord A''s conversation messages either'
);

select pg_temp.authenticate_as_anon();
select throws_ok(
  format($$ select 1 from public.conversations where id = %L $$, :'conv_a3_id'),
  null::char(5), null,
  '28. anonymous has no read access to conversations at all'
);
select throws_ok(
  $$ select 1 from public.messages limit 1 $$,
  null::char(5), null,
  '29. anonymous has no read access to messages at all'
);
select throws_ok(
  $$ select 1 from public.conversation_participant_state limit 1 $$,
  null::char(5), null,
  '30. anonymous has no read access to participant state at all'
);
select throws_ok(
  $$ select 1 from public.blocks limit 1 $$,
  null::char(5), null,
  '31. anonymous has no read access to blocks at all'
);
select throws_ok(
  format($$ select public.send_message(%L, 'hi') $$, :'conv_a3_id'),
  '42501', null,
  '32. anonymous cannot call send_message at all (no execute grant)'
);

-- Being a moderator grants nothing here.
select pg_temp.authenticate_as('30000000-0000-0000-0000-000000000005');
select is_empty(
  format($$ select 1 from public.conversations where id = %L $$, :'conv_a3_id'),
  '33. a moderator (not a participant) cannot read this conversation either'
);
select is_empty(
  format($$ select 1 from public.messages where conversation_id = %L $$, :'conv_a3_id'),
  '34. a moderator cannot read this conversation''s messages either'
);

-- No listing-privacy leak through the conversation surface.
select pg_temp.authenticate_as('30000000-0000-0000-0000-000000000001');
select throws_ok(
  format($$ select l.exact_address from public.conversations c join public.listings l on l.id = c.listing_id where c.id = %L $$, :'conv_a3_id'),
  '42501', null,
  '35. joining conversations to listings still cannot read exact_address (no new bypass introduced)'
);

-- Cross-user cannot read the other participant''s own state row directly.
select is_empty(
  format($$ select 1 from public.conversation_participant_state where conversation_id = %L and user_id = '30000000-0000-0000-0000-000000000003' $$, :'conv_a3_id'),
  '36. the landlord cannot read the tenant''s own participant-state row (only their own)'
);

-- =========================================================================================
-- PART 4 — Read state / archive / mute.
-- =========================================================================================

select pg_temp.authenticate_as('30000000-0000-0000-0000-000000000003');
select lives_ok(
  format($$ select public.mark_conversation_read(%L) $$, :'conv_a3_id'),
  '37. the tenant can mark their own participant state read'
);
select pg_temp.authenticate_as_test_runner();
select ok(
  (select last_read_at is not null from public.conversation_participant_state where conversation_id = (:'conv_a3_id')::uuid and user_id = '30000000-0000-0000-0000-000000000003'),
  '38. last_read_at is now set for the tenant'
);
select ok(
  (select last_read_at is null from public.conversation_participant_state where conversation_id = (:'conv_a3_id')::uuid and user_id = '30000000-0000-0000-0000-000000000001'),
  '39. mark_conversation_read did not touch the landlord''s own participant state'
);

select pg_temp.authenticate_as('30000000-0000-0000-0000-000000000003');
select lives_ok(
  format($$ select public.set_conversation_archived(%L, true) $$, :'conv_a3_id'),
  '40. the tenant can archive their own view of the conversation'
);
select pg_temp.authenticate_as_test_runner();
select ok(
  (select archived_at is not null from public.conversation_participant_state where conversation_id = (:'conv_a3_id')::uuid and user_id = '30000000-0000-0000-0000-000000000003'),
  '41. the tenant''s archived_at is now set'
);
select ok(
  (select archived_at is null from public.conversation_participant_state where conversation_id = (:'conv_a3_id')::uuid and user_id = '30000000-0000-0000-0000-000000000001'),
  '42. archiving by the tenant does not affect the landlord''s own state at all'
);

-- A new incoming message resurfaces the conversation for the archived recipient.
select pg_temp.authenticate_as('30000000-0000-0000-0000-000000000001');
select public.send_message(:'conv_a3_id', 'One more thing — parking is included.');
select pg_temp.authenticate_as_test_runner();
select ok(
  (select archived_at is null from public.conversation_participant_state where conversation_id = (:'conv_a3_id')::uuid and user_id = '30000000-0000-0000-0000-000000000003'),
  '43. a new incoming message clears the recipient''s archived_at, making the conversation visible again'
);

select pg_temp.authenticate_as('30000000-0000-0000-0000-000000000003');
select lives_ok(
  format($$ select public.set_conversation_muted(%L, true) $$, :'conv_a3_id'),
  '44. the tenant can mute their own view of the conversation'
);
select pg_temp.authenticate_as_test_runner();
select results_eq(
  format($$ select muted from public.conversation_participant_state where conversation_id = %L and user_id = '30000000-0000-0000-0000-000000000003' $$, :'conv_a3_id'),
  $$ values (true) $$,
  '45. mute state persists'
);
select pg_temp.authenticate_as('30000000-0000-0000-0000-000000000001');
select lives_ok(
  format($$ select public.send_message(%L, 'Still there?') $$, :'conv_a3_id'),
  '46. a muted conversation still receives messages normally'
);
select is_empty(
  format($$ select 1 from public.conversation_participant_state where conversation_id = %L and user_id = '30000000-0000-0000-0000-000000000003' $$, :'conv_a3_id'),
  '47. the landlord cannot read the tenant''s mute state (or any of their state) at all'
);

-- Cross-user cannot touch another participant''s state via any of the three functions.
select pg_temp.authenticate_as('30000000-0000-0000-0000-000000000004'); -- tenant B, non-participant
select throws_ok(
  format($$ select public.mark_conversation_read(%L) $$, :'conv_a3_id'),
  '42501', null,
  '48. a non-participant cannot mark this conversation read'
);
select throws_ok(
  format($$ select public.set_conversation_archived(%L, true) $$, :'conv_a3_id'),
  '42501', null,
  '49. a non-participant cannot archive this conversation'
);
select throws_ok(
  format($$ select public.set_conversation_muted(%L, true) $$, :'conv_a3_id'),
  '42501', null,
  '50. a non-participant cannot mute this conversation'
);

-- =========================================================================================
-- PART 5 — Blocking.
-- =========================================================================================

select pg_temp.authenticate_as('30000000-0000-0000-0000-000000000003');
select throws_ok(
  $$ select public.block_user('30000000-0000-0000-0000-000000000003') $$,
  null::char(5), null,
  '51. a user cannot block themselves'
);

select lives_ok(
  $$ select public.block_user('30000000-0000-0000-0000-000000000001') $$,
  '52. the tenant can block the landlord'
);
select lives_ok(
  $$ select public.block_user('30000000-0000-0000-0000-000000000001') $$,
  '53. blocking the same user again is idempotent, not an error'
);
select pg_temp.authenticate_as_test_runner();
select results_eq(
  $$ select count(*)::int from public.blocks where blocker_id = '30000000-0000-0000-0000-000000000003' and blocked_id = '30000000-0000-0000-0000-000000000001' $$,
  $$ values (1) $$,
  '54. exactly one block row exists despite the repeat call'
);

select pg_temp.authenticate_as('30000000-0000-0000-0000-000000000003');
select throws_ok(
  format($$ select public.send_message(%L, 'after blocking') $$, :'conv_a3_id'),
  '42501', null,
  '55. the blocker cannot send a new message in a conversation with the blocked party'
);
select pg_temp.authenticate_as('30000000-0000-0000-0000-000000000001');
select throws_ok(
  format($$ select public.send_message(%L, 'did you block me') $$, :'conv_a3_id'),
  '42501', null,
  '56. the blocked party also cannot send — blocking is two-way even though the record is directional'
);
select isnt_empty(
  format($$ select 1 from public.messages where conversation_id = %L $$, :'conv_a3_id'),
  '57. existing message history remains fully readable after a block'
);

-- The blocked party has no query surface revealing they were blocked.
select is_empty(
  $$ select 1 from public.blocks where blocked_id = '30000000-0000-0000-0000-000000000001' $$,
  '58. the blocked landlord cannot discover "who blocked me" through the blocks table (RLS only shows rows they created as blocker)'
);

select pg_temp.authenticate_as('30000000-0000-0000-0000-000000000003');
select lives_ok(
  $$ select public.unblock_user('30000000-0000-0000-0000-000000000001') $$,
  '59. the tenant can unblock the landlord'
);
select pg_temp.authenticate_as('30000000-0000-0000-0000-000000000001');
select lives_ok(
  format($$ select public.send_message(%L, 'welcome back') $$, :'conv_a3_id'),
  '60. after unblocking, messaging works again (subject to all other rules)'
);

-- =========================================================================================
-- PART 6 — Platform status enforcement for messaging.
-- =========================================================================================

-- Suspended tenant conversation, built while still active.
select pg_temp.authenticate_as('30000000-0000-0000-0000-000000000006');
select public.start_conversation(:'listing_b_id', 'Hello, interested in this one.');
select pg_temp.authenticate_as_test_runner();
select id as conv_susp_tenant_id from public.conversations where listing_id = (:'listing_b_id')::uuid and tenant_id = '30000000-0000-0000-0000-000000000006' \gset

set local role service_role;
update public.profiles set platform_status = 'suspended' where id = '30000000-0000-0000-0000-000000000006';
reset role;

select pg_temp.authenticate_as('30000000-0000-0000-0000-000000000006');
select isnt_empty(
  format($$ select 1 from public.conversations where id = %L $$, :'conv_susp_tenant_id'),
  '61. a suspended tenant retains read access to their own conversation history'
);
select throws_ok(
  format($$ select public.send_message(%L, 'still trying') $$, :'conv_susp_tenant_id'),
  '42501', null,
  '62. a suspended tenant cannot send a new message'
);
select lives_ok(
  format($$ select public.set_conversation_archived(%L, true) $$, :'conv_susp_tenant_id'),
  '63. a suspended tenant may still archive'
);
select lives_ok(
  $$ select public.block_user('30000000-0000-0000-0000-000000000002') $$,
  '64. a suspended tenant may still block for safety'
);

select pg_temp.authenticate_as('30000000-0000-0000-0000-000000000002'); -- listing_b_id''s active owner
select throws_ok(
  format($$ select public.send_message(%L, 'reply attempt') $$, :'conv_susp_tenant_id'),
  '42501', null,
  '65. an active landlord cannot send to a now-suspended tenant counterpart either'
);

-- Banned tenant, built while still active (banned tenant 007 already exists as a fixture).
select pg_temp.authenticate_as('30000000-0000-0000-0000-000000000007');
select public.start_conversation(:'listing_a_id', 'Hello, is this listing still open?');
select pg_temp.authenticate_as_test_runner();
select id as conv_banned_tenant_id from public.conversations where listing_id = (:'listing_a_id')::uuid and tenant_id = '30000000-0000-0000-0000-000000000007' \gset

set local role service_role;
update public.profiles set platform_status = 'banned' where id = '30000000-0000-0000-0000-000000000007';
reset role;

select pg_temp.authenticate_as('30000000-0000-0000-0000-000000000007');
select isnt_empty(
  format($$ select 1 from public.conversations where id = %L $$, :'conv_banned_tenant_id'),
  '66. a banned tenant retains their own historical conversation read access'
);
select throws_ok(
  format($$ select public.send_message(%L, 'still here') $$, :'conv_banned_tenant_id'),
  '42501', null,
  '67. a banned tenant cannot send a new message'
);
select lives_ok(
  format($$ select public.set_conversation_archived(%L, true) $$, :'conv_banned_tenant_id'),
  '68. a banned tenant may still use local safety/organization controls like archive'
);

select pg_temp.authenticate_as('30000000-0000-0000-0000-000000000001'); -- listing_a_id''s active owner
select throws_ok(
  format($$ select public.send_message(%L, 'reply attempt') $$, :'conv_banned_tenant_id'),
  '42501', null,
  '69. an active landlord cannot send to a banned tenant counterpart either'
);

-- =========================================================================================
-- PART 7 — Immutability: no client bypass of the guarded functions via direct DML.
-- =========================================================================================

select pg_temp.authenticate_as('30000000-0000-0000-0000-000000000001');

select throws_ok(
  format($$ insert into public.messages (conversation_id, sender_id, body) values (%L, '30000000-0000-0000-0000-000000000001', 'bypass attempt') $$, :'conv_a3_id'),
  '42501', null,
  '70. a client cannot directly INSERT into messages, bypassing send_message()'
);
select throws_ok(
  format($$ update public.messages set body = 'forged content' where conversation_id = %L $$, :'conv_a3_id'),
  '42501', null,
  '71. a client cannot directly UPDATE a message body after sending'
);
select throws_ok(
  format($$ update public.messages set created_at = '2000-01-01' where conversation_id = %L $$, :'conv_a3_id'),
  '42501', null,
  '72. a client cannot forge a message''s created_at timestamp'
);
select throws_ok(
  format($$ delete from public.messages where conversation_id = %L $$, :'conv_a3_id'),
  '42501', null,
  '73. a client cannot directly DELETE a message'
);

select throws_ok(
  $$ insert into public.conversations (listing_id, tenant_id, landlord_id) values ('00000000-0000-0000-0000-000000000000', '30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002') $$,
  '42501', null,
  '74. a client cannot directly INSERT into conversations, bypassing start_conversation()'
);
select throws_ok(
  format($$ update public.conversations set tenant_id = '30000000-0000-0000-0000-000000000004' where id = %L $$, :'conv_a3_id'),
  '42501', null,
  '75. a client cannot reassign a conversation''s tenant_id'
);
select throws_ok(
  format($$ update public.conversations set landlord_id = '30000000-0000-0000-0000-000000000002' where id = %L $$, :'conv_a3_id'),
  '42501', null,
  '76. a client cannot reassign a conversation''s landlord_id'
);
select throws_ok(
  format($$ update public.conversations set listing_id = %L where id = %L $$, :'listing_b_id', :'conv_a3_id'),
  '42501', null,
  '77. a client cannot reattach a conversation to a different listing'
);
select throws_ok(
  format($$ delete from public.conversations where id = %L $$, :'conv_a3_id'),
  '42501', null,
  '78. a client cannot directly DELETE a conversation'
);

select throws_ok(
  format($$ insert into public.conversation_participant_state (conversation_id, user_id) values (%L, '30000000-0000-0000-0000-000000000004') $$, :'conv_a3_id'),
  '42501', null,
  '79. a client cannot directly INSERT a participant-state row for themselves or anyone else'
);

select * from finish();

rollback;
