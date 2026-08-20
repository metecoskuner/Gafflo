-- Gafflo backend — Stage G: server-authoritative Saved Listings + Smart Match decisions/usage.
-- The first post-core migration: replaces local-only persistence (gafflo.saved-properties,
-- gafflo.smart-match-activity, and every client-side daily-usage/plan concept) with real,
-- guarded backend state. No entitlement/subscription table exists yet (see the Stage G report),
-- so the daily quotas enforced here are the single current production limit (30 Smart Match /
-- 10 Interested per day) — never a client-supplied plan/limit. Additive only, on top of every
-- prior phase; no existing migration file is touched.

-- =========================================================================================
-- 1. Enumerated types
-- =========================================================================================

create type public.smart_match_decision_t as enum ('pass', 'interested');

-- =========================================================================================
-- 2. saved_listings — a private tenant bookmark. Independent of Smart Match decisions (a
-- listing may be saved, decisioned, both, or neither, in any combination — see the Stage G
-- report). Never implies application, landlord visibility, or messaging.
-- =========================================================================================

create table public.saved_listings (
  id uuid primary key default gen_random_uuid(),

  tenant_id uuid not null references public.profiles (id),
  listing_id uuid not null references public.listings (id),

  created_at timestamptz not null default now(),

  constraint saved_listings_unique_tenant_listing unique (tenant_id, listing_id)
);

comment on table public.saved_listings is
  'Private, tenant-only bookmark. No client INSERT/UPDATE/DELETE grant exists at all — every '
  'write goes through set_listing_saved() in part 6. A row surviving a listing''s later status '
  'change (paused/rented/removed) is expected and preserved, not an anomaly — see part 6''s '
  'own comment on why unsave never re-validates listing status.';

-- =========================================================================================
-- 3. smart_match_decisions — one canonical, immutable decision per tenant+listing.
-- =========================================================================================

create table public.smart_match_decisions (
  id uuid primary key default gen_random_uuid(),

  tenant_id uuid not null references public.profiles (id),
  listing_id uuid not null references public.listings (id),
  decision public.smart_match_decision_t not null,

  decided_at timestamptz not null default now(),

  constraint smart_match_decisions_unique_tenant_listing unique (tenant_id, listing_id)
);

comment on table public.smart_match_decisions is
  'Permanent Smart Match history — Stage G deliberately builds no resurfacing/expiration/undo '
  '(see the Stage G report). No client INSERT/UPDATE/DELETE grant exists at all; every write '
  'goes through record_smart_match_decision() in part 6, which never mutates an existing row — '
  'the unique constraint above is the real (not just advisory) one-decision-per-listing '
  'guarantee under concurrency, exactly like viewing_proposals_one_open_per_application in the '
  'Stage F migration.';

-- =========================================================================================
-- 4. smart_match_daily_usage — one row per tenant per Dublin-local day.
-- =========================================================================================

create table public.smart_match_daily_usage (
  id uuid primary key default gen_random_uuid(),

  tenant_id uuid not null references public.profiles (id),
  usage_date date not null,
  smart_match_count integer not null default 0,
  interested_count integer not null default 0,

  updated_at timestamptz not null default now(),

  constraint smart_match_daily_usage_unique_tenant_date unique (tenant_id, usage_date),
  constraint smart_match_daily_usage_counts_nonnegative check (smart_match_count >= 0 and interested_count >= 0),
  -- Every Interested decision also counts as a Smart Match decision (see part 6) — this is the
  -- real, structural expression of that rule, not just a convention the RPC has to remember.
  constraint smart_match_daily_usage_interested_within_smart_match check (interested_count <= smart_match_count)
);

comment on table public.smart_match_daily_usage is
  'usage_date is always derived server-side from Europe/Dublin local time (see part 5) — no '
  'client-supplied date is ever trusted. No client INSERT/UPDATE/DELETE grant exists at all; '
  'every write goes through record_smart_match_decision() in part 6, which locks this row '
  '(via INSERT ... ON CONFLICT DO UPDATE) before checking limits, making it the real '
  'concurrency boundary for the whole daily-quota guarantee — see that function''s own comment.';

-- =========================================================================================
-- 5. RLS — strictly private to the owning tenant. No landlord-visible policy exists on any of
-- these three tables at all (unlike conversations/viewing_proposals, which have a real
-- landlord-participant side) — Saved/Smart Match has no landlord side by product design.
-- =========================================================================================

alter table public.saved_listings enable row level security;
alter table public.smart_match_decisions enable row level security;
alter table public.smart_match_daily_usage enable row level security;

