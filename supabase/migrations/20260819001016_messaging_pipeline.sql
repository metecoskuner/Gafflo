-- Gafflo backend — Phase 3: private tenant <-> landlord conversations and messages.
--
-- Scope: conversations, conversation_participant_state, messages, blocks, and the guarded
-- functions that create/transition them. No viewings, notifications, attachments, edits,
-- deletes, or realtime infrastructure — those are later phases. Additive only: nothing here
-- touches a table, policy, or function defined by the Phase 1A-2 migrations except by adding
-- new grants/policies alongside them.
--
-- Frontend parity note (see the Phase 3 report for the full inspection): the current frozen
-- frontend mock (src/context/MarketplaceState.jsx, src/utils/messagingRules.js) unlocks a
-- tenant's second message on EITHER a landlord-authored message OR certain application/enquiry
-- status values (isLandlordEngagedStatus: landlord interested/shortlisted/viewing
-- proposed/confirmed). Phase 3's task explicitly overrides this: only a real landlord-authored
-- message unlocks further tenant messages here — status changes never do. This is a deliberate,
-- intentional divergence from the current mock, not an oversight.

-- =========================================================================================
-- 1. conversations
-- =========================================================================================
-- application_id is deliberately NOT stored here. (listing_id, tenant_id) already uniquely
-- correlates a conversation to at most one application via applications' own
-- applications_one_per_tenant_listing unique constraint (Phase 2) — a stored FK would be
-- redundant, could never be authoritative per this phase''s own instructions, and is exactly
-- the kind of hidden coupling between messaging and applications the task explicitly warns
-- against. Any future UI needing application context for a conversation can query
-- public.applications directly by (listing_id, tenant_id).
--
-- last_message_id is also omitted: last_message_at alone is enough for inbox sort/ordering,
-- and a message_id FK would add an ordering hazard during start_conversation''s atomic
-- conversation+message creation for no real benefit over `order by created_at desc limit 1`
-- when the actual latest message is needed.

create table public.conversations (
  id uuid primary key default gen_random_uuid(),

  listing_id uuid not null references public.listings (id),
  tenant_id uuid not null references public.profiles (id),
  landlord_id uuid not null references public.profiles (id),

  last_message_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint conversations_one_per_listing_tenant unique (listing_id, tenant_id),
  constraint conversations_tenant_not_landlord check (tenant_id <> landlord_id)
);

comment on table public.conversations is
  'At most one row per (listing_id, tenant_id) ever — the unique constraint is the sole '
  'authoritative duplicate-conversation guard under concurrency (see start_conversation()). No '
  'client INSERT/UPDATE/DELETE grant exists at all; every write goes through the guarded '
  'functions in part 6.';

create function public.set_updated_at_and_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at_and_touch() is
  'Same behavior as Phase 1A''s set_updated_at(), reused by name-collision-avoidance: this '
  'migration intentionally does not redeclare or alter public.set_updated_at() itself.';

create trigger conversations_set_updated_at
  before update on public.conversations
  for each row
  execute function public.set_updated_at_and_touch();

-- =========================================================================================
-- 2. conversation_participant_state — one row per real participant, independent archive/mute/
--    read state. last_read_message_id is deliberately omitted in favor of last_read_at:
--    "unread" is derivable as `exists(select 1 from messages where conversation_id = X and
--    created_at > last_read_at)`, which is simple and sufficient without an extra FK to track.
-- =========================================================================================

create table public.conversation_participant_state (
  conversation_id uuid not null references public.conversations (id),
  user_id uuid not null references public.profiles (id),

  archived_at timestamptz,
  muted boolean not null default false,
  last_read_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (conversation_id, user_id)
);

comment on table public.conversation_participant_state is
  'Exactly two rows per conversation (tenant + landlord), created atomically by '
  'start_conversation(). No table CHECK can enforce "user_id is one of this conversation''s two '
  'participants" (CHECK cannot reference another table) — that invariant is enforced '
  'procedurally: this table has zero client INSERT/UPDATE/DELETE grant, and every guarded '
  'writer function scopes its own effect to `user_id = auth.uid()` and an existing row.';

create trigger conversation_participant_state_set_updated_at
  before update on public.conversation_participant_state
  for each row
  execute function public.set_updated_at_and_touch();

-- =========================================================================================
-- 3. messages — immutable, text-only, no attachments/edits/deletes.
-- =========================================================================================
-- client_message_id: nullable, client-supplied, scoped unique per (conversation_id,
-- client_message_id) — NULLs are not compared equal by a unique constraint, so this is opt-in
-- per call. It exists specifically to make retrying an ambiguous/timed-out send_message() call
-- safe: a retry with the same client_message_id returns the already-created message''s id
-- instead of creating a real duplicate or (worse) being misread as the tenant''s disallowed
-- "second unsolicited message." It never influences sender/conversation ownership — those are
-- always server-derived from auth.uid() and the target conversation row.
--
-- 1200-character cap matches the existing frontend composer''s own maxLength (src/pages/
-- Messages.jsx) and sanitizeMessageBody()''s .slice(0, 1200) — same ceiling, enforced here by
-- rejecting instead of silently truncating, since silently rewriting content is explicitly
-- disallowed for this phase.

