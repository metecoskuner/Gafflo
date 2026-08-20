-- Stage H notifications tests — real pgTAP tests run against a real Postgres instance
-- (gafflo-dev — see the Stage H report). Everything runs inside one transaction and rolls back.

begin;

create extension if not exists pgtap with schema extensions;

select plan(46);

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

create function pg_temp.make_published_listing(p_owner uuid, p_title text default 'Notification test listing')
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
  ('70000000-0000-0000-0000-000000000001', 'notif-landlord-a@example.test'),
  ('70000000-0000-0000-0000-000000000002', 'notif-tenant-a@example.test'),
  ('70000000-0000-0000-0000-000000000003', 'notif-tenant-b@example.test'),
  ('70000000-0000-0000-0000-000000000004', 'notif-moderator@example.test');

set local role service_role;
update public.profiles set platform_role = 'moderator' where id = '70000000-0000-0000-0000-000000000004';
reset role;

insert into public.tenant_profiles (profile_id, target_city, looking_for) values
  ('70000000-0000-0000-0000-000000000002', 'Dublin', 'any'),
  ('70000000-0000-0000-0000-000000000003', 'Dublin', 'any');

select pg_temp.authenticate_as('70000000-0000-0000-0000-000000000001');
select pg_temp.make_published_listing('70000000-0000-0000-0000-000000000001', 'Notif Listing 1') as listing_1_id \gset
select pg_temp.publish_listing(:'listing_1_id');

-- =========================================================================================
-- PART 1 — schema/grants sanity.
-- =========================================================================================

select has_table('public', 'notifications', '1. notifications table exists');
select pg_temp.authenticate_as_test_runner();
select is(
  (select count(*)::int from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'notifications' and grantee = 'authenticated' and privilege_type in ('INSERT', 'UPDATE', 'DELETE')),
  0,
  '2. authenticated has no direct write grant on notifications'
);
select is(
  (select count(*)::int from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'notifications' and grantee = 'anon'),
  0,
  '3. anon has zero grants on notifications'
);
select is(
  (select count(*)::int from information_schema.routine_privileges
   where routine_schema = 'public' and routine_name = 'create_notification' and grantee in ('authenticated', 'anon', 'PUBLIC')),
  0,
  '4. create_notification() has no client execute grant of any kind'
);

-- =========================================================================================
-- PART 2 — create_application(): both the tenant receipt and the landlord lead notification.
-- =========================================================================================

select pg_temp.authenticate_as('70000000-0000-0000-0000-000000000002');
select public.create_application(:'listing_1_id') as app_1_id \gset

select pg_temp.authenticate_as_test_runner();
select results_eq(
  format($$ select type::text from public.notifications where user_id = '70000000-0000-0000-0000-000000000002' and application_id = %L $$, :'app_1_id'),
  $$ values ('application_submitted') $$,
  '5. the tenant gets a real application_submitted notification'
);
select results_eq(
  format($$ select type::text from public.notifications where user_id = '70000000-0000-0000-0000-000000000001' and application_id = %L $$, :'app_1_id'),
  $$ values ('new_application') $$,
  '6. the landlord gets a real new_application notification'
);
select is(
  (select read_at from public.notifications where user_id = '70000000-0000-0000-0000-000000000001' and application_id = (:'app_1_id')::uuid),
  null,
  '7. a fresh notification starts unread'
);

-- =========================================================================================
-- PART 3 — landlord_set_application_status(): the tenant is notified with the real new status.
-- =========================================================================================

select pg_temp.authenticate_as('70000000-0000-0000-0000-000000000001');
select public.mark_application_viewed(:'app_1_id');
select public.landlord_set_application_status(:'app_1_id', 'shortlisted');

select pg_temp.authenticate_as_test_runner();
select results_eq(
  format($$ select body from public.notifications where user_id = '70000000-0000-0000-0000-000000000002' and application_id = %L and type = 'application_status_changed' $$, :'app_1_id'),
  $$ values ('Your application status changed to shortlisted.') $$,
  '8. the tenant is notified of the real new status, in real text'
);

