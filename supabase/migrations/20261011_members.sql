-- Members, roles and activity for shared trips.
-- A shared trip is now addressed by a private trip id. People get in through an invite code, which
-- registers their device as a member (identified by a per-device secret that is only ever stored
-- hashed). The owner can change roles, remove people and reset the invite code. Trips shared before
-- this migration keep working through the legacy functions until their owner's device upgrades them.

alter table public.shared_trips
  add column if not exists trip_id text unique,
  add column if not exists invite_hash text,
  add column if not exists invite_role text not null default 'editor' check (invite_role in ('editor', 'viewer')),
  add column if not exists members jsonb not null default '{}'::jsonb,   -- member hash -> {n: name, r: role, t: joined}
  add column if not exists activity jsonb not null default '[]'::jsonb;  -- newest last, capped
create unique index if not exists shared_trips_invite_idx on public.shared_trips (invite_hash) where invite_hash is not null;

-- ---- helpers ----
create or replace function public._clean_name(t text) returns text
language sql immutable as $$ select left(btrim(regexp_replace(coalesce(t, ''), '[\r\n\t]+', ' ', 'g')), 40) $$;

create or replace function public._members_out(m jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', left(k, 12), 'n', v->>'n', 'r', v->>'r', 't', v->>'t') order by v->>'t', k), '[]'::jsonb)
    from jsonb_each(m) as e(k, v)
$$;

-- the caller's role on a trip row: owner / editor / viewer, or null when not a member
create or replace function public._role(r public.shared_trips, p_member text) returns text
language plpgsql stable security definer set search_path = public, extensions as $$
declare h text;
begin
  if length(coalesce(p_member, '')) < 16 then
    h := null;
  else
    h := _sha(p_member);
  end if;
  if h is not null and r.members ? h then return r.members->h->>'r'; end if;
  if (select auth.uid()) is not null and r.owner_id = (select auth.uid()) then return 'owner'; end if;
  return null;
end $$;

create or replace function public._act_push(a jsonb, who text, note text) returns jsonb
language sql immutable as $$
  select case when coalesce(note, '') = '' then a else
    (select coalesce(jsonb_agg(x order by i), '[]'::jsonb) from (
       select x, i from jsonb_array_elements(a || jsonb_build_array(
         jsonb_build_object('w', who, 't', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 's', left(note, 140)))) with ordinality as e(x, i)
       order by i desc limit 100) q)
  end
$$;

-- ---- create / upgrade / join ----
create or replace function public.share_v2_create(p_code text, p_member text, p_name text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare tid text := replace(gen_random_uuid()::text, '-', ''); h text;
begin
  if p_code !~ '^[A-Z2-9]{16}$' then raise exception 'bad code'; end if;
  if length(coalesce(p_member, '')) < 16 then raise exception 'bad member secret'; end if;
  if octet_length(p_data::text) > 1500000 then raise exception 'trip too large'; end if;
  h := _sha(p_member);
  insert into shared_trips (code_hash, owner_hash, owner_id, data, trip_id, invite_hash, members)
    values (_sha('v2:' || tid), h, (select auth.uid()), p_data, tid, _sha(p_code),
            jsonb_build_object(h, jsonb_build_object('n', _clean_name(p_name), 'r', 'owner', 't', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))));
  return jsonb_build_object('trip', tid, 'version', 1, 'role', 'owner', 'me', left(h, 12));
exception when unique_violation then raise exception 'code in use';
end $$;

-- A trip shared before members existed: the owner's device upgrades it in place. The old code stays the invite.
create or replace function public.share_upgrade(p_code text, p_owner text, p_member text, p_name text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r shared_trips; h text; tid text;
begin
  if length(coalesce(p_member, '')) < 16 then raise exception 'bad member secret'; end if;
  select * into r from shared_trips
   where code_hash = _sha(p_code)
     and ((p_owner is not null and owner_hash = _sha(p_owner)) or (owner_id is not null and owner_id = (select auth.uid())))
   for update;
  if not found then return jsonb_build_object('missing', true); end if;
  h := _sha(p_member);
  if r.trip_id is null then
    tid := replace(gen_random_uuid()::text, '-', '');
    update shared_trips
       set trip_id = tid, invite_hash = r.code_hash,
           members = jsonb_build_object(h, jsonb_build_object('n', _clean_name(p_name), 'r', 'owner', 't', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))),
           version = r.version + 1, updated_at = now()
     where code_hash = r.code_hash;
    return jsonb_build_object('trip', tid, 'version', r.version + 1, 'role', 'owner', 'me', left(h, 12));
  end if;
  if not (r.members ? h) then
    update shared_trips set members = members || jsonb_build_object(h, jsonb_build_object('n', _clean_name(p_name), 'r', 'owner', 't', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))),
           version = r.version + 1, updated_at = now() where code_hash = r.code_hash;
    return jsonb_build_object('trip', r.trip_id, 'version', r.version + 1, 'role', 'owner', 'me', left(h, 12));
  end if;
  return jsonb_build_object('trip', r.trip_id, 'version', r.version, 'role', r.members->h->>'r', 'me', left(h, 12));
