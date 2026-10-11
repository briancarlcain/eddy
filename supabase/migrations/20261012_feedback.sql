-- In-app feedback and feature requests.
--
-- Anyone can submit (signed in or not) through feedback_submit(); nobody can read the table
-- through the API. Read it from the Supabase dashboard (service role) or the views below.
-- Signed-in submissions carry the user's id; deleting an account unlinks and scrubs them.

create table public.feedback (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  user_id       uuid references auth.users(id) on delete set null,
  device_id     text check (char_length(device_id) <= 64),     -- random per install; rate limit and anonymous dedupe
  kind          text not null check (kind in ('idea', 'problem', 'other')),
  message       text not null check (char_length(message) between 3 and 4000),
  contact_email text check (char_length(contact_email) <= 254), -- only if the person asked to be contacted
  screen        text check (char_length(screen) <= 40),         -- where in the app they were
  river_id      text check (char_length(river_id) <= 80),
  app_version   text check (char_length(app_version) <= 40),
  platform      text check (platform in ('ios', 'android', 'web')),
  locale        text check (char_length(locale) <= 20),
  -- triage, set from the dashboard
  status        text not null default 'new' check (status in ('new', 'reviewing', 'planned', 'shipped', 'declined', 'duplicate')),
  priority      smallint check (priority between 1 and 5),
  tags          text[] not null default '{}',
  duplicate_of  uuid references public.feedback(id) on delete set null,
  notes         text,
  updated_at    timestamptz not null default now()
);

create index feedback_created_idx on public.feedback (created_at desc);
create index feedback_status_idx  on public.feedback (status, created_at desc);
create index feedback_user_idx    on public.feedback (user_id) where user_id is not null;
create index feedback_device_idx  on public.feedback (device_id, created_at desc) where device_id is not null;

alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;     -- no policies: the API cannot read or write it directly

create or replace function public.feedback_touch() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
create trigger feedback_touch before update on public.feedback
  for each row execute function public.feedback_touch();

-- The only way in. Validates, rate limits (5 an hour, 20 a day per person or device), inserts.
create or replace function public.feedback_submit(
  p_kind text, p_message text, p_email text default null, p_device text default null, p_meta jsonb default '{}'::jsonb
) returns boolean language plpgsql security definer set search_path = public, auth as $$
declare
  uid uuid := (select auth.uid());
  msg text := btrim(coalesce(p_message, ''));
  mail text := nullif(btrim(coalesce(p_email, '')), '');
  dev text := nullif(left(btrim(coalesce(p_device, '')), 64), '');
  recent int;
  today int;
begin
  if p_kind not in ('idea', 'problem', 'other') then raise exception 'bad kind'; end if;
  if char_length(msg) < 3 or char_length(msg) > 4000 then raise exception 'bad message'; end if;
  if mail is not null and (char_length(mail) > 254 or mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then raise exception 'bad email'; end if;
  if uid is null and dev is null then raise exception 'bad device'; end if;

  select count(*) filter (where created_at > now() - interval '1 hour'),
         count(*) filter (where created_at > now() - interval '1 day')
    into recent, today
    from feedback
   where (uid is not null and user_id = uid) or (uid is null and device_id = dev);
  if recent >= 5 or today >= 20 then raise exception 'too many'; end if;

  insert into feedback (user_id, device_id, kind, message, contact_email, screen, river_id, app_version, platform, locale)
  values (
    uid, dev, p_kind, msg, mail,
    left(p_meta ->> 'screen', 40), left(p_meta ->> 'river', 80), left(p_meta ->> 'version', 40),
    case when p_meta ->> 'platform' in ('ios', 'android', 'web') then p_meta ->> 'platform' end,
    left(p_meta ->> 'locale', 20)
  );
  return true;
end $$;

revoke execute on function public.feedback_submit(text, text, text, text, jsonb) from public;
grant  execute on function public.feedback_submit(text, text, text, text, jsonb) to anon, authenticated;

-- Aggregation, for the dashboard SQL editor. Not readable through the API.
create view public.feedback_inbox with (security_invoker = true) as
select f.id, f.created_at, f.status, f.priority, f.kind, f.message, f.screen, f.river_id, f.platform, f.app_version,
       f.tags, f.duplicate_of, f.user_id, f.contact_email, u.email as user_email,
       coalesce(u.raw_user_meta_data ->> 'name', u.raw_user_meta_data ->> 'full_name') as user_name
  from public.feedback f left join auth.users u on u.id = f.user_id
 order by (f.status = 'new') desc, f.created_at desc;

create view public.feedback_weekly with (security_invoker = true) as
select date_trunc('week', created_at)::date as week, kind, count(*) as items,
       count(distinct coalesce(user_id::text, device_id)) as people
  from public.feedback group by 1, 2 order by 1 desc, 2;

create view public.feedback_by_river with (security_invoker = true) as
select coalesce(river_id, '(none)') as river, kind, count(*) as items
  from public.feedback group by 1, 2 order by 3 desc;

revoke all on public.feedback_inbox, public.feedback_weekly, public.feedback_by_river from anon, authenticated;

-- Account deletion keeps the product signal but removes the link to the person.
create or replace function public.delete_my_account()
returns boolean language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not signed in'; end if;
  update feedback set user_id = null, contact_email = null, device_id = null where user_id = uid;
  delete from shared_trips where owner_id = uid;
  delete from auth.users where id = uid;   -- cascades to account_trips
  return true;
end $$;
