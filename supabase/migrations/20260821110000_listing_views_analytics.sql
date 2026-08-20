-- Gafflo backend — Stage I: lifetime unique listing views + landlord analytics.
--
-- Product rule: a listing view is a lifetime unique authenticated profile viewing a listing,
-- not a raw page open. This migration deliberately does NOT expose viewer identities to
-- landlords and does NOT notify anyone. Smart Match Interested remains private and is not part
-- of landlord analytics, directly or indirectly.

-- =========================================================================================
-- 1. listing_views — one lifetime row per listing+viewer profile
-- =========================================================================================

create table public.listing_views (
  id uuid primary key default gen_random_uuid(),

  listing_id uuid not null references public.listings (id),
  viewer_id uuid not null references public.profiles (id),

  first_viewed_at timestamptz not null default now(),

  constraint listing_views_unique_listing_viewer unique (listing_id, viewer_id)
);

comment on table public.listing_views is
  'Lifetime unique authenticated listing views. One profile viewing one listing creates at '
  'most one row forever, even across a listing pause/republish cycle because listings are '
  'single mutable rows throughout Gafflo. No client SELECT/INSERT/UPDATE/DELETE grant exists; '
  'record_listing_view() is the only write path and landlord analytics RPCs expose aggregate '
  'counts only, never viewer identities.';

comment on column public.listing_views.first_viewed_at is
  'Kept even though the MVP UI only shows lifetime totals, so future recency-based aggregate '
  'metrics can be derived without changing the core lifetime view fact.';

-- saved_listings is tenant-led by design, so its unique constraint leads with tenant_id.
-- Landlord analytics reads by listing_id; this narrow index avoids turning save counts into
-- a tenant-ordered scan once the marketplace has real volume.
create index saved_listings_listing_id_idx on public.saved_listings (listing_id);

-- =========================================================================================
-- 2. RLS / grants — no raw listing_views exposure to client roles
-- =========================================================================================

alter table public.listing_views enable row level security;

-- No SELECT policy and no client grant: a landlord can see aggregate counts through the
-- SECURITY DEFINER RPCs below, but never which profile ids viewed a listing. Tenants have no
-- "my view history" surface in this MVP either.

revoke select, insert, update, delete on public.listing_views from anon, authenticated;
grant select, insert, update, delete on public.listing_views to service_role;
revoke truncate, references, trigger on public.listing_views from anon, authenticated;

-- =========================================================================================
-- 3. record_listing_view(listing_id) — passive, idempotent, no-op for ineligible cases
-- =========================================================================================
-- This RPC is intentionally quiet:
--   * anonymous cannot execute at all and also hits the explicit auth.uid() guard;
--   * banned callers are a no-op, not an error;
--   * suspended callers are allowed, because this is passive analytics, not new marketplace
--     contact;
--   * own-listing views are no-op;
--   * only listings that are published at call time can receive a new view;
--   * duplicate/retry/multi-tab races collapse on listing_views_unique_listing_viewer.

create function public.record_listing_view(p_listing_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_listing public.listings;
  v_inserted boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if public.is_caller_banned() then
    return false;
  end if;

  select * into v_listing from public.listings where id = p_listing_id;
  if not found then
    return false;
  end if;

  if v_listing.status <> 'published' then
    return false;
  end if;

  if v_listing.owner_id = auth.uid() then
    return false;
  end if;

  insert into public.listing_views (listing_id, viewer_id)
  values (p_listing_id, auth.uid())
  on conflict (listing_id, viewer_id) do nothing
  returning true into v_inserted;

  return coalesce(v_inserted, false);
end;
$$;

comment on function public.record_listing_view(uuid) is
  'The only write path for listing_views. Returns true only when a new lifetime unique view row '
  'was inserted; returns false for duplicates, owner self-views, banned callers, missing or '
  'non-published listings. It never creates notifications, applications, conversations, saved '
  'listings or Smart Match decisions.';

-- =========================================================================================
-- 4. get_listing_analytics(listing_id) — one owned listing, aggregate only
-- =========================================================================================

create function public.get_listing_analytics(p_listing_id uuid)
returns table (
  listing_id uuid,
  unique_views integer,
  saves integer,
  applications integer,
  enquiries integer,
  confirmed_viewings integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.listings l
    where l.id = p_listing_id and l.owner_id = auth.uid()
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
    select
      p_listing_id,
      (select count(*)::int from public.listing_views lv where lv.listing_id = p_listing_id),
      (select count(*)::int from public.saved_listings sl where sl.listing_id = p_listing_id),
      (select count(*)::int from public.applications a where a.listing_id = p_listing_id),
      (select count(*)::int from public.conversations c where c.listing_id = p_listing_id),
      (
        select count(*)::int
        from public.viewing_proposals vp
        join public.applications a on a.id = vp.application_id
        where a.listing_id = p_listing_id and vp.status = 'confirmed'
      );
end;
$$;

comment on function public.get_listing_analytics(uuid) is
  'Aggregate-only landlord analytics for one owned listing. It intentionally excludes '
  'smart_match_decisions, and it never exposes listing_views.viewer_id or tenant identity.';

-- =========================================================================================
-- 5. get_my_listing_analytics() — aggregate rows for every listing owned by the caller
-- =========================================================================================

create function public.get_my_listing_analytics()
returns table (
  listing_id uuid,
  unique_views integer,
  saves integer,
  applications integer,
  enquiries integer,
  confirmed_viewings integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
    select
      l.id,
      coalesce(v.unique_views, 0)::int,
      coalesce(s.saves, 0)::int,
      coalesce(a.applications, 0)::int,
      coalesce(c.enquiries, 0)::int,
      coalesce(vp.confirmed_viewings, 0)::int
    from public.listings l
    left join (
      select lv.listing_id, count(*)::int as unique_views
      from public.listing_views lv
      group by lv.listing_id
    ) v on v.listing_id = l.id
    left join (
      select sl.listing_id, count(*)::int as saves
      from public.saved_listings sl
      group by sl.listing_id
    ) s on s.listing_id = l.id
    left join (
      select app.listing_id, count(*)::int as applications
      from public.applications app
      group by app.listing_id
    ) a on a.listing_id = l.id
    left join (
      select conv.listing_id, count(*)::int as enquiries
      from public.conversations conv
      group by conv.listing_id
    ) c on c.listing_id = l.id
    left join (
      select a.listing_id, count(*)::int as confirmed_viewings
      from public.viewing_proposals vp
      join public.applications a on a.id = vp.application_id
      where vp.status = 'confirmed'
      group by a.listing_id
    ) vp on vp.listing_id = l.id
    where l.owner_id = auth.uid();
end;
$$;

comment on function public.get_my_listing_analytics() is
  'Aggregate-only landlord analytics for every listing owned by the caller. Returns zero-filled '
  'rows for listings with no engagement, excludes Smart Match Interested, and exposes no raw '
  'viewer/application/conversation/viewing identities beyond counts.';

-- =========================================================================================
-- 6. Explicit function-level execute grants — allowlist, never default PUBLIC
-- =========================================================================================

revoke execute on function public.record_listing_view(uuid) from public;
grant execute on function public.record_listing_view(uuid) to authenticated;

revoke execute on function public.get_listing_analytics(uuid) from public;
grant execute on function public.get_listing_analytics(uuid) to authenticated;

revoke execute on function public.get_my_listing_analytics() from public;
grant execute on function public.get_my_listing_analytics() to authenticated;
