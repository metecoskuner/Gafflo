-- Gafflo backend — Phase 4: viewing scheduling (proposal -> accept/decline/cancel).
--
-- Scope: viewing_proposals, viewing_slots, and the guarded functions that create/transition
-- them, plus narrow, additive hardening of two Phase 2 functions (landlord_set_application_status,
-- withdraw_application) via CREATE OR REPLACE — the Phase 2 migration file itself is never
-- touched. No calendars, notifications, recurring availability, or realtime — those are later
-- phases or explicitly out of scope.
--
-- Frontend parity note (see the Phase 4 report for the full inspection): the current frozen
-- frontend mock (src/config/applicationTransitions.js) allows proposing a viewing directly from
-- sent/viewed/landlord interested, not only shortlisted, and also has a distinct application-
-- level "viewing cancelled" status the real application_status_t enum does not have (cancellation
-- lives on viewing_proposals.status here, and the application reverts to shortlisted). Phase 4's
-- task explicitly overrides the first point (shortlisted-only) and the second is structurally
-- impossible to replicate (no such enum value exists) — both are deliberate, documented
-- divergences from the mock, not oversights.

-- =========================================================================================
-- 1. Enumerated types
-- =========================================================================================

create type public.viewing_proposal_status_t as enum ('pending', 'confirmed', 'declined', 'cancelled');

-- =========================================================================================
-- 2. viewing_proposals
-- =========================================================================================
-- landlord_id/tenant_id are denormalized from the application/listing at creation time —
-- immutable afterward (no client UPDATE grant exists at all) — so RLS can check participancy
-- directly on this table without a multi-hop join through applications -> listings on every
-- read, mirroring conversations' own landlord_id/tenant_id design in Phase 3.
--
-- confirmed_slot_id's FK to viewing_slots is added after part 3 creates that table, to avoid a
-- circular table dependency within this same migration.

create table public.viewing_proposals (
  id uuid primary key default gen_random_uuid(),

  application_id uuid not null references public.applications (id),
  landlord_id uuid not null references public.profiles (id),
  tenant_id uuid not null references public.profiles (id),

  status public.viewing_proposal_status_t not null default 'pending',
  confirmed_slot_id uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz,
  cancelled_at timestamptz,

  constraint viewing_proposals_tenant_not_landlord check (tenant_id <> landlord_id)
);

-- The authoritative "at most one open proposal per application" guarantee — a partial unique
-- index, not an application-level pre-check. Concurrent propose_viewing() calls for the same
-- application race on this index directly; see the Phase 4 report for the real concurrent test.
create unique index viewing_proposals_one_open_per_application
  on public.viewing_proposals (application_id)
  where status in ('pending', 'confirmed');

comment on table public.viewing_proposals is
  'History is permanent — declined/cancelled proposals are never deleted or mutated back to '
  'pending; a new attempt after decline/cancel is always a new row. No client INSERT/UPDATE/'
  'DELETE grant exists at all; every write goes through the guarded functions in part 6.';

-- =========================================================================================
-- 3. viewing_slots
-- =========================================================================================
-- "starts_at must be in the future" is deliberately NOT a table CHECK constraint: that rule is
-- about the moment a slot is *proposed*, not an eternal invariant the row must keep satisfying
-- as real time passes (a slot proposed for tomorrow is correctly still a valid historical row
-- once tomorrow has come and gone) — so it is enforced once, inside propose_viewing(), where a
-- precise error message is also possible.