create policy saved_listings_select_own on public.saved_listings
  for select to authenticated
  using (tenant_id = auth.uid());

create policy smart_match_decisions_select_own on public.smart_match_decisions
  for select to authenticated
  using (tenant_id = auth.uid());

create policy smart_match_daily_usage_select_own on public.smart_match_daily_usage
  for select to authenticated
  using (tenant_id = auth.uid());

-- No insert/update/delete policy on any of the three for authenticated/anon: every write goes
-- through the guarded functions in part 6.

-- =========================================================================================
-- 6. Grants
-- =========================================================================================

grant select on public.saved_listings to authenticated;
grant select on public.smart_match_decisions to authenticated;
grant select on public.smart_match_daily_usage to authenticated;
-- No grant to anon at all, in any direction, on any of the three.

grant select, insert, update, delete on public.saved_listings to service_role;
grant select, insert, update, delete on public.smart_match_decisions to service_role;
grant select, insert, update, delete on public.smart_match_daily_usage to service_role;

revoke truncate, references, trigger on public.saved_listings from anon, authenticated;
revoke truncate, references, trigger on public.smart_match_decisions from anon, authenticated;
revoke truncate, references, trigger on public.smart_match_daily_usage from anon, authenticated;

-- =========================================================================================
-- 7. set_listing_saved(listing_id, saved) — toggle a private bookmark
-- =========================================================================================
-- Banned-gated only (not full is_caller_active()): saving/unsaving touches nobody else's world
-- at all (no landlord-visible policy exists on this table), matching the Stage E precedent for
-- mute/archive — "manage your own private state" — rather than create_application()'s stricter
-- active-only gate for genuinely *creating a new interaction*. Eligibility (published, not your
-- own listing) is checked ONLY when saving: unsaving is always allowed regardless of the
-- listing's current status, since removing your own bookmark must never be blocked by the
-- listing having since changed — see part 2's own comment on why a save row outliving a status
-- change is expected, not an anomaly.