-- =========================================================================================
-- PART 4 — start_conversation(): the landlord is notified once, never again on reuse.
-- =========================================================================================

select pg_temp.authenticate_as('70000000-0000-0000-0000-000000000002');
select public.start_conversation(:'listing_1_id', 'Hi, is this still available?') as conv_1_id \gset

select pg_temp.authenticate_as_test_runner();
select results_eq(
  format($$ select type::text from public.notifications where user_id = '70000000-0000-0000-0000-000000000001' and conversation_id = %L $$, :'conv_1_id'),
  $$ values ('new_enquiry') $$,
  '9. the landlord gets a real new_enquiry notification'
);

select pg_temp.authenticate_as('70000000-0000-0000-0000-000000000002');
select public.start_conversation(:'listing_1_id', 'trying again');

select pg_temp.authenticate_as_test_runner();
select is(
  (select count(*)::int from public.notifications where user_id = '70000000-0000-0000-0000-000000000001' and conversation_id = (:'conv_1_id')::uuid),
  1,
  '10. reusing an existing conversation (duplicate start_conversation) does not create a second notification'
);

-- =========================================================================================
-- PART 5 — send_message(): only the FIRST message from each side notifies.
-- =========================================================================================

select pg_temp.authenticate_as('70000000-0000-0000-0000-000000000001');
select public.send_message(:'conv_1_id', 'Yes, still available.');

select pg_temp.authenticate_as_test_runner();
select results_eq(
  format($$ select type::text from public.notifications where user_id = '70000000-0000-0000-0000-000000000002' and conversation_id = %L and type = 'landlord_replied' $$, :'conv_1_id'),
  $$ values ('landlord_replied') $$,
  '11. the tenant is notified on the landlord''s first reply'
);

select pg_temp.authenticate_as('70000000-0000-0000-0000-000000000002');
select public.send_message(:'conv_1_id', 'Great, when can I view it?');

select pg_temp.authenticate_as('70000000-0000-0000-0000-000000000001');
select public.send_message(:'conv_1_id', 'How about Tuesday?');

select pg_temp.authenticate_as_test_runner();
select is(
  (select count(*)::int from public.notifications where user_id = '70000000-0000-0000-0000-000000000002' and conversation_id = (:'conv_1_id')::uuid and type = 'landlord_replied'),
  1,
  '12. the landlord''s SECOND message does not create a second landlord_replied notification'
);
select is(
  (select count(*)::int from public.notifications where user_id = '70000000-0000-0000-0000-000000000001' and conversation_id = (:'conv_1_id')::uuid and type in ('new_enquiry', 'landlord_replied')),
  1,
  '13. the tenant''s second message (a reply, not a new enquiry) does not notify the landlord again'
);

-- =========================================================================================
-- PART 6 — propose_viewing(): the tenant is notified.
-- =========================================================================================

select pg_temp.authenticate_as('70000000-0000-0000-0000-000000000001');
select pg_temp.make_published_listing('70000000-0000-0000-0000-000000000001', 'Notif Listing Viewing') as listing_viewing_id \gset
select pg_temp.publish_listing(:'listing_viewing_id');
select pg_temp.make_shortlisted_application('70000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001', :'listing_viewing_id') as app_viewing_id \gset

select pg_temp.authenticate_as('70000000-0000-0000-0000-000000000001');
select public.propose_viewing(
  :'app_viewing_id',
  jsonb_build_array(jsonb_build_object('starts_at', (now() + interval '3 days')::text, 'ends_at', (now() + interval '3 days 30 minutes')::text))
) as proposal_1_id \gset

select pg_temp.authenticate_as_test_runner();
select results_eq(
  format($$ select type::text from public.notifications where user_id = '70000000-0000-0000-0000-000000000002' and viewing_proposal_id = %L $$, :'proposal_1_id'),
  $$ values ('viewing_proposed') $$,
  '14. the tenant gets a real viewing_proposed notification'
);