create table public.messages (
  id uuid primary key default gen_random_uuid(),

  conversation_id uuid not null references public.conversations (id),
  sender_id uuid not null references public.profiles (id),
  body text not null,

  client_message_id uuid,

  created_at timestamptz not null default now(),

  constraint messages_body_not_blank check (length(body) > 0),
  constraint messages_body_max_length check (length(body) <= 1200),
  constraint messages_unique_client_message_id unique (conversation_id, client_message_id)
);

comment on table public.messages is
  'Immutable history — no client UPDATE/DELETE grant exists at all, and none is planned; a '
  'future legal/moderation deletion mechanism, if ever needed, is a separate, audited feature.';

-- =========================================================================================
-- 4. blocks — directional record, bidirectional messaging effect (enforced inside
--    send_message(), not by a table constraint, since "effect" and "record" are different
--    things here).
-- =========================================================================================

create table public.blocks (
  blocker_id uuid not null references public.profiles (id),
  blocked_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),

  primary key (blocker_id, blocked_id),
  constraint blocks_no_self_block check (blocker_id <> blocked_id)
);

comment on table public.blocks is
  'A blocks B is a directional row, but send_message() checks both directions, so the '
  'messaging effect is two-way regardless of who blocked whom. RLS only ever lets a caller '
  'read rows where they are the blocker (part 5) — the blocked party has no query surface that '
  'reveals "user X blocked you."';

-- =========================================================================================
-- 5. RLS
-- =========================================================================================
-- No moderator read policy anywhere in this migration, deliberately: being a moderator does
-- not imply a right to browse private conversations/messages, matching Phase 2''s applications
-- precedent and this phase''s own explicit least-privilege instruction.

alter table public.conversations enable row level security;
alter table public.conversation_participant_state enable row level security;
alter table public.messages enable row level security;
alter table public.blocks enable row level security;

create policy conversations_select_participant on public.conversations
  for select to authenticated
  using (tenant_id = auth.uid() or landlord_id = auth.uid());

create policy conversation_participant_state_select_own on public.conversation_participant_state
  for select to authenticated
  using (user_id = auth.uid());

create policy messages_select_participant on public.messages
  for select to authenticated
  using (exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and (c.tenant_id = auth.uid() or c.landlord_id = auth.uid())
  ));

create policy blocks_select_own on public.blocks
  for select to authenticated
  using (blocker_id = auth.uid());

-- No insert/update/delete policy on any of the four tables for authenticated/anon: every write
-- goes through the SECURITY DEFINER functions in part 6.

-- =========================================================================================
-- 6. Grants
-- =========================================================================================
-- Same two real-platform lessons applied up front as Phase 2: service_role needs its own
-- explicit grant (BYPASSRLS is not a substitute for SQL privileges), and this project''s
-- default-privilege baseline silently hands anon/authenticated TRUNCATE/REFERENCES/TRIGGER on
-- every new table, revoked here rather than discovered later.

grant select on public.conversations to authenticated;
grant select on public.conversation_participant_state to authenticated;
grant select on public.messages to authenticated;
grant select on public.blocks to authenticated;
-- No insert/update/delete grant to authenticated or anon on any of the four tables. No grant
-- to anon at all, in any direction — anonymous has zero access to any messaging surface.

grant select, insert, update, delete on public.conversations to service_role;
grant select, insert, update, delete on public.conversation_participant_state to service_role;
grant select, insert, update, delete on public.messages to service_role;
grant select, insert, update, delete on public.blocks to service_role;

revoke truncate, references, trigger on public.conversations from anon, authenticated;
revoke truncate, references, trigger on public.conversation_participant_state from anon, authenticated;
revoke truncate, references, trigger on public.messages from anon, authenticated;
revoke truncate, references, trigger on public.blocks from anon, authenticated;

-- =========================================================================================
-- 7. start_conversation(listing_id, initial_message, client_message_id)
-- =========================================================================================
-- The only INSERT path for conversations. tenant_id/landlord_id/status/timestamps are all
-- server-derived; the only client input is the listing to enquire about and the message body.
--
-- Duplicate/concurrency behavior (see the Phase 3 report for the real concurrent test): this
-- NEVER does a "check then insert" — it always attempts the INSERT directly and catches
-- unique_violation, making conversations_one_per_listing_tenant the sole authoritative guard.
-- On a duplicate (including a genuine concurrent race), it returns the EXISTING conversation''s
-- id and does NOT attempt to insert another message — the chosen one of the two acceptable
-- outcomes this phase''s spec allows, picked for simplicity: a retried/duplicate call never has
-- side effects beyond returning what already exists.

