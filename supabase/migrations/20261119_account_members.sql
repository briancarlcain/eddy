-- One member per account. Sharing and joining need a signed-in account; a person is the same member on every
-- device. Members who joined before (identified by a device secret) are adopted into their account on their next
-- sync (tp_adopt); stale or duplicate entries can be removed by the owner, owner-role entries included.

-- member key of the signed-in account (null when signed out)
create or replace function public._acct_key() returns text
language sql stable security definer set search_path = public, extensions as $$
  select case when (select auth.uid()) is null then null else _sha('u:' || (select auth.uid())::text) end
$$;

-- the key the caller holds on a trip: their account's, else a device-secret one from before accounts
create or replace function public._mkey(r public.shared_trips, p_member text) returns text
language plpgsql stable security definer set search_path = public, extensions as $$
declare a text := _acct_key(); h text;
begin
  if a is not null and r.members ? a then return a; end if;
  if length(coalesce(p_member, '')) >= 16 then
    h := _sha(p_member);
    if r.members ? h then return h; end if;
  end if;
  return null;
end $$;

create or replace function public._role(r public.shared_trips, p_member text) returns text
language plpgsql stable security definer set search_path = public, extensions as $$
declare k text := _mkey(r, p_member);
begin
  if k is not null then return r.members->k->>'r'; end if;
  if (select auth.uid()) is not null and r.owner_id = (select auth.uid()) then return 'owner'; end if;
  return null;
end $$;

-- ---- create / join need an account ----
create or replace function public.share_v2_create(p_code text, p_member text, p_name text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare tid text := replace(gen_random_uuid()::text, '-', ''); h text; a text := _acct_key();
begin
  if a is null then raise exception 'sign in to share a trip'; end if;
  if p_code !~ '^[A-Z2-9]{16}$' then raise exception 'bad code'; end if;
  if length(coalesce(p_member, '')) < 16 then raise exception 'bad member secret'; end if;
  if octet_length(p_data::text) > 1500000 then raise exception 'trip too large'; end if;
  h := _sha(p_member);
  insert into shared_trips (code_hash, owner_hash, owner_id, data, trip_id, invite_hash, members)
    values (_sha('v2:' || tid), h, (select auth.uid()), p_data, tid, _sha(p_code),
            jsonb_build_object(a, jsonb_build_object('n', _clean_name(p_name), 'r', 'owner', 'u', (select auth.uid())::text,
                                                    't', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))));
  return jsonb_build_object('trip', tid, 'version', 1, 'role', 'owner', 'me', left(a, 12));
exception when unique_violation then raise exception 'code in use';
end $$;

-- move a device-secret entry onto the caller's account (merging into it when the account already has one).
-- Caller holds the row lock. Returns the updated row.
create or replace function public._adopt(r public.shared_trips, p_member text) returns public.shared_trips
language plpgsql security definer set search_path = public, extensions as $$
declare a text := _acct_key(); h text; uidt text := (select auth.uid())::text;
begin
  if a is null or length(coalesce(p_member, '')) < 16 then return r; end if;
  h := _sha(p_member);
  if h = a or not (r.members ? h) then return r; end if;
  update shared_trips
     set members = case when members ? a then members - h
                        else (members - h) || jsonb_build_object(a, (members->h) || jsonb_build_object('u', uidt)) end,
         activity = (select coalesce(jsonb_agg(case when x->>'w' = left(h, 12) then jsonb_set(x, '{w}', to_jsonb(left(a, 12))) else x end order by i), '[]'::jsonb)
                       from jsonb_array_elements(activity) with ordinality as e(x, i)),
         version = r.version + 1, updated_at = now()
   where code_hash = r.code_hash
   returning * into r;
  return r;
end $$;

