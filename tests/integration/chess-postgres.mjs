// Isolated disposable PostgreSQL, no host ports or production credentials.
// Requires Docker and the local postgres:17-alpine image. Run with node.
import { spawnSync, spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const name = `chess-test-${process.pid}`
const docker = args => spawnSync('docker', args, { encoding: 'utf8' })
function sql(query, ok = true) {
  const r = docker(['exec', '-i', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atc', query])
  if (ok) assert.equal(r.status, 0, r.stderr)
  else assert.notEqual(r.status, 0, `Unexpected success: ${query}`)
  return r.stdout.trim()
}
const white = '11111111-1111-4111-8111-111111111111'
const black = '22222222-2222-4222-8222-222222222222'
const outsider = '33333333-3333-4333-8333-333333333333'
const asUser = (id, query) => `set role authenticated; set request.jwt.claim.sub='${id}'; ${query}`
const parallelSql = query => new Promise(resolve => {
  const child = spawn('docker', ['exec', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atc', query])
  child.stdout.resume(); child.stderr.resume(); child.on('close', resolve)
})
try {
  assert.equal(docker(['run', '--rm', '-d', '--name', name, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:17-alpine']).status, 0)
  for (let n = 0; n < 60; n++) {
    if (docker(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']).status === 0) break
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  sql(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    insert into auth.users values ('${white}'),('${black}'),('${outsider}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    grant usage on schema auth to authenticated, anon, service_role;
    grant execute on function auth.uid() to authenticated, anon, service_role;
    create publication supabase_realtime;`)
  const schema = readFileSync('supabase/schema.sql', 'utf8').split('-- BEGIN CHESS')[1]?.split('-- END CHESS')[0]
  assert.ok(schema, 'Additive Chess section is missing (RED)')
  sql(schema); sql(schema) // Existing installations can reapply safely.
  sql('set role anon; select public.create_chess_game()', false)
  sql('set role authenticated; select public.create_chess_game()', false)
  const room = sql(asUser(white, 'select id from public.create_chess_game()')).split('\n').at(-1)
  assert.match(room, /^[0-9a-f-]{36}$/)
  assert.equal(sql(asUser(outsider, 'select count(*) from public.chess_games')).split('\n').at(-1), '0')
  sql(asUser(white, `select public.join_chess_game('${room}')`))
  assert.equal(sql(`select black_id is null from public.chess_games where id='${room}'`), 't')
  const joined = await Promise.all([black, outsider].map(id => parallelSql(asUser(id, `select public.join_chess_game('${room}')`))))
  assert.equal(joined.filter(code => code === 0).length, 1, 'Only one player may take Black')
  const seated = sql(`select black_id from public.chess_games where id='${room}'`)
  const rejected = seated === black ? outsider : black
  sql(asUser(rejected, `select public.join_chess_game('${room}')`), false)
  sql(asUser(white, `update public.chess_games set fen='forged' where id='${room}'`), false)
  sql(asUser(white, `insert into public.chess_games(white_id) values ('${white}')`), false)
  const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
  const after = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
  const commit = (actor = white, expected = 0) => `select public.commit_chess_move('${room}','${actor}',${expected},'${start}','${after}','e4','b','active',null)`
  sql(asUser(white, commit()), false)
  sql(`set role anon; ${commit()}`, false)
  sql(`set role service_role; ${commit(seated)}`, false)
  sql(`set role service_role; ${commit(rejected)}`, false)
  const committed = await Promise.all([1, 2].map(() => parallelSql(`set role service_role; ${commit()}`)))
  assert.equal(committed.filter(code => code === 0).length, 1, 'Only one concurrent move may commit')
  assert.equal(sql(`select move_count || ':' || array_length(moves,1) from public.chess_games where id='${room}'`), '1:1')
  sql(`set role service_role; ${commit()}`, false)
  sql(`update public.chess_games set status='checkmate',result='white' where id='${room}'`)
  sql(asUser(white, `select public.join_chess_game('${room}')`))
  sql(`set role service_role; select public.commit_chess_move('${room}','${seated}',1,'${after}','${start}','e5','w','active',null)`, false)
  assert.equal(sql(asUser(rejected, 'select count(*) from public.chess_games')).split('\n').at(-1), '0')
  assert.equal(sql("select count(*) from pg_publication_tables where pubname='supabase_realtime' and tablename='chess_games'"), '1')
  console.log('PASS: SQL applies twice; auth/create/join/self-join/RLS/direct-write denial/service-only commit/turn/parallel CAS/completed reopen/realtime publication')
} finally { docker(['rm', '-f', name]) }
