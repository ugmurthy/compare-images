begin;

-- Log attempts, not recipients. Serializing on the member row makes the limit
-- hold across concurrent Edge requests. Expired/Lifetime members may invite.
create table public.sketch_invite_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.sketch_memberships(user_id) on delete cascade,
  created_at timestamptz not null default now()
);
create index sketch_invite_attempts_user_time on public.sketch_invite_attempts(user_id, created_at);
alter table public.sketch_invite_attempts enable row level security;
revoke all on public.sketch_invite_attempts from anon, authenticated;
grant all on public.sketch_invite_attempts to service_role;

create function public.sketch_reserve_invite(p_user_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  code uuid;
begin
  select referral_code into code from public.sketch_memberships
    where user_id = p_user_id and activated_at is not null for update;
  if not found then raise exception 'Activate membership first'; end if;
  if (select count(*) from public.sketch_invite_attempts
      where user_id = p_user_id and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Invite limit reached';
  end if;
  insert into public.sketch_invite_attempts(user_id) values (p_user_id);
  return code;
end;
$$;
revoke all on function public.sketch_reserve_invite(uuid) from public, anon, authenticated;
grant execute on function public.sketch_reserve_invite(uuid) to service_role;

commit;
