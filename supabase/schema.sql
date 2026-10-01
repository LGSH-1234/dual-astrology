-- This application's objects are separate from the project's other apps.
create table public.dual_astrology_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null check (jsonb_typeof(state) = 'object' and octet_length(state::text) <= 1048576),
  updated_at timestamptz not null default now()
);
alter table public.dual_astrology_states enable row level security;
revoke all on public.dual_astrology_states from anon, authenticated;
grant select, insert, update, delete on public.dual_astrology_states to authenticated;
grant all on public.dual_astrology_states to service_role;
create policy dual_astrology_select on public.dual_astrology_states for select to authenticated
  using ((select auth.uid()) = user_id);
create policy dual_astrology_insert on public.dual_astrology_states for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy dual_astrology_update on public.dual_astrology_states for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy dual_astrology_delete on public.dual_astrology_states for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Privileged function code uses this atomic quota; clients have no access.
create table public.dual_astrology_quotas (
  subject text primary key check (length(subject) <= 64),
  window_started_at timestamptz not null,
  calls integer not null check (calls between 1 and 30)
);
alter table public.dual_astrology_quotas enable row level security;
revoke all on public.dual_astrology_quotas from anon, authenticated;
grant all on public.dual_astrology_quotas to service_role;
create function public.dual_astrology_take_quota(p_subject text)
returns boolean
language plpgsql security invoker set search_path = ''
as $$
declare
  bucket timestamptz := to_timestamp(floor(extract(epoch from now()) / 300) * 300);
  accepted integer;
begin
  insert into public.dual_astrology_quotas as quota (subject, window_started_at, calls)
  values (p_subject, bucket, 1)
  on conflict (subject) do update
    set window_started_at = excluded.window_started_at,
        calls = case when quota.window_started_at <> excluded.window_started_at then 1 else quota.calls + 1 end
    where quota.window_started_at <> excluded.window_started_at or quota.calls < 30
  returning calls into accepted;
  return accepted is not null;
end;
$$;
revoke all on function public.dual_astrology_take_quota(text) from public, anon, authenticated;
grant execute on function public.dual_astrology_take_quota(text) to service_role;
