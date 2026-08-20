-- Gafflo backend — Stage H: real, server-authoritative notifications.
--
-- No client INSERT path exists at all, for anyone, ever — every notification is created
-- internally by create_notification(), called only from within the real event-producing
-- functions this migration hardens via CREATE OR REPLACE (create_application,
-- landlord_set_application_status, start_conversation, send_message, propose_viewing,
-- accept_viewing_slot, decline_viewing, cancel_viewing, moderator_approve_listing,
-- moderator_reject_listing, moderator_remove_listing) — no existing migration file's control
-- flow, validation, or authorization logic is changed, only additive `perform
-- public.create_notification(...)` calls at each function's already-proven success point.
--
-- Deliberately NOT wired: every real message after the first from either side (Messages.jsx's
-- own unread-inbox system already surfaces those — see part 5's own comment on why only a
-- conversation's first tenant message and first landlord message notify); withdraw_application()
-- (not in the task's requested event list); Smart Match Interested (a private, terminal,
-- landlord-invisible decision with no downstream "result" to notify about — see the Stage G
-- report); Saved Listings (no natural "something happened" event exists for a private bookmark).

-- =========================================================================================
-- 1. notification_type_t
-- =========================================================================================

create type public.notification_type_t as enum (
  'application_submitted',
  'application_status_changed',
  'new_application',
  'landlord_replied',
  'new_enquiry',
  'viewing_proposed',
  'viewing_confirmed',
  'viewing_declined',
  'viewing_cancelled',
  'listing_approved',
  'listing_rejected',
  'listing_removed'
);

-- =========================================================================================
-- 2. notifications
-- =========================================================================================
-- Every *_id column is nullable and populated only when relevant to that notification's type —
-- e.g. a listing_approved notification has listing_id but no application_id. None of the
-- referenced tables are ever hard-deleted in this schema (see every prior phase's own history-is-
-- permanent convention), so plain references need no ON DELETE behavior.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references public.profiles (id),
  type public.notification_type_t not null,
  title text not null,
  body text,

  listing_id uuid references public.listings (id),
  application_id uuid references public.applications (id),
  conversation_id uuid references public.conversations (id),
  viewing_proposal_id uuid references public.viewing_proposals (id),

  read_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.notifications is
  'Server-authoritative only — no client INSERT/UPDATE/DELETE grant exists at all. Every row is '
  'created internally by create_notification() (part 4), called only from within a real event-'
  'producing function''s own already-proven success path. read_at is the only ever-mutated '
  'column, and only via mark_notification_read()/mark_all_notifications_read() (part 5).';

-- =========================================================================================
-- 3. RLS / grants — strictly private to the owning user. No landlord/tenant counterpart policy
-- (unlike conversations/viewing_proposals): a notification is inherently one-sided.
-- =========================================================================================

alter table public.notifications enable row level security;

create policy notifications_select_own on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

-- No insert/update/delete policy for authenticated/anon: every write goes through the guarded
-- functions in parts 4-5.

grant select on public.notifications to authenticated;
-- No grant to anon at all, in any direction.

grant select, insert, update, delete on public.notifications to service_role;

revoke truncate, references, trigger on public.notifications from anon, authenticated;

-- =========================================================================================
-- 4. create_notification(...) — internal only, no client execute grant at all
-- =========================================================================================
-- Called from within other SECURITY DEFINER functions (so it needs no execute grant of its own —
-- an internal call runs as this function's owner regardless of the original caller's own grants),
-- exactly like cancel_viewing_for_terminal_application() in the Stage F migration. p_user_id is
-- always a real, already-resolved participant id (a listing owner, a conversation's other
-- participant, etc.) from the caller's own already-authorized row — never client input.

create function public.create_notification(
  p_user_id uuid,
  p_type public.notification_type_t,
  p_title text,
  p_body text default null,
  p_listing_id uuid default null,
  p_application_id uuid default null,
  p_conversation_id uuid default null,
  p_viewing_proposal_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into public.notifications (
    user_id, type, title, body, listing_id, application_id, conversation_id, viewing_proposal_id
  ) values (
    p_user_id, p_type, p_title, p_body, p_listing_id, p_application_id, p_conversation_id, p_viewing_proposal_id
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.create_notification(uuid, public.notification_type_t, text, text, uuid, uuid, uuid, uuid) from public;

-- =========================================================================================
-- 5. Client-facing read-state RPCs
-- =========================================================================================
-- mark_notification_read mirrors mark_conversation_read()'s exact "not found -> Not authorized"
-- contract from the Stage E migration, with one deliberate refinement: a caller's OWN
-- already-read notification must not raise that error on a harmless repeat call (unlike
-- last_read_at, read_at is not itself idempotently re-settable to "now" without losing the
-- original read timestamp, so an already-read row is excluded from the UPDATE's WHERE clause and
-- explicitly treated as a safe no-op, not "not found").

create function public.mark_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.notifications
  set read_at = now()
  where id = p_notification_id and user_id = auth.uid() and read_at is null;
  if not found then
    if exists (select 1 from public.notifications where id = p_notification_id and user_id = auth.uid()) then
      return;
    end if;
    raise exception 'Not authorized' using errcode = '42501';
  end if;
end;
$$;

create function public.mark_all_notifications_read()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null;
end;
$$;

revoke execute on function public.mark_notification_read(uuid) from public;
grant execute on function public.mark_notification_read(uuid) to authenticated;

revoke execute on function public.mark_all_notifications_read() from public;
grant execute on function public.mark_all_notifications_read() to authenticated;

-- =========================================================================================
-- 6. Harden create_application() — notify both the tenant (receipt) and the landlord (new lead)
-- =========================================================================================
-- Every line above the two new perform calls is byte-for-byte identical to the Stage D
-- migration's original create_application() — only the notification calls are new, added right
-- before the function's own pre-existing return.

create or replace function public.create_application(p_listing_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant public.tenant_profiles;
  v_listing public.listings;
  v_owner_status public.platform_status_t;
  v_fit jsonb;
  v_snapshot jsonb;
  v_application_id uuid;
begin
  if not public.is_caller_active() then
    raise exception 'Account is not active' using errcode = '42501';
  end if;

  select * into v_tenant from public.tenant_profiles where profile_id = auth.uid();
  if not found then
    raise exception 'A tenant profile is required to apply';
  end if;

  select * into v_listing from public.listings where id = p_listing_id;
  if not found then
    raise exception 'Listing not found';
  end if;

  if v_listing.status <> 'published' then
    raise exception 'This listing is not currently open for applications';
  end if;

  if v_listing.owner_id = auth.uid() then
    raise exception 'You cannot apply to your own listing' using errcode = '42501';
  end if;

  select platform_status into v_owner_status from public.profiles where id = v_listing.owner_id;
  if v_owner_status <> 'active' then
    raise exception 'This listing is not currently accepting applications';
  end if;

  v_fit := public.calculate_rental_fit(v_tenant, v_listing);

  v_snapshot := jsonb_build_object(
    'display_name', (select display_name from public.profiles where id = auth.uid()),
    'target_city', v_tenant.target_city,
    'preferred_areas', to_jsonb(v_tenant.preferred_areas),
    'budget_min', v_tenant.budget_min,
    'budget_max', v_tenant.budget_max,
    'move_in_date', v_tenant.move_in_date,
    'lease_length_months', v_tenant.lease_length_months,
    'household_size', v_tenant.household_size,
    'applying_as_couple', v_tenant.applying_as_couple,
    'looking_for', v_tenant.looking_for,
    'employment_status', v_tenant.employment_status,
    'student', v_tenant.student,
    'pets', v_tenant.pets,
    'smoking', v_tenant.smoking,
    'furnished_preference', v_tenant.furnished_preference,
    'parking_needed', v_tenant.parking_needed,
    'private_bathroom_preferred', v_tenant.private_bathroom_preferred,
    'bills_included_preferred', v_tenant.bills_included_preferred,
    'owner_occupied_acceptable', v_tenant.owner_occupied_acceptable,
    'references_ready', v_tenant.references_ready,
    'income_ready', v_tenant.income_ready,
    'id_ready', v_tenant.id_ready,
    'bio', v_tenant.bio
  );

  begin
    insert into public.applications (
      listing_id, tenant_id, status, tenant_snapshot,
      rental_fit_score, rental_fit_breakdown, rental_fit_algorithm_version
    ) values (
      p_listing_id, auth.uid(), 'sent', v_snapshot,
      (v_fit ->> 'score')::smallint, v_fit - 'score', 'v1'
    )
    returning id into v_application_id;
  exception when unique_violation then
    raise exception 'You have already applied to this listing' using errcode = '23505';
  end;

  insert into public.application_status_events (application_id, from_status, to_status, actor_id)
  values (v_application_id, null, 'sent', auth.uid());

  perform public.create_notification(
    auth.uid(), 'application_submitted', 'Application sent',
    'Your application has been sent to the listing owner.',
    p_listing_id, v_application_id, null, null
  );
  perform public.create_notification(
    v_listing.owner_id, 'new_application', 'New application received',
    null, p_listing_id, v_application_id, null, null
  );

  return v_application_id;
end;
$$;

-- =========================================================================================
-- 7. Harden landlord_set_application_status() — notify the tenant of the real new status
-- =========================================================================================

create or replace function public.landlord_set_application_status(p_application_id uuid, p_new_status public.application_status_t)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_app public.applications;
begin
  if p_new_status not in ('landlord_interested', 'shortlisted', 'not_selected', 'closed') then
    raise exception 'Not a valid landlord decision status';
  end if;

  select a.* into v_app
  from public.applications a
  join public.listings l on l.id = a.listing_id
  where a.id = p_application_id and l.owner_id = auth.uid();
  if not found then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if v_app.status in ('withdrawn', 'not_selected', 'closed') then
    raise exception 'This application has already reached a terminal state';
  end if;

  if v_app.status in ('viewing_proposed', 'viewing_confirmed') and p_new_status not in ('not_selected', 'closed') then
    raise exception 'Use cancel_viewing() to move a viewing-stage application back to shortlisted' using errcode = '42501';
  end if;

  if p_new_status in ('landlord_interested', 'shortlisted') and not public.is_caller_active() then
    raise exception 'Account is not active' using errcode = '42501';
  end if;
  if p_new_status in ('not_selected', 'closed') and public.is_caller_banned() then
    raise exception 'Account is not active' using errcode = '42501';
  end if;

  if v_app.status = p_new_status then
    return;
  end if;

  update public.applications set status = p_new_status where id = p_application_id;
  insert into public.application_status_events (application_id, from_status, to_status, actor_id)
  values (p_application_id, v_app.status, p_new_status, auth.uid());

  perform public.create_notification(
    v_app.tenant_id, 'application_status_changed', 'Application status updated',
    'Your application status changed to ' || p_new_status::text || '.',
    v_app.listing_id, p_application_id, null, null
  );

  if p_new_status in ('not_selected', 'closed') then
    perform public.cancel_viewing_for_terminal_application(p_application_id);
  end if;
end;
$$;

-- =========================================================================================
-- 8. Harden start_conversation() — notify the landlord of a genuinely new enquiry only (never
-- on the duplicate-reuse path, which returns before reaching the new code below)
-- =========================================================================================

create or replace function public.start_conversation(
  p_listing_id uuid,
  p_initial_message text,
  p_client_message_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_listing public.listings;
  v_owner_status public.platform_status_t;
  v_clean_body text;
  v_conversation_id uuid;
  v_existing_id uuid;
begin
  if not public.is_caller_active() then
    raise exception 'Account is not active' using errcode = '42501';
  end if;

  if not exists (select 1 from public.tenant_profiles where profile_id = auth.uid()) then
    raise exception 'A tenant profile is required to start a conversation';
  end if;

  select * into v_listing from public.listings where id = p_listing_id;
  if not found then
    raise exception 'Listing not found';
  end if;

  if v_listing.status <> 'published' then
    raise exception 'This listing is not currently open for enquiries';
  end if;

  if v_listing.owner_id = auth.uid() then
    raise exception 'You cannot start a conversation about your own listing' using errcode = '42501';
  end if;

  select platform_status into v_owner_status from public.profiles where id = v_listing.owner_id;
  if v_owner_status <> 'active' then
    raise exception 'This listing is not currently accepting enquiries';
  end if;

  v_clean_body := trim(regexp_replace(coalesce(p_initial_message, ''), '\s+', ' ', 'g'));
  if length(v_clean_body) = 0 then
    raise exception 'Message cannot be empty';
  end if;
  if length(v_clean_body) > 1200 then
    raise exception 'Message is too long (maximum 1200 characters)';
  end if;

  begin
    insert into public.conversations (listing_id, tenant_id, landlord_id, last_message_at)
    values (p_listing_id, auth.uid(), v_listing.owner_id, now())
    returning id into v_conversation_id;
  exception when unique_violation then
    select id into v_existing_id from public.conversations
    where listing_id = p_listing_id and tenant_id = auth.uid();
    return v_existing_id;
  end;

  insert into public.conversation_participant_state (conversation_id, user_id) values
    (v_conversation_id, auth.uid()),
    (v_conversation_id, v_listing.owner_id);

  insert into public.messages (conversation_id, sender_id, body, client_message_id)
  values (v_conversation_id, auth.uid(), v_clean_body, p_client_message_id);

  perform public.create_notification(
    v_listing.owner_id, 'new_enquiry', 'New enquiry',
    null, p_listing_id, null, v_conversation_id, null
  );

  return v_conversation_id;
end;
$$;

-- =========================================================================================
-- 9. Harden send_message() — notify only on the FIRST message from either side in a
-- conversation (the anti-spam-unlock moment for a landlord reply, the "genuinely new activity"
-- moment for a tenant message); every subsequent message is deliberately left unnotified —
-- Messages.jsx's own real, per-participant unread-inbox state (Stage E) already surfaces those,
-- and notifying on every single message would both spam and duplicate that existing system.
-- v_landlord_has_replied is now computed unconditionally (the original only computed it inside
-- the tenant branch) so both directions can use it — this is the only structural change to the
-- function; every other line is unchanged from the Stage E migration.
-- =========================================================================================

create or replace function public.send_message(
  p_conversation_id uuid,
  p_body text,
  p_client_message_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_conv public.conversations;
  v_is_tenant boolean;
  v_tenant_status public.platform_status_t;
  v_landlord_status public.platform_status_t;
  v_clean_body text;
  v_existing_id uuid;
  v_landlord_has_replied boolean;
  v_tenant_message_count integer;
  v_new_id uuid;
begin
  select * into v_conv from public.conversations
  where id = p_conversation_id and (tenant_id = auth.uid() or landlord_id = auth.uid())
  for update;
  if not found then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if p_client_message_id is not null then
    select id into v_existing_id from public.messages
    where conversation_id = p_conversation_id and client_message_id = p_client_message_id;
    if found then
      return v_existing_id;
    end if;
  end if;

  select platform_status into v_tenant_status from public.profiles where id = v_conv.tenant_id;
  select platform_status into v_landlord_status from public.profiles where id = v_conv.landlord_id;
  if v_tenant_status <> 'active' or v_landlord_status <> 'active' then
    raise exception 'Messaging is not currently available in this conversation' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.blocks
    where (blocker_id = v_conv.tenant_id and blocked_id = v_conv.landlord_id)
       or (blocker_id = v_conv.landlord_id and blocked_id = v_conv.tenant_id)
  ) then
    raise exception 'Messaging is not currently available in this conversation' using errcode = '42501';
  end if;

  v_clean_body := trim(regexp_replace(coalesce(p_body, ''), '\s+', ' ', 'g'));
  if length(v_clean_body) = 0 then
    raise exception 'Message cannot be empty';
  end if;
  if length(v_clean_body) > 1200 then
    raise exception 'Message is too long (maximum 1200 characters)';
  end if;

  v_is_tenant := (v_conv.tenant_id = auth.uid());

  select exists(
    select 1 from public.messages
    where conversation_id = p_conversation_id and sender_id = v_conv.landlord_id
  ) into v_landlord_has_replied;

  if v_is_tenant then
    if not v_landlord_has_replied then
      select count(*) into v_tenant_message_count from public.messages
      where conversation_id = p_conversation_id and sender_id = v_conv.tenant_id;
      if v_tenant_message_count >= 1 then
        raise exception 'You have already sent a message — wait for the landlord to reply before sending another' using errcode = '42501';
      end if;
    end if;
  end if;

  insert into public.messages (conversation_id, sender_id, body, client_message_id)
  values (p_conversation_id, auth.uid(), v_clean_body, p_client_message_id)
  returning id into v_new_id;

  update public.conversations set last_message_at = now() where id = p_conversation_id;

  -- Clear the RECIPIENT's archived_at (never the sender's) so a new message makes the
  -- conversation visible again to whoever it just arrived for.
  update public.conversation_participant_state
  set archived_at = null
  where conversation_id = p_conversation_id
    and user_id = case when v_is_tenant then v_conv.landlord_id else v_conv.tenant_id end
    and archived_at is not null;

  if not v_is_tenant and not v_landlord_has_replied then
    perform public.create_notification(
      v_conv.tenant_id, 'landlord_replied', 'Landlord replied',
      null, v_conv.listing_id, null, p_conversation_id, null
    );
  end if;

  return v_new_id;
end;
$$;

-- =========================================================================================
-- 10. Harden propose_viewing() — notify the tenant of the real proposal
-- =========================================================================================

create or replace function public.propose_viewing(p_application_id uuid, p_slots jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_app public.applications;
  v_listing public.listings;
  v_tenant_status public.platform_status_t;
  v_proposal_id uuid;
  v_slot_count integer;
  v_slot jsonb;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_seen_starts timestamptz[] := '{}';
begin
  if not public.is_caller_active() then
    raise exception 'Account is not active' using errcode = '42501';
  end if;

  select a.* into v_app
  from public.applications a
  join public.listings l on l.id = a.listing_id
  where a.id = p_application_id and l.owner_id = auth.uid();
  if not found then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if v_app.status <> 'shortlisted' then
    raise exception 'A viewing can only be proposed for a shortlisted application (current status: %)', v_app.status;
  end if;

  select * into v_listing from public.listings where id = v_app.listing_id;
  if v_listing.status not in ('published', 'paused') then
    raise exception 'This listing is not currently in a state that accepts new viewing proposals';
  end if;

  select platform_status into v_tenant_status from public.profiles where id = v_app.tenant_id;
  if v_tenant_status <> 'active' then
    raise exception 'This applicant is not currently able to receive a viewing proposal' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.blocks
    where (blocker_id = auth.uid() and blocked_id = v_app.tenant_id)
       or (blocker_id = v_app.tenant_id and blocked_id = auth.uid())
  ) then
    raise exception 'A new viewing cannot be proposed for this application' using errcode = '42501';
  end if;

  v_slot_count := coalesce(jsonb_array_length(p_slots), 0);
  if v_slot_count = 0 then
    raise exception 'Propose at least one viewing time';
  end if;
  if v_slot_count > 3 then
    raise exception 'Propose at most 3 viewing times';
  end if;

  for v_slot in select * from jsonb_array_elements(p_slots) loop
    v_starts_at := (v_slot ->> 'starts_at')::timestamptz;
    v_ends_at := (v_slot ->> 'ends_at')::timestamptz;
    if v_starts_at is null or v_ends_at is null then
      raise exception 'Each viewing slot needs a valid starts_at and ends_at';
    end if;
    if v_ends_at <= v_starts_at then
      raise exception 'Each viewing slot''s end time must be after its start time';
    end if;
    if v_starts_at <= now() then
      raise exception 'Viewing times must be in the future';
    end if;
    if v_starts_at = any(v_seen_starts) then
      raise exception 'Duplicate viewing slot times are not allowed';
    end if;
    v_seen_starts := array_append(v_seen_starts, v_starts_at);
  end loop;

  begin
    insert into public.viewing_proposals (application_id, landlord_id, tenant_id)
    values (p_application_id, auth.uid(), v_app.tenant_id)
    returning id into v_proposal_id;
  exception when unique_violation then
    raise exception 'This application already has an open viewing proposal' using errcode = '23505';
  end;

  for v_slot in select * from jsonb_array_elements(p_slots) loop
    insert into public.viewing_slots (proposal_id, starts_at, ends_at)
    values (v_proposal_id, (v_slot ->> 'starts_at')::timestamptz, (v_slot ->> 'ends_at')::timestamptz);
  end loop;

  update public.applications set status = 'viewing_proposed' where id = p_application_id;
  insert into public.application_status_events (application_id, from_status, to_status, actor_id)
  values (p_application_id, 'shortlisted', 'viewing_proposed', auth.uid());

  perform public.create_notification(
    v_app.tenant_id, 'viewing_proposed', 'Viewing proposed',
    null, v_app.listing_id, p_application_id, null, v_proposal_id
  );

  return v_proposal_id;
end;
$$;

-- =========================================================================================
-- 11. Harden accept_viewing_slot() — notify the landlord only on the real (non-idempotent-
-- retry) confirmation
-- =========================================================================================

create or replace function public.accept_viewing_slot(p_proposal_id uuid, p_slot_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_proposal public.viewing_proposals;
  v_slot public.viewing_slots;
  v_listing_status public.listing_status_t;
  v_tenant_status public.platform_status_t;
  v_landlord_status public.platform_status_t;
  v_listing_id uuid;
begin
  select * into v_proposal from public.viewing_proposals
  where id = p_proposal_id and tenant_id = auth.uid()
  for update;
  if not found then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  -- Idempotent retry: the same tenant confirming the same already-confirmed slot again is a
  -- safe no-op, not an error and not a duplicate event.
  if v_proposal.status = 'confirmed' and v_proposal.confirmed_slot_id = p_slot_id then
    return;
  end if;
  if v_proposal.status = 'confirmed' then
    raise exception 'This viewing is already confirmed for a different time' using errcode = '42501';
  end if;
  if v_proposal.status <> 'pending' then
    raise exception 'This viewing proposal is no longer open';
  end if;

  if not public.is_caller_active() then
    raise exception 'Account is not active' using errcode = '42501';
  end if;

  select * into v_slot from public.viewing_slots
  where id = p_slot_id and proposal_id = p_proposal_id;
  if not found then
    raise exception 'That time is not one of the proposed slots for this viewing';
  end if;
  if v_slot.starts_at <= now() then
    raise exception 'That viewing time has already passed';
  end if;

  select platform_status into v_tenant_status from public.profiles where id = v_proposal.tenant_id;
  select platform_status into v_landlord_status from public.profiles where id = v_proposal.landlord_id;
  if v_tenant_status <> 'active' or v_landlord_status <> 'active' then
    raise exception 'This viewing cannot be confirmed right now' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.blocks
    where (blocker_id = v_proposal.tenant_id and blocked_id = v_proposal.landlord_id)
       or (blocker_id = v_proposal.landlord_id and blocked_id = v_proposal.tenant_id)
  ) then
    raise exception 'This viewing cannot be confirmed right now' using errcode = '42501';
  end if;

  select l.status, l.id into v_listing_status, v_listing_id
  from public.applications a join public.listings l on l.id = a.listing_id
  where a.id = v_proposal.application_id;
  if v_listing_status not in ('published', 'paused') then
    raise exception 'This listing is no longer in a state that accepts viewing confirmations';
  end if;

  update public.viewing_proposals
  set status = 'confirmed', confirmed_slot_id = p_slot_id, responded_at = now()
  where id = p_proposal_id;

  update public.applications set status = 'viewing_confirmed'
  where id = v_proposal.application_id and status = 'viewing_proposed';

  if found then
    insert into public.application_status_events (application_id, from_status, to_status, actor_id)
    values (v_proposal.application_id, 'viewing_proposed', 'viewing_confirmed', auth.uid());
  end if;

  perform public.create_notification(
    v_proposal.landlord_id, 'viewing_confirmed', 'Viewing confirmed',
    null, v_listing_id, v_proposal.application_id, null, p_proposal_id
  );
end;
$$;

-- =========================================================================================
-- 12. Harden decline_viewing() — notify the landlord only on the real (non-idempotent-retry)
-- decline
-- =========================================================================================

create or replace function public.decline_viewing(p_proposal_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_proposal public.viewing_proposals;
  v_listing_id uuid;
begin
  select * into v_proposal from public.viewing_proposals
  where id = p_proposal_id and tenant_id = auth.uid()
  for update;
  if not found then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  -- Declining reduces exposure/interaction, so a suspended (not banned) tenant may still do
  -- this — the same Phase 1D/2/3 boundary already applied to withdraw_application() and
  -- cancel_viewing() below.
  if public.is_caller_banned() then
    raise exception 'Account is not active' using errcode = '42501';
  end if;

  if v_proposal.status = 'declined' then
    return;
  end if;
  if v_proposal.status <> 'pending' then
    raise exception 'This viewing proposal is no longer open';
  end if;

  update public.viewing_proposals set status = 'declined', responded_at = now() where id = p_proposal_id;

  update public.applications set status = 'shortlisted'
  where id = v_proposal.application_id and status = 'viewing_proposed';

  if found then
    insert into public.application_status_events (application_id, from_status, to_status, actor_id)
    values (v_proposal.application_id, 'viewing_proposed', 'shortlisted', auth.uid());
  end if;

  select listing_id into v_listing_id from public.applications where id = v_proposal.application_id;

  perform public.create_notification(
    v_proposal.landlord_id, 'viewing_declined', 'Viewing declined',
    null, v_listing_id, v_proposal.application_id, null, p_proposal_id
  );
end;
$$;

-- =========================================================================================
-- 13. Harden cancel_viewing() — notify whichever participant did NOT initiate the cancellation
-- =========================================================================================

create or replace function public.cancel_viewing(p_proposal_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_proposal public.viewing_proposals;
  v_app_status public.application_status_t;
  v_listing_id uuid;
  v_recipient_id uuid;
begin
  select * into v_proposal from public.viewing_proposals
  where id = p_proposal_id and (tenant_id = auth.uid() or landlord_id = auth.uid())
  for update;
  if not found then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if public.is_caller_banned() then
    raise exception 'Account is not active' using errcode = '42501';
  end if;

  if v_proposal.status = 'cancelled' then
    return;
  end if;
  if v_proposal.status not in ('pending', 'confirmed') then
    raise exception 'This viewing proposal cannot be cancelled from its current state';
  end if;

  update public.viewing_proposals set status = 'cancelled', cancelled_at = now() where id = p_proposal_id;

  -- Captured before the applications UPDATE below specifically so the audit event's
  -- from_status reflects the application's own real prior state (viewing_proposed or
  -- viewing_confirmed — the two are NOT interchangeable and NOT the same enum type as
  -- viewing_proposals.status, which is viewing_proposal_status_t, not application_status_t).
  select status into v_app_status from public.applications where id = v_proposal.application_id;

  -- Only resurface shortlisted if the application is still genuinely in a viewing stage — never
  -- resurrect a terminal application (withdrawn/not_selected/closed) that moved on for an
  -- unrelated reason after this viewing was created.
  update public.applications set status = 'shortlisted'
  where id = v_proposal.application_id and status in ('viewing_proposed', 'viewing_confirmed');

  if found then
    insert into public.application_status_events (application_id, from_status, to_status, actor_id)
    values (v_proposal.application_id, v_app_status, 'shortlisted', auth.uid());
  end if;

  select listing_id into v_listing_id from public.applications where id = v_proposal.application_id;
  v_recipient_id := case when auth.uid() = v_proposal.tenant_id then v_proposal.landlord_id else v_proposal.tenant_id end;

  perform public.create_notification(
    v_recipient_id, 'viewing_cancelled', 'Viewing cancelled',
    null, v_listing_id, v_proposal.application_id, null, p_proposal_id
  );
end;
$$;

-- =========================================================================================
-- 14. Harden moderator_approve_listing() / moderator_reject_listing() /
-- moderator_remove_listing() — notify the listing owner of the real moderation outcome
-- =========================================================================================

create or replace function public.moderator_approve_listing(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner_id uuid;
begin
  if not public.is_caller_moderator() then
    raise exception 'Not authorized: moderator role required' using errcode = '42501';
  end if;
  update public.listings set status = 'published', published_at = now(), rejection_reason = null
  where id = p_listing_id and status = 'pending_verification'
  returning owner_id into v_owner_id;
  if not found then
    raise exception 'Listing must be pending_verification to approve';
  end if;
  insert into public.moderation_actions (actor_id, action_type, listing_id)
  values (auth.uid(), 'listing_approved', p_listing_id);

  perform public.create_notification(
    v_owner_id, 'listing_approved', 'Listing approved',
    'Your listing is now live.', p_listing_id, null, null, null
  );
end;
$$;

create or replace function public.moderator_reject_listing(p_listing_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner_id uuid;
begin
  if not public.is_caller_moderator() then
    raise exception 'Not authorized: moderator role required' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A rejection reason is required';
  end if;
  update public.listings set status = 'rejected', rejection_reason = p_reason
  where id = p_listing_id and status = 'pending_verification'
  returning owner_id into v_owner_id;
  if not found then
    raise exception 'Listing must be pending_verification to reject';
  end if;
  insert into public.moderation_actions (actor_id, action_type, listing_id, reason)
  values (auth.uid(), 'listing_rejected', p_listing_id, p_reason);

  perform public.create_notification(
    v_owner_id, 'listing_rejected', 'Listing rejected',
    p_reason, p_listing_id, null, null, null
  );
end;
$$;

create or replace function public.moderator_remove_listing(p_listing_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner_id uuid;
begin
  if not public.is_caller_moderator() then
    raise exception 'Not authorized: moderator role required' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A removal reason is required';
  end if;
  update public.listings set status = 'removed_by_platform', removed_by_platform_at = now(), removed_reason = p_reason
  where id = p_listing_id and status in ('published', 'paused')
  returning owner_id into v_owner_id;
  if not found then
    raise exception 'Listing must be published or paused to remove';
  end if;
  insert into public.moderation_actions (actor_id, action_type, listing_id, reason)
  values (auth.uid(), 'listing_removed', p_listing_id, p_reason);

  perform public.create_notification(
    v_owner_id, 'listing_removed', 'Listing removed',
    p_reason, p_listing_id, null, null, null
  );
end;
$$;