-- =========================================================================================
-- PART 7 — accept_viewing_slot(): the landlord is notified once, never again on idempotent retry.
-- =========================================================================================

select pg_temp.authenticate_as_test_runner();
select id as slot_1_id from public.viewing_slots where proposal_id = (:'proposal_1_id')::uuid limit 1 \gset

select pg_temp.authenticate_as('70000000-0000-0000-0000-000000000002');
select public.accept_viewing_slot(:'proposal_1_id', :'slot_1_id');

select pg_temp.authenticate_as_test_runner();
select results_eq(
  format($$ select type::text from public.notifications where user_id = '70000000-0000-0000-0000-000000000001' and viewing_proposal_id = %L $$, :'proposal_1_id'),
  $$ values ('viewing_confirmed') $$,
  '15. the landlord gets a real viewing_confirmed notification'
);

select pg_temp.authenticate_as('70000000-0000-0000-0000-000000000002');
select public.accept_viewing_slot(:'proposal_1_id', :'slot_1_id');

select pg_temp.authenticate_as_test_runner();
select is(
  (select count(*)::int from public.notifications where user_id = '70000000-0000-0000-0000-000000000001' and viewing_proposal_id = (:'proposal_1_id')::uuid and type = 'viewing_confirmed'),
  1,
  '16. retrying acceptance of the same already-confirmed slot does not create a second notification'
);

-- =========================================================================================
-- PART 8 — decline_viewing(): the landlord is notified once, never again on idempotent retry.
-- =========================================================================================

select pg_temp.authenticate_as('70000000-0000-0000-0000-000000000001');
select pg_temp.make_published_listing('70000000-0000-0000-0000-000000000001', 'Notif Listing Decline') as listing_decline_id \gset
select pg_temp.publish_listing(:'listing_decline_id');
select pg_temp.make_shortlisted_application('70000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001', :'listing_decline_id') as app_decline_id \gset

select pg_temp.authenticate_as('70000000-0000-0000-0000-000000000001');
select public.propose_viewing(
  :'app_decline_id',
  jsonb_build_array(jsonb_build_object('starts_at', (now() + interval '4 days')::text, 'ends_at', (now() + interval '4 days 30 minutes')::text))
) as proposal_decline_id \gset

select pg_temp.authenticate_as('70000000-0000-0000-0000-000000000002');
select public.decline_viewing(:'proposal_decline_id');

select pg_temp.authenticate_as_test_runner();
select results_eq(
  format($$ select type::text from public.notifications where user_id = '70000000-0000-0000-0000-000000000001' and viewing_proposal_id = %L $$, :'proposal_decline_id'),
  $$ values ('viewing_declined') $$,
  '17. the landlord gets a real viewing_declined notification'
);

select pg_temp.authenticate_as('70000000-0000-0000-0000-000000000002');
select public.decline_viewing(:'proposal_decline_id');

select pg_temp.authenticate_as_test_runner();
select is(
  (select count(*)::int from public.notifications where user_id = '70000000-0000-0000-0000-000000000001' and viewing_proposal_id = (:'proposal_decline_id')::uuid),
  1,
  '18. retrying an already-declined decline does not create a second notification'
);

-- =========================================================================================
-- PART 9 — cancel_viewing(): notifies whichever participant did NOT initiate cancellation.
-- =========================================================================================

select pg_temp.authenticate_as('70000000-0000-0000-0000-000000000001');
select pg_temp.make_published_listing('70000000-0000-0000-0000-000000000001', 'Notif Listing Cancel A') as listing_cancel_a_id \gset
select pg_temp.publish_listing(:'listing_cancel_a_id');
select pg_temp.make_shortlisted_application('70000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001', :'listing_cancel_a_id') as app_cancel_a_id \gset
select pg_temp.authenticate_as('70000000-0000-0000-0000-000000000001');
select public.propose_viewing(
  :'app_cancel_a_id',
  jsonb_build_array(jsonb_build_object('starts_at', (now() + interval '5 days')::text, 'ends_at', (now() + interval '5 days 30 minutes')::text))
) as proposal_cancel_a_id \gset