create function public.start_conversation(
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

  return v_conversation_id;
end;
$$;

comment on function public.start_conversation(uuid, text, uuid) is
  'The only INSERT path for conversations. Rejects: inactive caller, no tenant_profiles row, '
  'missing/non-published listing, own listing, listing owned by a non-active landlord. On a '
  'duplicate (including a real concurrent race, proven in the Phase 3 report) returns the '
  'existing conversation id without creating a second message.';

-- =========================================================================================
-- 8. send_message(conversation_id, body, client_message_id)
-- =========================================================================================
-- Anti-spam race safety: `select ... for update` takes an exclusive row lock on the target
-- conversation before the count-then-insert anti-spam check runs, serializing every concurrent
-- send_message() call for the SAME conversation into a strict one-at-a-time queue for the
-- duration of each call''s transaction — not just "Postgres transactions should handle it," an
-- explicit, deliberate lock chosen specifically because the task asked for a real, reasoned
-- mechanism rather than a bare count-then-insert. Proven under real concurrency in the Phase 3
-- report.
--
-- "Both participants active" (not just the sender) is checked explicitly per this phase''s own
-- instruction: a suspended/banned participant must not keep receiving new marketplace
-- interaction they cannot respond to, even from an active counterpart.

create function public.send_message(
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
  if v_is_tenant then
    select exists(
      select 1 from public.messages
      where conversation_id = p_conversation_id and sender_id = v_conv.landlord_id
    ) into v_landlord_has_replied;

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

  return v_new_id;
end;
$$;

comment on function public.send_message(uuid, text, uuid) is
  'The only INSERT path for messages after the first. sender_id is always auth.uid(). The '
  'anti-spam rule ("landlord engagement" = a real landlord-authored message, never a status '
  'change) and the both-participants-active rule are both enforced here, race-safe via the '
  'row-level lock taken above.';

-- =========================================================================================
-- 9. mark_conversation_read / set_conversation_archived / set_conversation_muted
-- =========================================================================================
-- All three only ever touch the caller's own participant-state row. No platform_status gate on
-- archive/mute: both are explicitly allowed for suspended AND banned callers per this phase''s
-- spec (they reduce/control interaction and create no new marketplace exposure) — the same
-- reasoning already applied to listings'' pause/withdraw actions in Phase 1D/2.

create function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.conversation_participant_state
  set last_read_at = now()
  where conversation_id = p_conversation_id and user_id = auth.uid();
  if not found then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
end;
$$;

create function public.set_conversation_archived(p_conversation_id uuid, p_archived boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.conversation_participant_state
  set archived_at = case when p_archived then coalesce(archived_at, now()) else null end
  where conversation_id = p_conversation_id and user_id = auth.uid();
  if not found then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
end;
$$;

create function public.set_conversation_muted(p_conversation_id uuid, p_muted boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.conversation_participant_state
  set muted = p_muted
  where conversation_id = p_conversation_id and user_id = auth.uid();
  if not found then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
end;
$$;

-- =========================================================================================
-- 10. block_user / unblock_user
-- =========================================================================================
-- No platform_status gate here either: "may block/unblock for safety" is explicitly listed as
-- a retained capability for suspended AND banned accounts in this phase''s spec. Idempotent
-- both ways (on conflict do nothing / delete matching zero rows silently) rather than erroring
-- on a repeat call.

create function public.block_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user_id = auth.uid() then
    raise exception 'Cannot block yourself';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'User not found';
  end if;

  insert into public.blocks (blocker_id, blocked_id) values (auth.uid(), p_user_id)
  on conflict (blocker_id, blocked_id) do nothing;
end;
$$;

create function public.unblock_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.blocks where blocker_id = auth.uid() and blocked_id = p_user_id;
end;
$$;

-- =========================================================================================
-- 11. Explicit function-level execute grants — allowlist, not the default PUBLIC grant
-- =========================================================================================

revoke execute on function public.start_conversation(uuid, text, uuid) from public;
grant execute on function public.start_conversation(uuid, text, uuid) to authenticated;

revoke execute on function public.send_message(uuid, text, uuid) from public;
grant execute on function public.send_message(uuid, text, uuid) to authenticated;

revoke execute on function public.mark_conversation_read(uuid) from public;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

revoke execute on function public.set_conversation_archived(uuid, boolean) from public;
grant execute on function public.set_conversation_archived(uuid, boolean) to authenticated;

revoke execute on function public.set_conversation_muted(uuid, boolean) from public;
grant execute on function public.set_conversation_muted(uuid, boolean) to authenticated;

revoke execute on function public.block_user(uuid) from public;
grant execute on function public.block_user(uuid) to authenticated;

revoke execute on function public.unblock_user(uuid) from public;
grant execute on function public.unblock_user(uuid) to authenticated;
