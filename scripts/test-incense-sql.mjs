// Run with PGLITE_MODULE pointing to a scratch-installed @electric-sql/pglite/dist/index.js.
// Fixture auth/schema only: does not claim live Supabase/PostgREST verification.
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE).href)
const db = new PGlite()
const actor = '00000000-0000-4000-8000-000000000001'
const peer = '00000000-0000-4000-8000-000000000002'
const outsider = '00000000-0000-4000-8000-000000000003'
const room = '00000000-0000-4000-8000-000000000011'
const other = '00000000-0000-4000-8000-000000000012'
const request = '00000000-0000-4000-8000-000000000021'
await db.exec(`create role anon; create role authenticated; create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
create table public.profiles(id uuid primary key, display_name text not null);
create table public.conversations(id uuid primary key);
create table public.conversation_members(conversation_id uuid references conversations, user_id uuid references profiles, primary key(conversation_id,user_id));
create function public.can_access_conversation(cid uuid) returns boolean language sql security definer set search_path=public as $$ select exists(select 1 from conversation_members where conversation_id=cid and user_id=auth.uid()) $$;
insert into profiles values('${actor}','An'),('${peer}','Bình'),('${outsider}','Outside');
insert into conversations values('${room}'),('${other}');
insert into conversation_members values('${room}','${actor}'),('${room}','${peer}'),('${other}','${actor}');`)
const sql = await readFile(new URL('../supabase/migrations/202611040002_incense_activity.sql', import.meta.url), 'utf8')
await db.exec(sql)
await db.exec(sql) // idempotent deployment
async function asUser(id, query) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${id}',false)`)
  try { return await db.query(query) } finally { await db.exec('reset role') }
}
const record = (r = room, c = request) => `select public.offer_incense('${r}','${c}') as event`
const first = (await asUser(actor, record())).rows[0].event
assert.equal(first.user_id, actor)
assert.equal(first.actor.display_name, 'An')
assert.equal((await asUser(actor, record())).rows[0].event.id, first.id)
assert.equal((await asUser(peer, `select public.list_incense_events('${room}') as events`)).rows[0].events.length, 1)
await assert.rejects(asUser(outsider, record()), /member/i)
await assert.rejects(asUser('', record()), /member/i)
await assert.rejects(asUser(outsider, `select public.list_incense_events('${room}')`), /member/i)
assert.equal((await asUser(outsider, 'select * from public.incense_events')).rows.length, 0)
await assert.rejects(asUser(actor, `insert into public.incense_events(conversation_id,user_id,client_id) values('${room}','${peer}',gen_random_uuid())`), /permission denied/i)
await assert.rejects(asUser(actor, record(other)), /client id/i)
await assert.rejects(asUser(actor, record(room, '00000000-0000-4000-8000-000000000022')), /cooldown/i)
await assert.rejects(asUser(actor, `select public.offer_incense('${room}',null)`), /client id/i)
await db.exec(`delete from conversation_members where user_id='${actor}' and conversation_id='${room}'`)
await assert.rejects(asUser(actor, record()), /member/i)
await assert.rejects(asUser(peer, record()), /client id/i)
await assert.rejects(asUser(peer, 'update public.incense_events set created_at=clock_timestamp()'), /permission denied/i)
await assert.rejects(asUser(peer, 'delete from public.incense_events'), /permission denied/i)
await db.exec('set role anon')
await assert.rejects(db.query(record()), /permission denied/i)
await assert.rejects(db.query(`select public.list_incense_events('${room}')`), /permission denied/i)
await assert.rejects(db.query('select * from public.incense_events'), /permission denied/i)
await db.exec('reset role')
console.log('PASS: migration twice; actor derived; duplicate stable; member history; anonymous/nonmember read/write denial; RLS; forged direct insert/update/delete denied; cross-room/cross-actor retry rejected; cooldown; null UUID; revoked membership.')
await db.close()
