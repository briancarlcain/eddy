// Crew sync client. A shared trip lives in one server row addressed by an unguessable
// 16-character join code; there are no accounts. The server only ever sees the code's
// hash (see the shared_trips functions in supabase/migrations). Merging happens on the
// device (merge.js); the server just stores versions and rejects stale writes.
const BASE = 'https://nhplgoetehrydaeoyrgz.supabase.co/rest/v1/rpc';
export const API_KEY = 'sb_publishable_eJ0X3vnbOK09gLhPigYiSQ_TWnyQrk3'; // publishable by design; safe to ship
const KEY = API_KEY;

// signed-in requests carry the user's access token; set by auth.js
let tokenFn = async () => null;
export const setTokenSource = (fn) => (tokenFn = fn);

export const SYNC_ORIGIN = 'https://nhplgoetehrydaeoyrgz.supabase.co';

async function rpc(fn, body) {
  const r = await fetch(`${BASE}/${fn}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${(await tokenFn()) || KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  const json = text ? JSON.parse(text) : null;
  if (!r.ok) {
    const e = new Error((json && json.message) || `HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return json;
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/1/I/O; all valid for the server's [A-Z2-9] check
const random = (n, alphabet) => {
  const limit = 256 - (256 % alphabet.length); // reject biased bytes
  let out = '';
  while (out.length < n) {
    const buf = new Uint8Array(n * 2);
    crypto.getRandomValues(buf);
    for (const b of buf) if (b < limit && out.length < n) out += alphabet[b % alphabet.length];
  }
  return out;
};
export const newCode = () => random(16, ALPHABET);
export const newSecret = () => random(32, ALPHABET + ALPHABET.toLowerCase());

// "abcd-efgh ..." -> "ABCDEFGH..." ; returns '' unless it looks like a join code
export const cleanCode = (s) => {
  const c = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-Z2-9]{16}$/.test(c) ? c : '';
};
export const showCode = (c) => c.replace(/(.{4})(?=.)/g, '$1-');

export const create = (code, owner, data) => rpc('share_create', { p_code: code, p_owner: owner, p_data: data });
export const get = (code, have) => rpc('share_get', { p_code: code, p_have: have || 0 });
export const put = (code, base, data) => rpc('share_put', { p_code: code, p_base: base, p_data: data });
export const del = (code, owner) => rpc('share_delete', { p_code: code, p_owner: owner });

// ---- account functions (signed-in users only) ----
export const claim = (code, owner) => rpc('share_claim', { p_code: code, p_owner: owner });
export const acctList = () => rpc('acct_list', {});
export const acctGet = (id, have) => rpc('acct_get', { p_trip: id, p_have: have || 0 });
export const acctPut = (id, base, data, share = null) => rpc('acct_put', { p_trip: id, p_base: base, p_data: data, p_share: share });
export const acctDelete = (id) => rpc('acct_delete', { p_trip: id });
export const deleteMe = () => rpc('delete_my_account', {});

// ---- members (v2): a trip has a private id; people are members with a per-device secret ----
export const v2Create = (code, member, name, data) => rpc('share_v2_create', { p_code: code, p_member: member, p_name: name, p_data: data });
export const v2Upgrade = (code, owner, member, name) => rpc('share_upgrade', { p_code: code, p_owner: owner || null, p_member: member, p_name: name });
export const v2Join = (invite, member, name) => rpc('share_join', { p_invite: invite, p_member: member, p_name: name });
export const v2Get = (trip, member, have) => rpc('tp_get', { p_trip: trip, p_member: member, p_have: have || 0 });
export const v2Put = (trip, member, base, data, note) => rpc('tp_put', { p_trip: trip, p_member: member, p_base: base, p_data: data, p_note: note || null });
export const v2Role = (trip, owner, target, role) => rpc('tp_role', { p_trip: trip, p_owner: owner, p_target: target, p_role: role });
export const v2Remove = (trip, owner, target) => rpc('tp_remove', { p_trip: trip, p_owner: owner, p_target: target });
export const v2Rotate = (trip, owner, newCode) => rpc('tp_rotate', { p_trip: trip, p_owner: owner, p_new_code: newCode });
export const v2InviteRole = (trip, owner, role) => rpc('tp_invite_role', { p_trip: trip, p_owner: owner, p_role: role });
export const v2Leave = (trip, member) => rpc('tp_leave', { p_trip: trip, p_member: member });
export const v2Rename = (trip, member, name) => rpc('tp_rename', { p_trip: trip, p_member: member, p_name: name });
export const v2Delete = (trip, owner) => rpc('tp_delete', { p_trip: trip, p_owner: owner });
export const v2Claim = (trip, owner) => rpc('tp_claim', { p_trip: trip, p_owner: owner });
export const v2Peek = (invite) => rpc('share_peek', { p_invite: invite });