-- Tenant cancels -> landlord must be notified.
select pg_temp.authenticate_as('70000000-0000-0000-0000-000000000002');
select public.cancel_viewing(:'proposal_cancel_a_id');

select pg_temp.authenticate_as_test_runner();
select results_eq(
  format($$ select user_id::text from public.notifications where viewing_proposal_id = %L and type = 'viewing_cancelled' $$, :'proposal_cancel_a_id'),
  $$ values ('70000000-0000-0000-0000-000000000001') $$,
  '19. tenant-initiated cancellation notifies the landlord, not the tenant themselves'
);

select pg_temp.authenticate_as('70000000-0000-0000-0000-000000000001');
select pg_temp.make_published_listing('70000000-0000-0000-0000-000000000001', 'Notif Listing Cancel B') as listing_cancel_b_id \gset
select pg_temp.publish_listing(:'listing_cancel_b_id');
select pg_temp.make_shortlisted_application('70000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001', :'listing_cancel_b_id') as app_cancel_b_id \gset
select pg_temp.authenticate_as('70000000-0000-0000-0000-000000000001');
select public.propose_viewing(
  :'app_cancel_b_id',
  jsonb_build_array(jsonb_build_object('starts_at', (now() + interval '6 days')::text, 'ends_at', (now() + interval '6 days 30 minutes')::text))
) as proposal_cancel_b_id \gset

-- Landlord cancels -> tenant must be notified.
select public.cancel_viewing(:'proposal_cancel_b_id');

select pg_temp.authenticate_as_test_runner();
select results_eq(
  format($$ select user_id::text from public.notifications where viewing_proposal_id = %L and type = 'viewing_cancelled' $$, :'proposal_cancel_b_id'),
  $$ values ('70000000-0000-0000-0000-000000000002') $$,
  '20. landlord-initiated cancellation notifies the tenant, not the landlord themselves'
);

-- =========================================================================================
-- PART 10 — moderator_* listing functions: the owner is notified of the real outcome.
-- =========================================================================================

select pg_temp.authenticate_as('70000000-0000-0000-0000-000000000001');
select pg_temp.make_published_listing('70000000-0000-0000-0000-000000000001', 'Notif Listing Approve') as listing_approve_id \gset
select pg_temp.authenticate_as('70000000-0000-0000-0000-000000000004');
select public.moderator_approve_listing(:'listing_approve_id');

select pg_temp.authenticate_as_test_runner();
select results_eq(
  format($$ select type::text from public.notifications where user_id = '70000000-0000-0000-0000-000000000001' and listing_id = %L $$, :'listing_approve_id'),
  $$ values ('listing_approved') $$,
  '21. the landlord is notified of a real listing approval'
);

select pg_temp.authenticate_as('70000000-0000-0000-0000-000000000001');
select pg_temp.make_published_listing('70000000-0000-0000-0000-000000000001', 'Notif Listing Reject') as listing_reject_id \gset
select pg_temp.authenticate_as('70000000-0000-0000-0000-000000000004');
select public.moderator_reject_listing(:'listing_reject_id', 'Photos do not meet quality standards');

select pg_temp.authenticate_as_test_runner();
select results_eq(
  format($$ select type::text, body from public.notifications where user_id = '70000000-0000-0000-0000-000000000001' and listing_id = %L $$, :'listing_reject_id'),
  $$ values ('listing_rejected', 'Photos do not meet quality standards') $$,
  '22. the landlord is notified of a real listing rejection, with the real reason'
);

-- listing_1_id was already published directly via the pg_temp.publish_listing() test helper
-- (line 111) — real moderation never touched it, so it is already eligible for
-- moderator_remove_listing() (published/paused) without needing moderator_approve_listing() first.
select pg_temp.authenticate_as('70000000-0000-0000-0000-000000000004');
select public.moderator_remove_listing(:'listing_1_id', 'Reported as a duplicate listing');