end $$;

create or replace function public.share_join(p_invite text, p_member text, p_name text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r shared_trips; h text; role text; nm text := _clean_name(p_name);
begin
  if length(coalesce(p_member, '')) < 16 then raise exception 'bad member secret'; end if;
  select * into r from shared_trips where invite_hash = _sha(p_invite) for update;
  if not found then return jsonb_build_object('missing', true); end if;
  h := _sha(p_member);
  if r.members ? h then
    role := r.members->h->>'r';
  else
    if (select count(*) from jsonb_object_keys(r.members)) >= 60 then raise exception 'this trip is full'; end if;
    role := case when r.owner_id is not null and r.owner_id = (select auth.uid()) then 'owner' else r.invite_role end;
    update shared_trips
       set members = members || jsonb_build_object(h, jsonb_build_object('n', nm, 'r', role, 't', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))),
           activity = _act_push(activity, left(h, 12), case when nm = '' then 'Someone joined' else nm || ' joined' end),
           version = r.version + 1, updated_at = now()
     where code_hash = r.code_hash
     returning * into r;
  end if;
  return jsonb_build_object('trip', r.trip_id, 'role', role, 'me', left(h, 12), 'version', r.version, 'data', r.data,
                            'members', _members_out(r.members), 'activity', r.activity, 'invite_role', r.invite_role);
end $$;