create or replace function public.tp_adopt(p_trip text, p_member text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r shared_trips; a text := _acct_key();
begin
  if a is null then raise exception 'sign in'; end if;
  select * into r from shared_trips where trip_id = p_trip for update;
  if not found then return jsonb_build_object('missing', true); end if;
  r := _adopt(r, p_member);
  if not (r.members ? a) then return jsonb_build_object('removed', true); end if;
  if not (r.members->a ? 'u') then
    update shared_trips set members = jsonb_set(members, array[a, 'u'], to_jsonb((select auth.uid())::text)) where code_hash = r.code_hash;
  end if;
  return jsonb_build_object('me', left(a, 12), 'role', r.members->a->>'r');
end $$;

create or replace function public.share_join(p_invite text, p_member text, p_name text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r shared_trips; a text := _acct_key(); role text; nm text := _clean_name(p_name);
begin
  if a is null then raise exception 'sign in to join a trip'; end if;
  select * into r from shared_trips where invite_hash = _sha(p_invite) for update;
  if not found then return jsonb_build_object('missing', true); end if;
  r := _adopt(r, p_member);
  if r.members ? a then
    role := r.members->a->>'r';
    if nm <> '' and coalesce(r.members->a->>'n', '') = '' then
      update shared_trips set members = jsonb_set(members, array[a, 'n'], to_jsonb(nm)) where code_hash = r.code_hash returning * into r;
    end if;
  else
    if (select count(*) from jsonb_object_keys(r.members)) >= 60 then raise exception 'this trip is full'; end if;
    role := case when r.owner_id is not null and r.owner_id = (select auth.uid()) then 'owner' else r.invite_role end;
    update shared_trips
       set members = members || jsonb_build_object(a, jsonb_build_object('n', nm, 'r', role, 'u', (select auth.uid())::text,
                                                                         't', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))),
           activity = _act_push(activity, left(a, 12), case when nm = '' then 'Someone joined' else nm || ' joined' end),
           version = r.version + 1, updated_at = now()
     where code_hash = r.code_hash
     returning * into r;
  end if;
  return jsonb_build_object('trip', r.trip_id, 'role', role, 'me', left(a, 12), 'version', r.version, 'data', r.data,
                            'members', _members_out(r.members), 'activity', r.activity, 'invite_role', r.invite_role);
end $$;

-- ---- read / write: same as before, but the caller's key may be an account key ----
create or replace function public.tp_get(p_trip text, p_member text, p_have bigint default 0)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r shared_trips; role text; k text;
begin
  select * into r from shared_trips where trip_id = p_trip;
  if not found then return jsonb_build_object('missing', true); end if;
  role := _role(r, p_member);
  if role is null then return jsonb_build_object('removed', true); end if;
  if r.version <= coalesce(p_have, 0) then return null; end if;
  k := coalesce(_mkey(r, p_member), _sha(coalesce(p_member, '')));
  return jsonb_build_object('version', r.version, 'data', r.data, 'role', role, 'me', left(k, 12),
                            'members', _members_out(r.members), 'activity', r.activity, 'invite_role', r.invite_role);
end $$;

create or replace function public.tp_put(p_trip text, p_member text, p_base bigint, p_data jsonb, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r shared_trips; role text; h text;
begin
  if octet_length(p_data::text) > 1500000 then raise exception 'trip too large'; end if;
  select * into r from shared_trips where trip_id = p_trip for update;
  if not found then return jsonb_build_object('missing', true); end if;
  role := _role(r, p_member);
  if role is null then return jsonb_build_object('removed', true); end if;
  if role not in ('owner', 'editor') then return jsonb_build_object('forbidden', true, 'version', r.version, 'data', r.data); end if;
  if r.version <> p_base then
    return jsonb_build_object('conflict', true, 'version', r.version, 'data', r.data);
  end if;
  h := left(coalesce(_mkey(r, p_member), _sha(coalesce(p_member, ''))), 12);
  update shared_trips
     set data = p_data, version = r.version + 1, updated_at = now(),
         activity = _act_push(activity, h, p_note)
   where code_hash = r.code_hash;
  return jsonb_build_object('version', r.version + 1);
end $$;

create or replace function public.tp_rename(p_trip text, p_member text, p_name text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare r shared_trips; k text;
begin
  select * into r from shared_trips where trip_id = p_trip for update;
  if not found then return false; end if;
  k := _mkey(r, p_member);
  if k is null then return false; end if;
  update shared_trips set members = jsonb_set(members, array[k, 'n'], to_jsonb(_clean_name(p_name))),
         version = r.version + 1, updated_at = now()
   where code_hash = r.code_hash;
  return true;
end $$;

create or replace function public.tp_leave(p_trip text, p_member text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare r shared_trips; k text; nm text;
begin
  select * into r from shared_trips where trip_id = p_trip for update;
  if not found then return false; end if;
  k := _mkey(r, p_member);
  if k is null or r.members->k->>'r' = 'owner' then return false; end if;
  nm := r.members->k->>'n';
  update shared_trips set members = members - k,
         activity = _act_push(activity, left(k, 12), nm || ' left'),
         version = r.version + 1, updated_at = now()
   where code_hash = r.code_hash;
  return true;
end $$;

-- ---- owner controls: role changes as before; removal now also covers duplicate owner entries (never your own) ----
create or replace function public.tp_role(p_trip text, p_owner text, p_target text, p_role text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare r shared_trips; k text; nm text; who text;
begin
  if p_role not in ('editor', 'viewer') then raise exception 'bad role'; end if;
  select * into r from shared_trips where trip_id = p_trip for update;
  if not found or _role(r, p_owner) is distinct from 'owner' then return false; end if;
  select key into k from jsonb_object_keys(r.members) as key where left(key, 12) = p_target and r.members->key->>'r' <> 'owner';
  if k is null then return false; end if;
  nm := r.members->k->>'n';
  who := left(coalesce(_mkey(r, p_owner), _sha(coalesce(p_owner, ''))), 12);
  update shared_trips
     set members = jsonb_set(members, array[k, 'r'], to_jsonb(p_role)),
         activity = _act_push(activity, who, nm || ' is now ' || case p_role when 'viewer' then 'view only' else 'an editor' end),
         version = r.version + 1, updated_at = now()
   where code_hash = r.code_hash;
  return true;
end $$;

create or replace function public.tp_remove(p_trip text, p_owner text, p_target text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare r shared_trips; k text; nm text; me text; who text;
begin
  select * into r from shared_trips where trip_id = p_trip for update;
  if not found or _role(r, p_owner) is distinct from 'owner' then return false; end if;
  me := _mkey(r, p_owner);
  select key into k from jsonb_object_keys(r.members) as key where left(key, 12) = p_target and key is distinct from me;
  if k is null then return false; end if;
  nm := coalesce(nullif(r.members->k->>'n', ''), 'Someone');
  who := left(coalesce(me, _sha(coalesce(p_owner, ''))), 12);
  update shared_trips
     set members = members - k,
         activity = _act_push(activity, who, nm || ' was removed'),
         version = r.version + 1, updated_at = now()
   where code_hash = r.code_hash;
  return true;
end $$;

create or replace function public.tp_rotate(p_trip text, p_owner text, p_new_code text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare r shared_trips; who text;
begin
  if p_new_code !~ '^[A-Z2-9]{16}$' then raise exception 'bad code'; end if;
  select * into r from shared_trips where trip_id = p_trip for update;
  if not found or _role(r, p_owner) is distinct from 'owner' then return false; end if;
  who := left(coalesce(_mkey(r, p_owner), _sha(coalesce(p_owner, ''))), 12);
  update shared_trips set invite_hash = _sha(p_new_code), version = r.version + 1, updated_at = now(),
         activity = _act_push(activity, who, 'Invite link was reset')
   where code_hash = r.code_hash;
  return true;
exception when unique_violation then raise exception 'code in use';
end $$;

-- ---- permissions ----
revoke execute on function public._acct_key(), public._mkey(public.shared_trips, text), public._adopt(public.shared_trips, text), public._role(public.shared_trips, text) from public, anon, authenticated;
revoke execute on function public.tp_adopt(text, text) from public;
grant execute on function public.tp_adopt(text, text) to anon, authenticated;
