-- Nobody can delete a shared trip for everyone else. Replaces the never-applied 20261027_no_trip_delete.sql.
-- Deleting an account removes that person from the trips they were on; the trips stay for the crew, and if
-- the person was the only owner the longest-standing remaining member becomes the owner.

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

create or replace function public.delete_my_account()
returns boolean language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := (select auth.uid()); r shared_trips; m jsonb; nxt text;
begin
  if uid is null then raise exception 'not signed in'; end if;
  update feedback set user_id = null, contact_email = null, device_id = null where user_id = uid;
  for r in
    select * from shared_trips
     where owner_id = uid or exists (select 1 from jsonb_each(members) e where e.value->>'u' = uid::text)
       for update
  loop
    m := (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) from jsonb_each(r.members) e where e.value->>'u' is distinct from uid::text);
    if not exists (select 1 from jsonb_each(m) e where e.value->>'r' = 'owner') then
      select e.key into nxt from jsonb_each(m) e order by e.value->>'t', e.key limit 1;
      if nxt is not null then m := jsonb_set(m, array[nxt, 'r'], '"owner"'::jsonb); end if;
    end if;
    update shared_trips
       set members = m, owner_id = case when owner_id = uid then null else owner_id end,
           version = r.version + 1, updated_at = now()
     where code_hash = r.code_hash;
  end loop;
  delete from auth.users where id = uid;   -- cascades to account_trips
  return true;
end $$;
