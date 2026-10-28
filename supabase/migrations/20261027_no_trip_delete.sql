-- Nobody can delete a shared trip for everyone. Everyone, the owner included, can only leave.
-- Trips with no members stay in the table so they can be reported on later.

create or replace function public.tp_leave(p_trip text, p_member text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare r shared_trips; h text; nm text; was_owner boolean; nxt text;
begin
  select * into r from shared_trips where trip_id = p_trip for update;
  if not found then return false; end if;
  h := _sha(p_member);
  if not (r.members ? h) then return false; end if;
  nm := r.members->h->>'n';
  was_owner := r.members->h->>'r' = 'owner';
  update shared_trips set members = members - h,
         owner_id = case when owner_id is not distinct from (select auth.uid()) then null else owner_id end,
         activity = _act_push(activity, left(h, 12), nm || ' left'),
         version = r.version + 1, updated_at = now()
   where code_hash = r.code_hash;
  if was_owner then
    select * into r from shared_trips where code_hash = r.code_hash;
    if not exists (select 1 from jsonb_each(r.members) e(k, v) where v->>'r' = 'owner') then
      select k into nxt from jsonb_each(r.members) e(k, v) order by v->>'t', k limit 1;
      if nxt is not null then
        update shared_trips set members = jsonb_set(members, array[nxt, 'r'], '"owner"'::jsonb) where code_hash = r.code_hash;
      end if;
    end if;
  end if;
  return true;
end $$;

create or replace function public.tp_delete(p_trip text, p_owner text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
begin
  return false;
end $$;

create or replace function public.share_delete(p_code text, p_owner text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
begin
  return false;
end $$;

-- Deleting an account no longer deletes trips other people are on.
create or replace function public.delete_my_account()
returns boolean language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not signed in'; end if;
  update feedback set user_id = null, contact_email = null, device_id = null where user_id = uid;
  update shared_trips set owner_id = null where owner_id = uid;
  delete from auth.users where id = uid;   -- cascades to account_trips
  return true;
end $$;
