\set ON_ERROR_STOP on
-- Run ONLY in an empty, disposable PostgreSQL database as a superuser.
-- This provides the minimal Supabase Auth schema, then tests the actual migration.
do $$ begin
  if current_database() <> 'sketch_membership_test' then raise exception 'Use the disposable sketch_membership_test database'; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema auth;
grant usage on schema auth to authenticated;
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table auth.users (
  id uuid primary key default gen_random_uuid(), email_confirmed_at timestamptz,
  raw_user_meta_data jsonb not null default '{}', raw_app_meta_data jsonb not null default '{"provider":"email"}'
);
insert into auth.users (id, email_confirmed_at) values ('00000000-0000-4000-8000-000000000001', now());
\ir ../supabase/migrations/202610090001_memberships.sql

begin;
set local timezone = 'UTC';
create function pg_temp.check(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%', message; end if; end $$;
select pg_temp.check((select expires_at > now() and activated_at is not null from public.sketch_memberships
  where user_id = '00000000-0000-4000-8000-000000000001'), 'Existing user receives one trial');
-- Keep the expected rewards asymmetric and test calendar-month end clamping.
update public.sketch_memberships set expires_at = '2030-01-31T15:20:00Z',
  referral_code = '10000000-0000-4000-8000-000000000001';
insert into auth.users (id, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000002', now(), '{"sketch_plan":"lifetime","sketch_referral":"10000000-0000-4000-8000-000000000001"}'),
  ('00000000-0000-4000-8000-000000000003', now(), '{"sketch_referral":"10000000-0000-4000-8000-000000000001"}'),
  ('00000000-0000-4000-8000-000000000004', now(), '{"sketch_referral":"10000000-0000-4000-8000-000000000001"}'),
  ('00000000-0000-4000-8000-000000000005', null, '{"sketch_referral":"10000000-0000-4000-8000-000000000001"}');
-- Updating signup metadata later cannot replace captured intent.
update auth.users set raw_user_meta_data = '{"sketch_plan":"yearly","sketch_referral":"forged"}'
  where id = '00000000-0000-4000-8000-000000000002';
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
select pg_temp.check((public.sketch_activate('yearly', 'forged')).selected_plan = 'lifetime', 'Signup intent is immutable');
select pg_temp.check((public.sketch_activate()).plan = 'free', 'Paid signup selection grants trial, not lifetime');
select pg_temp.check((select count(*) = 1 from public.sketch_memberships), 'RLS returns only own subscription');
reset role;
select pg_temp.check((select referrals_used = 1 and expires_at = '2030-04-30T15:20:00Z' from public.sketch_memberships
  where user_id = '00000000-0000-4000-8000-000000000001'), 'Referral rewards once and adds three calendar months');
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000003';
select public.sketch_activate();
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000004';
select pg_temp.check((public.sketch_activate()).referral_result = 'unavailable', 'Third referral signup gets no reward');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000005';
do $$ begin
  perform public.sketch_activate();
  raise exception 'Unconfirmed account was accepted';
exception when raise_exception then
  if sqlerrm <> 'Confirmed sign-in required' then raise; end if;
end $$;
do $$ begin
  update public.sketch_memberships set plan = 'lifetime';
  raise exception 'User changed own entitlement';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform public.sketch_fulfil_order('order_forged', 'pay_forged');
  raise exception 'User invoked paid fulfilment';
exception when insufficient_privilege then null; end $$;
reset role;
select pg_temp.check((select referrals_used = 2 and expires_at = '2030-07-30T15:20:00Z' from public.sketch_memberships
  where user_id = '00000000-0000-4000-8000-000000000001'), 'Two rewards, never a third');
select pg_temp.check((select count(*) = 2 from public.sketch_referrals), 'Exactly two recorded successful referrals');
-- Existing users cannot claim a signup referral on later sign-ins.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
select pg_temp.check((public.sketch_activate('lifetime', '10000000-0000-4000-8000-000000000001')).referral_result is null, 'Existing users cannot claim self/retroactive referral');
reset role;
update public.sketch_memberships set expires_at = '2020-01-01' where user_id = '00000000-0000-4000-8000-000000000001';
insert into public.sketch_orders (order_id, user_id, plan, amount, currency) values
  ('order_yearly', '00000000-0000-4000-8000-000000000001', 'yearly', 120000, 'INR'),
  ('order_lifetime', '00000000-0000-4000-8000-000000000001', 'lifetime', 350000, 'INR'),
  ('order_renewal', '00000000-0000-4000-8000-000000000001', 'yearly', 120000, 'INR'),
  ('order_late', '00000000-0000-4000-8000-000000000001', 'yearly', 120000, 'INR');
set local role service_role;
select public.sketch_fulfil_order('order_yearly', 'pay_yearly');
select public.sketch_fulfil_order('order_yearly', 'pay_yearly');
reset role;
select pg_temp.check((select plan = 'yearly' and expires_at = now() + interval '1 year' from public.sketch_memberships
  where user_id = '00000000-0000-4000-8000-000000000001'), 'Duplicate fulfilment adds one year from now for expired access');
set local role service_role;
select public.sketch_fulfil_order('order_renewal', 'pay_renewal');
reset role;
select pg_temp.check((select expires_at = now() + interval '2 years' from public.sketch_memberships
  where user_id = '00000000-0000-4000-8000-000000000001'), 'Renewal preserves remaining access');
set local role service_role;
select public.sketch_fulfil_order('order_lifetime', 'pay_lifetime');
select public.sketch_fulfil_order('order_late', 'pay_late');
reset role;
select pg_temp.check((select plan = 'lifetime' and expires_at is null from public.sketch_memberships
  where user_id = '00000000-0000-4000-8000-000000000001'), 'Lifetime has no expiry and a late yearly capture cannot downgrade it');

insert into auth.users (id, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000006', now(), '{"provider":"google"}', '{}'),
  ('00000000-0000-4000-8000-000000000007', now(), '{"provider":"google"}', '{}'),
  ('00000000-0000-4000-8000-000000000008', now(), '{"provider":"email"}', '{"sketch_referral":"10000000-0000-4000-8000-000000000008"}'),
  ('00000000-0000-4000-8000-000000000009', now(), '{"provider":"email"}', '{"sketch_referral":"not-a-uuid"}');
update public.sketch_memberships set referral_code = '10000000-0000-4000-8000-000000000008'
  where user_id = '00000000-0000-4000-8000-000000000008';
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000006';
select public.sketch_activate();
reset role;
update public.sketch_memberships set expires_at = '2020-01-01', referral_code = '10000000-0000-4000-8000-000000000006'
  where user_id = '00000000-0000-4000-8000-000000000006';
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000007';
select pg_temp.check((public.sketch_activate('yearly', '10000000-0000-4000-8000-000000000006')).selected_plan = 'yearly', 'Google first activation accepts signup intent');
select pg_temp.check((public.sketch_activate('lifetime', 'forged')).selected_plan = 'yearly', 'Google intent cannot change after activation');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000008';
select pg_temp.check((public.sketch_activate()).referral_result = 'unavailable', 'Self referral is rejected');
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000009';
select pg_temp.check((public.sketch_activate()).referral_result = 'unavailable', 'Malformed referral does not prevent signup');
reset role;
select pg_temp.check((select referrals_used = 1 and expires_at = now() + interval '3 months' from public.sketch_memberships
  where user_id = '00000000-0000-4000-8000-000000000006'), 'Expired inviter earns three months starting today');
rollback;
\echo PASS: trials, email/Google signup intent, confirmation, two referrals, replay, self/invalid referrals, expired rewards, month ends, RLS, write denial, payment idempotency, expiry/renewal, lifetime/late capture.