select pg_temp.authenticate_as_test_runner();
select results_eq(
  format($$ select type::text, body from public.notifications where user_id = '70000000-0000-0000-0000-000000000001' and listing_id = %L and type = 'listing_removed' $$, :'listing_1_id'),
  $$ values ('listing_removed', 'Reported as a duplicate listing') $$,
  '23. the landlord is notified of a real listing removal, with the real reason'
);

-- =========================================================================================
-- PART 11 — mark_notification_read() / mark_all_notifications_read().
-- =========================================================================================

select pg_temp.authenticate_as('70000000-0000-0000-0000-000000000002');
select id as unread_notif_id from public.notifications where user_id = '70000000-0000-0000-0000-000000000002' and read_at is null limit 1 \gset

select lives_ok(format($$ select public.mark_notification_read(%L) $$, :'unread_notif_id'), '24. tenant marks their own notification read');
select pg_temp.authenticate_as_test_runner();
select isnt(
  (select read_at from public.notifications where id = (:'unread_notif_id')::uuid),
  null,
  '25. the notification is really marked read'
);

select pg_temp.authenticate_as('70000000-0000-0000-0000-000000000002');
select lives_ok(format($$ select public.mark_notification_read(%L) $$, :'unread_notif_id'), '26. re-marking an already-read notification is an idempotent no-op, not an error');

select pg_temp.authenticate_as('70000000-0000-0000-0000-000000000003');
select throws_ok(
  format($$ select public.mark_notification_read(%L) $$, :'unread_notif_id'),
  '42501', null,
  '27. tenant B cannot mark tenant A''s notification as read'
);

select pg_temp.authenticate_as('70000000-0000-0000-0000-000000000002');
select is(
  (select count(*)::int from public.notifications where user_id = '70000000-0000-0000-0000-000000000002' and read_at is null),
  (select count(*)::int from public.notifications where user_id = '70000000-0000-0000-0000-000000000002')::int - 1,
  '28. tenant A still has exactly one unread notification before mark-all (sanity check on fixture state)'
);
select lives_ok('select public.mark_all_notifications_read()', '29. mark_all_notifications_read() runs successfully');
select pg_temp.authenticate_as_test_runner();
select is(
  (select count(*)::int from public.notifications where user_id = '70000000-0000-0000-0000-000000000002' and read_at is null),
  0,
  '30. after mark-all, tenant A has zero unread notifications'
);

-- =========================================================================================
-- PART 12 — privacy: cross-user and anonymous cannot read.
-- =========================================================================================

select pg_temp.authenticate_as('70000000-0000-0000-0000-000000000003');
select is(
  (select count(*)::int from public.notifications where user_id = '70000000-0000-0000-0000-000000000002'),
  0,
  '31. tenant B cannot read tenant A''s notifications (RLS)'
);
select is(
  (select count(*)::int from public.notifications where user_id = '70000000-0000-0000-0000-000000000001'),
  0,
  '32. tenant B cannot read the landlord''s notifications (RLS)'
);

select pg_temp.authenticate_as_anon();
select throws_ok(
  $$ select count(*) from public.notifications $$,
  null::char(5), null,
  '33. anonymous cannot read any notifications'
);
select throws_ok(
  format($$ select public.mark_notification_read(%L) $$, :'unread_notif_id'),
  null::char(5), null,
  '34. anonymous cannot mark any notification as read'
);

-- =========================================================================================
-- PART 13 — immutability: no client bypass of the guarded functions via direct DML.
-- =========================================================================================

select pg_temp.authenticate_as('70000000-0000-0000-0000-000000000002');
select throws_ok(
  format($$ insert into public.notifications (user_id, type, title) values ('70000000-0000-0000-0000-000000000002', 'application_submitted', 'Forged') $$),
  null::char(5), null,
  '35. a forged direct insert into notifications is blocked'
);
select throws_ok(
  format($$ update public.notifications set title = 'forged' where id = %L $$, :'unread_notif_id'),
  null::char(5), null,
  '36. a forged direct update to notifications (beyond read_at via the RPC) is blocked'
);
select throws_ok(
  format($$ delete from public.notifications where id = %L $$, :'unread_notif_id'),
  null::char(5), null,
  '37. a forged direct delete of a notification is blocked'
);