create table public.viewing_slots (
  id uuid primary key default gen_random_uuid(),

  proposal_id uuid not null references public.viewing_proposals (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,

  created_at timestamptz not null default now(),

  constraint viewing_slots_ends_after_starts check (ends_at > starts_at),
  constraint viewing_slots_unique_start_per_proposal unique (proposal_id, starts_at)
);

comment on table public.viewing_slots is
  'Immutable — no client UPDATE/DELETE grant exists at all. Deliberately no "is this slot still '
  'in the future" CHECK either, for the same reason as starts_at above: a slot legitimately '
  'ages past its own start time as a permanent historical record.';

alter table public.viewing_proposals
  add constraint viewing_proposals_confirmed_slot_id_fkey
  foreign key (confirmed_slot_id) references public.viewing_slots (id);

-- =========================================================================================
-- 4. RLS
-- =========================================================================================
-- No moderator read policy on either table, matching Phase 2/3's established least-privilege
-- precedent — a moderation/support feature that genuinely needs viewing visibility is a future,
-- separate, narrowly-scoped decision, not an automatic consequence of the moderator role.

alter table public.viewing_proposals enable row level security;
alter table public.viewing_slots enable row level security;

create policy viewing_proposals_select_participant on public.viewing_proposals
  for select to authenticated
  using (tenant_id = auth.uid() or landlord_id = auth.uid());

create policy viewing_slots_select_participant on public.viewing_slots
  for select to authenticated
  using (exists (
    select 1 from public.viewing_proposals vp
    where vp.id = viewing_slots.proposal_id
      and (vp.tenant_id = auth.uid() or vp.landlord_id = auth.uid())
  ));

-- No insert/update/delete policy on either table for authenticated/anon: every write goes
-- through the SECURITY DEFINER functions in part 6.

-- =========================================================================================
-- 5. Grants
-- =========================================================================================
-- Same two real-platform lessons applied up front, as every migration since Phase 1C: an
-- explicit service_role grant (BYPASSRLS is not a substitute for SQL privileges), and revoking
-- the default-privilege baseline's TRUNCATE/REFERENCES/TRIGGER on anon/authenticated up front
-- rather than discovering the gap later.

grant select on public.viewing_proposals to authenticated;
grant select on public.viewing_slots to authenticated;
-- No insert/update/delete grant to authenticated or anon on either table. No grant to anon at
-- all, in any direction.

grant select, insert, update, delete on public.viewing_proposals to service_role;
grant select, insert, update, delete on public.viewing_slots to service_role;

revoke truncate, references, trigger on public.viewing_proposals from anon, authenticated;
revoke truncate, references, trigger on public.viewing_slots from anon, authenticated;

create trigger viewing_proposals_set_updated_at
  before update on public.viewing_proposals
  for each row
  execute function public.set_updated_at();

-- =========================================================================================
-- 6. propose_viewing(application_id, slots) — landlord-only, shortlisted-only
-- =========================================================================================
-- p_slots is jsonb: an array of {"starts_at": "...", "ends_at": "..."} objects, 1 to 3 of them
-- (MAX_VIEWING_PROPOSALS in the frozen frontend's src/config/viewingSlots.js — matched exactly,
-- not chosen independently). Every value the client could try to forge (landlord_id, tenant_id,
-- application status, proposal status, timestamps) is derived server-side; the only client
-- input is which application and which candidate times.

create function public.propose_viewing(p_application_id uuid, p_slots jsonb)
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

  return v_proposal_id;
end;
$$;

comment on function public.propose_viewing(uuid, jsonb) is
  'The only INSERT path for viewing_proposals/viewing_slots. On a genuine concurrent race for '
  'the same application (proven in the Phase 4 report), the losing call fails cleanly with '
  '23505 rather than silently merging into the winner''s proposal — unlike start_conversation''s '
  'duplicate handling, a viewing proposal carries new slot data that cannot be safely discarded '
  'without telling the caller.';

-- =========================================================================================
-- 7. accept_viewing_slot(proposal_id, slot_id) — tenant-only
-- =========================================================================================
-- `for update` locks the target proposal before the check-then-update sequence, exactly like
-- Phase 3's send_message() anti-spam lock — necessary here because "confirm exactly one slot"
-- is not expressible as a simple unique constraint the way "one open proposal" was: it is an
-- UPDATE racing another UPDATE on the same not-yet-committed row, not two INSERTs racing an
-- index. Proven under real concurrency in the Phase 4 report.

create function public.accept_viewing_slot(p_proposal_id uuid, p_slot_id uuid)
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

  select l.status into v_listing_status
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
end;
$$;

-- =========================================================================================
-- 8. decline_viewing(proposal_id) — tenant-only, active or suspended (not banned)
-- =========================================================================================

create function public.decline_viewing(p_proposal_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_proposal public.viewing_proposals;
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
end;
$$;

-- =========================================================================================
-- 9. cancel_viewing(proposal_id) — either participant, active or suspended (not banned)
-- =========================================================================================
-- Deliberately does not require the counterpart to be active: cancellation only ever reduces
-- an existing interaction, so an active participant must still be able to cancel even when the
-- other side is suspended or banned (the reverse of propose/accept, which both require both
-- participants active because they *create* new interaction).

create function public.cancel_viewing(p_proposal_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_proposal public.viewing_proposals;
  v_app_status public.application_status_t;
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
end;
$$;

-- =========================================================================================
-- 10. cancel_viewing_for_terminal_application(application_id) — internal only, no client grant
-- =========================================================================================
-- Called from within withdraw_application() and landlord_set_application_status() (both
-- SECURITY DEFINER, so this needs no execute grant of its own — an internal call runs as this
-- function's owner regardless of the original caller's own grants). A no-op when there is no
-- open viewing, which is the common case. Never inserts into application_status_events: the
-- application's own terminal transition already has its own event from the caller.

create function public.cancel_viewing_for_terminal_application(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.viewing_proposals
  set status = 'cancelled', cancelled_at = now()
  where application_id = p_application_id and status in ('pending', 'confirmed');
end;
$$;

-- =========================================================================================
-- 11. Harden landlord_set_application_status() — viewing states are terminal-only exits here
-- =========================================================================================
-- Phase 2 already made it structurally impossible to *enter* viewing_proposed/viewing_confirmed
-- through this function (they were never in the allowed-target allowlist). What Phase 2 missed:
-- an application already IN a viewing stage could still be moved to landlord_interested or
-- shortlisted directly through this same function, silently bypassing cancel_viewing() and
-- leaving an orphaned pending/confirmed proposal attached to an application that no longer
-- reflects it. Fixed by adding one guard: from a viewing stage, this function now only accepts
-- not_selected/closed as a target (cancel_viewing() is the only path for a non-terminal
-- reversal back to shortlisted) — and when it does close one out, the active viewing is
-- cancelled atomically in the same call, via the same internal helper withdraw_application()
-- uses below.

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

  if p_new_status in ('not_selected', 'closed') then
    perform public.cancel_viewing_for_terminal_application(p_application_id);
  end if;
end;
$$;

-- =========================================================================================
-- 12. Harden withdraw_application() — cancel any open viewing when the application withdraws
-- =========================================================================================
-- Authorization/status logic is unchanged from Phase 2 (withdrawal from viewing_proposed/
-- viewing_confirmed was already allowed — only withdrawn/not_selected/closed were ever
-- terminal-blocked) — the only addition is the same viewing-cleanup call used above.

create or replace function public.withdraw_application(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_app public.applications;
begin
  select * into v_app from public.applications
  where id = p_application_id and tenant_id = auth.uid();
  if not found then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if public.is_caller_banned() then
    raise exception 'Account is not active' using errcode = '42501';
  end if;

  if v_app.status in ('withdrawn', 'not_selected', 'closed') then
    raise exception 'This application has already reached a terminal state';
  end if;

  update public.applications set status = 'withdrawn' where id = p_application_id;
  insert into public.application_status_events (application_id, from_status, to_status, actor_id)
  values (p_application_id, v_app.status, 'withdrawn', auth.uid());

  perform public.cancel_viewing_for_terminal_application(p_application_id);
end;
$$;

-- =========================================================================================
-- 13. Explicit function-level execute grants — allowlist, not the default PUBLIC grant
-- =========================================================================================

revoke execute on function public.propose_viewing(uuid, jsonb) from public;
grant execute on function public.propose_viewing(uuid, jsonb) to authenticated;

revoke execute on function public.accept_viewing_slot(uuid, uuid) from public;
grant execute on function public.accept_viewing_slot(uuid, uuid) to authenticated;

revoke execute on function public.decline_viewing(uuid) from public;
grant execute on function public.decline_viewing(uuid) to authenticated;

revoke execute on function public.cancel_viewing(uuid) from public;
grant execute on function public.cancel_viewing(uuid) to authenticated;

-- cancel_viewing_for_terminal_application is internal-only: no grant to anon or authenticated.
revoke execute on function public.cancel_viewing_for_terminal_application(uuid) from public;