-- ---- read / write ----
create or replace function public.tp_get(p_trip text, p_member text, p_have bigint default 0)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r shared_trips; role text;
begin
  select * into r from shared_trips where trip_id = p_trip;
  if not found then return jsonb_build_object('missing', true); end if;
  role := _role(r, p_member);
  if role is null then return jsonb_build_object('removed', true); end if;
  if r.version <= coalesce(p_have, 0) then return null; end if;
  return jsonb_build_object('version', r.version, 'data', r.data, 'role', role, 'me', left(_sha(p_member), 12),
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
  h := left(_sha(p_member), 12);
  update shared_trips
     set data = p_data, version = r.version + 1, updated_at = now(),
         activity = _act_push(activity, h, p_note)
   where code_hash = r.code_hash;
  return jsonb_build_object('version', r.version + 1);
end $$;

-- ---- owner controls ----
create or replace function public.tp_role(p_trip text, p_owner text, p_target text, p_role text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare r shared_trips; k text; nm text;
begin
  if p_role not in ('editor', 'viewer') then raise exception 'bad role'; end if;
  select * into r from shared_trips where trip_id = p_trip for update;
  if not found or _role(r, p_owner) is distinct from 'owner' then return false; end if;
  select key into k from jsonb_object_keys(r.members) as key where left(key, 12) = p_target and r.members->key->>'r' <> 'owner';
  if k is null then return false; end if;
  nm := r.members->k->>'n';
  update shared_trips
     set members = jsonb_set(members, array[k, 'r'], to_jsonb(p_role)),
         activity = _act_push(activity, left(_sha(p_owner), 12), nm || ' is now ' || case p_role when 'viewer' then 'view only' else 'an editor' end),
         version = r.version + 1, updated_at = now()
   where code_hash = r.code_hash;
  return true;
end $$;

create or replace function public.tp_remove(p_trip text, p_owner text, p_target text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare r shared_trips; k text; nm text;
begin
  select * into r from shared_trips where trip_id = p_trip for update;
  if not found or _role(r, p_owner) is distinct from 'owner' then return false; end if;
  select key into k from jsonb_object_keys(r.members) as key where left(key, 12) = p_target and r.members->key->>'r' <> 'owner';
  if k is null then return false; end if;
  nm := r.members->k->>'n';
  update shared_trips
     set members = members - k,
         activity = _act_push(activity, left(_sha(p_owner), 12), nm || ' was removed'),
         version = r.version + 1, updated_at = now()
   where code_hash = r.code_hash;
  return true;
end $$;

create or replace function public.tp_rotate(p_trip text, p_owner text, p_new_code text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare r shared_trips;
begin
  if p_new_code !~ '^[A-Z2-9]{16}$' then raise exception 'bad code'; end if;
  select * into r from shared_trips where trip_id = p_trip for update;
  if not found or _role(r, p_owner) is distinct from 'owner' then return false; end if;
  update shared_trips set invite_hash = _sha(p_new_code), version = r.version + 1, updated_at = now(),
         activity = _act_push(activity, left(_sha(p_owner), 12), 'Invite link was reset')
   where code_hash = r.code_hash;
  return true;
exception when unique_violation then raise exception 'code in use';
end $$;

create or replace function public.tp_invite_role(p_trip text, p_owner text, p_role text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare r shared_trips;
begin
  if p_role not in ('editor', 'viewer') then raise exception 'bad role'; end if;
  select * into r from shared_trips where trip_id = p_trip for update;
  if not found or _role(r, p_owner) is distinct from 'owner' then return false; end if;
  update shared_trips set invite_role = p_role, version = r.version + 1, updated_at = now() where code_hash = r.code_hash;
  return true;
end $$;

create or replace function public.tp_leave(p_trip text, p_member text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare r shared_trips; h text; nm text;
begin
  select * into r from shared_trips where trip_id = p_trip for update;
  if not found then return false; end if;
  h := _sha(p_member);
  if not (r.members ? h) or r.members->h->>'r' = 'owner' then return false; end if;
  nm := r.members->h->>'n';
  update shared_trips set members = members - h,
         activity = _act_push(activity, left(h, 12), nm || ' left'),
         version = r.version + 1, updated_at = now()
   where code_hash = r.code_hash;
  return true;
end $$;

create or replace function public.tp_rename(p_trip text, p_member text, p_name text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare r shared_trips; h text;
begin
  select * into r from shared_trips where trip_id = p_trip for update;
  if not found then return false; end if;
  h := _sha(p_member);
  if not (r.members ? h) then return false; end if;
  update shared_trips set members = jsonb_set(members, array[h, 'n'], to_jsonb(_clean_name(p_name))),
         version = r.version + 1, updated_at = now()
   where code_hash = r.code_hash;
  return true;
end $$;

create or replace function public.tp_delete(p_trip text, p_owner text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare r shared_trips;
begin
  select * into r from shared_trips where trip_id = p_trip for update;
  if not found or _role(r, p_owner) is distinct from 'owner' then return false; end if;
  delete from shared_trips where code_hash = r.code_hash;
  return true;
end $$;

-- ---- legacy functions: trips that were upgraded tell old clients to join as members ----
create or replace function public.share_get(p_code text, p_have bigint default 0)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r shared_trips;
begin
  select * into r from shared_trips where code_hash = _sha(p_code);
  if not found then return jsonb_build_object('missing', true); end if;
  if r.trip_id is not null then return jsonb_build_object('upgraded', true); end if;
  if r.version <= coalesce(p_have, 0) then return null; end if;
  return jsonb_build_object('version', r.version, 'data', r.data, 'updated_at', r.updated_at);
end $$;

create or replace function public.share_put(p_code text, p_base bigint, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r shared_trips;
begin
  if octet_length(p_data::text) > 1500000 then raise exception 'trip too large'; end if;
  select * into r from shared_trips where code_hash = _sha(p_code) for update;
  if not found then return jsonb_build_object('missing', true); end if;
  if r.trip_id is not null then return jsonb_build_object('upgraded', true); end if;
  if r.version <> p_base then
    return jsonb_build_object('conflict', true, 'version', r.version, 'data', r.data);
  end if;
  update shared_trips set data = p_data, version = r.version + 1, updated_at = now() where code_hash = r.code_hash;
  return jsonb_build_object('version', r.version + 1);
end $$;

revoke execute on function
  public.share_v2_create(text, text, text, jsonb), public.share_upgrade(text, text, text, text), public.share_join(text, text, text),
  public.tp_get(text, text, bigint), public.tp_put(text, text, bigint, jsonb, text), public.tp_role(text, text, text, text),
  public.tp_remove(text, text, text), public.tp_rotate(text, text, text), public.tp_invite_role(text, text, text),
  public.tp_leave(text, text), public.tp_rename(text, text, text), public.tp_delete(text, text),
  public._members_out(jsonb), public._clean_name(text), public._act_push(jsonb, text, text),
  public._role(public.shared_trips, text) from public;
grant execute on function
  public.share_v2_create(text, text, text, jsonb), public.share_upgrade(text, text, text, text), public.share_join(text, text, text),
  public.tp_get(text, text, bigint), public.tp_put(text, text, bigint, jsonb, text), public.tp_role(text, text, text, text),
  public.tp_remove(text, text, text), public.tp_rotate(text, text, text), public.tp_invite_role(text, text, text),
  public.tp_leave(text, text), public.tp_rename(text, text, text), public.tp_delete(text, text) to anon, authenticated;

-- tp_claim (added in a follow-up migration) uses the same owner check:
--   if not found or _role(r, p_owner) is distinct from 'owner' then return false; end if;