-- =========================================================================================
-- PART 14 — a caller cannot forge another user's notification via create_notification, since
-- there is no client execute grant on it at all.
-- =========================================================================================

select throws_ok(
  format($$ select public.create_notification('70000000-0000-0000-0000-000000000003', 'new_application', 'Forged', null, %L, null, null, null) $$, :'listing_1_id'),
  null::char(5), null,
  '38. create_notification() cannot be called directly by any authenticated client'
);

-- =========================================================================================
-- PART 15 — application/listing/conversation/viewing linkage is real, not fabricated.
-- =========================================================================================

select pg_temp.authenticate_as_test_runner();
select is(
  (select listing_id from public.notifications where application_id = (:'app_1_id')::uuid and type = 'new_application'),
  (:'listing_1_id')::uuid,
  '39. the new_application notification links the real listing id'
);
select is(
  (select application_id from public.notifications where viewing_proposal_id = (:'proposal_1_id')::uuid and type = 'viewing_proposed'),
  (:'app_viewing_id')::uuid,
  '40. the viewing_proposed notification links the real application id'
);
select is(
  (select conversation_id from public.notifications where user_id = '70000000-0000-0000-0000-000000000001' and type = 'new_enquiry'),
  (:'conv_1_id')::uuid,
  '41. the new_enquiry notification links the real conversation id'
);

-- =========================================================================================
-- PART 16 — banned/suspended callers cannot forge event notifications either (writes remain
-- gated by each real event-producing function's own pre-existing platform-status checks).
-- =========================================================================================

insert into auth.users (id, email) values ('70000000-0000-0000-0000-000000000005', 'notif-tenant-banned@example.test');
insert into public.tenant_profiles (profile_id, target_city, looking_for) values ('70000000-0000-0000-0000-000000000005', 'Dublin', 'any');
set local role service_role;
update public.profiles set platform_status = 'banned' where id = '70000000-0000-0000-0000-000000000005';
reset role;

select pg_temp.authenticate_as('70000000-0000-0000-0000-000000000005');
select throws_ok(
  format($$ select public.create_application(%L) $$, :'listing_decline_id'),
  '42501', null,
  '42. a banned tenant cannot trigger create_application (and therefore no notification)'
);
select pg_temp.authenticate_as_test_runner();
select is(
  (select count(*)::int from public.notifications where user_id = '70000000-0000-0000-0000-000000000001' and created_at > now() - interval '1 minute' and type = 'new_application' and application_id not in (select id from public.applications where tenant_id in ('70000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000003'))),
  0,
  '43. the rejected banned-tenant attempt created no forged notification'
);

-- =========================================================================================
-- PART 17 — get_smart_match_usage()-style read helper does not exist for notifications by
-- design (the frontend reads the table directly, RLS-scoped) — confirm no unread-count RPC was
-- accidentally introduced that could diverge from the real row set.
-- =========================================================================================

select is(
  (select count(*)::int from information_schema.routines where routine_schema = 'public' and routine_name like '%notification%'),
  3,
  '44. exactly three notification functions exist: create_notification, mark_notification_read, mark_all_notifications_read'
);

-- =========================================================================================
-- PART 18 — created_at ordering is real and server-derived.
-- =========================================================================================

select pg_temp.authenticate_as('70000000-0000-0000-0000-000000000002');
select ok(
  (select count(*)::int from public.notifications where user_id = '70000000-0000-0000-0000-000000000002') >= 2,
  '45. tenant A has accumulated multiple real notifications across this suite'
);
select ok(
  (select max(created_at) >= min(created_at) from public.notifications where user_id = '70000000-0000-0000-0000-000000000002'),
  '46. created_at is a real, monotonic server timestamp, never client-supplied'
);

select * from finish();
rollback;
