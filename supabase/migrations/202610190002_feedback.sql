begin;

create table public.sketch_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('feedback', 'suggestion', 'bug', 'feature')),
  message text not null check (char_length(btrim(message)) between 10 and 4000),
  status text not null default 'new' check (status in ('new', 'reviewing', 'planned', 'resolved')),
  created_at timestamptz not null default now()
);
create index sketch_feedback_user_time on public.sketch_feedback(user_id, created_at);
alter table public.sketch_feedback enable row level security;
revoke all on public.sketch_feedback from anon, authenticated;
grant select on public.sketch_feedback to authenticated;
grant all on public.sketch_feedback to service_role;
create policy sketch_own_feedback on public.sketch_feedback for select to authenticated using (user_id = auth.uid());

create function public.sketch_submit_feedback(p_kind text, p_message text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  feedback_id uuid;
begin
  -- Lock one author so concurrent submissions cannot bypass the hourly limit.
  perform 1 from auth.users where id = auth.uid() and email_confirmed_at is not null for update;
  if not found then raise exception 'Confirmed sign-in required'; end if;
  if p_kind is null or p_kind not in ('feedback', 'suggestion', 'bug', 'feature')
    or p_message is null or char_length(btrim(p_message)) not between 10 and 4000 then
    raise exception 'Invalid feedback';
  end if;
  if (select count(*) from public.sketch_feedback
      where user_id = auth.uid() and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Feedback limit reached';
  end if;
  insert into public.sketch_feedback(user_id, kind, message)
    values (auth.uid(), p_kind, btrim(p_message)) returning id into feedback_id;
  return feedback_id;
end;
$$;
revoke all on function public.sketch_submit_feedback(text, text) from public, anon;
grant execute on function public.sketch_submit_feedback(text, text) to authenticated;

commit;
