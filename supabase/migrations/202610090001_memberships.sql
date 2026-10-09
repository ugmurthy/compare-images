-- Apply to the shared Supabase project only after review. Prices are intentionally
-- unset: configure them in minor currency units before enabling paid checkout.
begin;
set local timezone = 'UTC';

create table public.sketch_plans (
  id text primary key check (id in ('free', 'yearly', 'lifetime')),
  amount integer check (amount > 0),
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  enabled boolean not null default false
);
insert into public.sketch_plans (id, enabled) values ('free', true), ('yearly', false), ('lifetime', false);

create table public.sketch_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' references public.sketch_plans(id),
  selected_plan text not null default 'free' references public.sketch_plans(id),
  expires_at timestamptz,
  activated_at timestamptz,
  referral_code uuid not null unique default gen_random_uuid(),
  signup_referral text,
  referral_result text check (referral_result in ('rewarded', 'unavailable')),
  referrals_used integer not null default 0 check (referrals_used between 0 and 2)
);
create table public.sketch_referrals (
  referred_user uuid primary key references public.sketch_memberships(user_id) on delete cascade,
  referrer uuid not null references public.sketch_memberships(user_id) on delete cascade,
  rewarded_at timestamptz not null default now(),
  check (referred_user <> referrer)
);
create table public.sketch_orders (
  order_id text primary key,
  user_id uuid not null references public.sketch_memberships(user_id) on delete cascade,
  plan text not null check (plan in ('yearly', 'lifetime')),
  amount integer not null check (amount > 0),
  currency text not null,
  payment_id text unique,
  created_at timestamptz not null default now(),
  fulfilled_at timestamptz
);

alter table public.sketch_plans enable row level security;
alter table public.sketch_memberships enable row level security;
alter table public.sketch_referrals enable row level security;
alter table public.sketch_orders enable row level security;
revoke all on public.sketch_plans, public.sketch_memberships, public.sketch_referrals, public.sketch_orders from anon, authenticated;
grant select on public.sketch_plans to anon, authenticated;
grant select on public.sketch_memberships to authenticated;
grant all on public.sketch_plans, public.sketch_memberships, public.sketch_referrals, public.sketch_orders to service_role;
create policy sketch_public_prices on public.sketch_plans for select to anon, authenticated using (true);
create policy sketch_own_membership on public.sketch_memberships for select to authenticated using (user_id = auth.uid());

-- Capture signup intent once. Later edits to user_metadata cannot change the
-- referral or grant paid access. It runs for all new shared-identity users,
-- including signups from the other app, without changing their auth metadata.
create function public.sketch_new_member() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.sketch_memberships (user_id, selected_plan, signup_referral)
  values (new.id,
    case when new.raw_user_meta_data->>'sketch_plan' in ('free', 'yearly', 'lifetime')
      then new.raw_user_meta_data->>'sketch_plan' else 'free' end,
    left(new.raw_user_meta_data->>'sketch_referral', 100));
  return new;
end;
$$;
revoke all on function public.sketch_new_member() from public;
create trigger sketch_user_created after insert on auth.users
for each row execute function public.sketch_new_member();

-- Existing shared-identity users receive one trial at rollout, but cannot be
-- referred retroactively. No existing auth records are modified.
insert into public.sketch_memberships (user_id, activated_at, expires_at)
select id, now(), now() + interval '3 months' from auth.users;

create function public.sketch_activate(p_plan text default 'free', p_referral text default null)
returns public.sketch_memberships
language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare
  member public.sketch_memberships;
  inviter public.sketch_memberships;
  provider text;
begin
  if auth.uid() is null or not exists (
    select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null
  ) then raise exception 'Confirmed sign-in required'; end if;
  select * into member from public.sketch_memberships where user_id = auth.uid() for update;
  if not found then raise exception 'Membership missing'; end if;
  if member.activated_at is not null then return member; end if;

  select raw_app_meta_data->>'provider' into provider from auth.users where id = auth.uid();
  -- Google cannot carry signup metadata; accept intent only on first activation.
  if provider = 'google' then
    member.selected_plan := case when p_plan in ('free', 'yearly', 'lifetime') then p_plan else 'free' end;
    member.signup_referral := left(p_referral, 100);
  end if;
  update public.sketch_memberships set activated_at = now(), expires_at = now() + interval '3 months',
    selected_plan = member.selected_plan, signup_referral = member.signup_referral
    where user_id = member.user_id returning * into member;

  if member.signup_referral is not null then
    -- UUID comparison as text rejects malformed codes without breaking signup.
    select * into inviter from public.sketch_memberships
    where referral_code::text = member.signup_referral and user_id <> member.user_id
      and activated_at is not null for update;
    if found and inviter.referrals_used < 2 then
      insert into public.sketch_referrals (referred_user, referrer) values (member.user_id, inviter.user_id);
      update public.sketch_memberships set referrals_used = referrals_used + 1,
        expires_at = case when plan = 'lifetime' then null
          else greatest(expires_at, now()) + interval '3 months' end
        where user_id = inviter.user_id;
      member.referral_result := 'rewarded';
    else
      member.referral_result := 'unavailable';
    end if;
    update public.sketch_memberships set referral_result = member.referral_result where user_id = member.user_id;
  end if;
  return member;
end;
$$;
revoke all on function public.sketch_activate(text, text) from public;
grant execute on function public.sketch_activate(text, text) to authenticated;

-- Only the trusted payment handler may fulfil an order. The order row lock makes
-- checkout callbacks and repeated/concurrent webhooks grant access exactly once.
create function public.sketch_fulfil_order(p_order_id text, p_payment_id text)
returns void language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare
  purchase public.sketch_orders;
begin
  select * into purchase from public.sketch_orders where order_id = p_order_id for update;
  if not found then raise exception 'Unknown order'; end if;
  if purchase.fulfilled_at is not null then
    if purchase.payment_id <> p_payment_id then raise exception 'Payment mismatch'; end if;
    return;
  end if;
  perform 1 from public.sketch_memberships where user_id = purchase.user_id for update;
  update public.sketch_memberships set
    plan = case when plan = 'lifetime' then 'lifetime' else purchase.plan end,
    selected_plan = case when plan = 'lifetime' then 'lifetime' else purchase.plan end,
    expires_at = case when plan = 'lifetime' or purchase.plan = 'lifetime' then null
      else greatest(expires_at, now()) + interval '1 year' end
    where user_id = purchase.user_id;
  update public.sketch_orders set payment_id = p_payment_id, fulfilled_at = now() where order_id = purchase.order_id;
end;
$$;
revoke all on function public.sketch_fulfil_order(text, text) from public;
grant execute on function public.sketch_fulfil_order(text, text) to service_role;

commit;