create function public.set_listing_saved(p_listing_id uuid, p_saved boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_listing public.listings;
begin
  if public.is_caller_banned() then
    raise exception 'Account is not active' using errcode = '42501';
  end if;

  if not exists (select 1 from public.tenant_profiles where profile_id = auth.uid()) then
    raise exception 'A tenant profile is required to save listings';
  end if;

  if p_saved then
    select * into v_listing from public.listings where id = p_listing_id;
    if not found then
      raise exception 'Listing not found';
    end if;
    if v_listing.owner_id = auth.uid() then
      raise exception 'You cannot save your own listing' using errcode = '42501';
    end if;
    if v_listing.status <> 'published' then
      raise exception 'This listing is not currently available to save';
    end if;

    insert into public.saved_listings (tenant_id, listing_id)
    values (auth.uid(), p_listing_id)
    on conflict (tenant_id, listing_id) do nothing;
  else
    delete from public.saved_listings where tenant_id = auth.uid() and listing_id = p_listing_id;
  end if;
end;
$$;

comment on function public.set_listing_saved(uuid, boolean) is
  'The only write path for saved_listings. Idempotent both directions: saving an already-saved '
  'listing and unsaving an already-absent one are both safe no-ops, not errors.';

-- =========================================================================================
-- 8. record_smart_match_decision(listing_id, decision) — the only write path for both
-- smart_match_decisions AND smart_match_daily_usage; the real atomic quota boundary.
-- =========================================================================================
-- Lock ordering is deliberate: the tenant's own usage row for today is locked FIRST (via
-- INSERT ... ON CONFLICT DO UPDATE, which takes a real row lock even though the update itself
-- is a no-op), *before* checking for an existing decision on this listing. This serializes
-- every concurrent decision attempt by this tenant today behind one lock, regardless of which
-- listing each attempt targets — which is exactly the right boundary, since the thing being
-- protected (a daily count) is itself scoped per tenant+day, not per listing. This is what
-- makes a same-listing double-submit safe (the second call sees the first's committed decision
-- once it acquires the lock, not before) as well as the cross-listing "last slot" race (two
-- different listings' decisions still contend for the same lock). See the Stage G report for
-- the real concurrency test.

create function public.record_smart_match_decision(p_listing_id uuid, p_decision public.smart_match_decision_t)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_listing public.listings;
  v_usage_date date := (timezone('Europe/Dublin', now()))::date;
  v_usage public.smart_match_daily_usage;
  v_existing public.smart_match_decisions;
begin
  if not public.is_caller_active() then
    raise exception 'Account is not active' using errcode = '42501';
  end if;

  if not exists (select 1 from public.tenant_profiles where profile_id = auth.uid()) then
    raise exception 'A tenant profile is required for Smart Match';
  end if;

  select * into v_listing from public.listings where id = p_listing_id;
  if not found then
    raise exception 'Listing not found';
  end if;
  if v_listing.owner_id = auth.uid() then
    raise exception 'You cannot Smart Match your own listing' using errcode = '42501';
  end if;
  if v_listing.status <> 'published' then
    raise exception 'This listing is not currently available for Smart Match';
  end if;

  -- Lock (creating if missing) today's usage row for this tenant before touching anything else.
  insert into public.smart_match_daily_usage (tenant_id, usage_date)
  values (auth.uid(), v_usage_date)
  on conflict (tenant_id, usage_date) do update set updated_at = public.smart_match_daily_usage.updated_at
  returning * into v_usage;

  -- Idempotency / conflict handling — now safe to check, since any concurrent attempt on this
  -- same listing is guaranteed to be serialized behind the lock just acquired above.
  select * into v_existing from public.smart_match_decisions
  where tenant_id = auth.uid() and listing_id = p_listing_id;

  if found then
    if v_existing.decision = p_decision then
      -- A genuine retry (double click, network resend, second tab) of the same decision: return
      -- the already-recorded state, no usage change.
      return jsonb_build_object(
        'decision', v_existing.decision,
        'smartMatchCount', v_usage.smart_match_count,
        'interestedCount', v_usage.interested_count
      );
    end if;
    raise exception 'You have already made a different Smart Match decision for this listing' using errcode = '42501';
  end if;

  if v_usage.smart_match_count >= 30 then
    raise exception 'You have reached today''s Smart Match limit' using errcode = '42501';
  end if;
  if p_decision = 'interested' and v_usage.interested_count >= 10 then
    raise exception 'You have reached today''s Interested limit' using errcode = '42501';
  end if;

  insert into public.smart_match_decisions (tenant_id, listing_id, decision)
  values (auth.uid(), p_listing_id, p_decision);

  update public.smart_match_daily_usage
  set smart_match_count = smart_match_count + 1,
      interested_count = interested_count + (case when p_decision = 'interested' then 1 else 0 end)
  where tenant_id = auth.uid() and usage_date = v_usage_date
  returning * into v_usage;

  return jsonb_build_object(
    'decision', p_decision,
    'smartMatchCount', v_usage.smart_match_count,
    'interestedCount', v_usage.interested_count
  );
end;
$$;

comment on function public.record_smart_match_decision(uuid, public.smart_match_decision_t) is
  'The only write path for smart_match_decisions and smart_match_daily_usage. Never mutates an '
  'existing decision to the opposite value — Stage G decisions are immutable by design (see the '
  'Stage G report); a caller that wants to change their mind gets a clear conflict error, not a '
  'silent overwrite. p_decision is a real enum, not client-suppliable text.';

-- =========================================================================================
-- 9. get_smart_match_usage() — authoritative today's counts, Dublin day derived server-side
-- =========================================================================================
-- Ungated by platform_status on purpose: reading one's own historical usage is a pure read of
-- the caller's own row, matching the "reads are less restricted than writes" precedent already
-- established for conversations/viewing_proposals in Phase 3/4. Always returns exactly one row
-- (zeros if no usage yet today) so the frontend never has to special-case "no row exists yet".

create function public.get_smart_match_usage()
returns table (usage_date date, smart_match_count integer, interested_count integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_usage_date date := (timezone('Europe/Dublin', now()))::date;
begin
  return query
    select v_usage_date, coalesce(u.smart_match_count, 0), coalesce(u.interested_count, 0)
    from (select 1) as one_row
    left join public.smart_match_daily_usage u
      on u.tenant_id = auth.uid() and u.usage_date = v_usage_date;
end;
$$;

comment on function public.get_smart_match_usage() is
  'Read-only convenience wrapper so the frontend never computes "today" itself for quota '
  'display — the Europe/Dublin usage day is always derived here, server-side, exactly like '
  'record_smart_match_decision() derives it for writes.';

-- =========================================================================================
-- 10. Explicit function-level execute grants — allowlist, not the default PUBLIC grant
-- =========================================================================================

revoke execute on function public.set_listing_saved(uuid, boolean) from public;
grant execute on function public.set_listing_saved(uuid, boolean) to authenticated;

revoke execute on function public.record_smart_match_decision(uuid, public.smart_match_decision_t) from public;
grant execute on function public.record_smart_match_decision(uuid, public.smart_match_decision_t) to authenticated;

revoke execute on function public.get_smart_match_usage() from public;
grant execute on function public.get_smart_match_usage() to authenticated;
