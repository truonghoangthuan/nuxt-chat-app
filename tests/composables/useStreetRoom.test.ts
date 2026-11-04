import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import type { Conversation, Profile } from '~/types/chat'

const roomId = '11111111-1111-4111-8111-111111111111'
const me = '22222222-2222-4222-8222-222222222222'
const peer = '33333333-3333-4333-8333-333333333333'
const profile = { id: me, display_name: 'Mai', avatar_color: '#abcdef', email: 'private@example.com' } as Profile
function setup() {
  let currentProfile: Profile | null = profile
  let conversation: Conversation | null = {
    id: roomId, type: 'group', members: [me, peer].map(user_id => ({ user_id, conversation_id: roomId, role: 'member', joined_at: '' })),
  } as Conversation
  const channels: any[] = []
  const client = {
    channel: vi.fn((topic, config) => {
      const handlers: any[] = []
      const ch: any = { topic, config, handlers, state: {},
        on: vi.fn((type, filter, fn) => { handlers.push({ type, filter, fn }); return ch }),
        subscribe: vi.fn(fn => { ch.notify = fn; return ch }),
        track: vi.fn(async () => 'ok'), send: vi.fn(async () => 'ok'),
        presenceState: () => ch.state,
        emit: (type: string, event: string, payload?: unknown) => handlers.filter(h => h.type === type && h.filter.event === event).forEach(h => h.fn(payload)),
      }
      channels.push(ch)
      return ch
    }),
    removeChannel: vi.fn(async () => 'ok'),
  }
  return { client, channels, options: { getProfile: () => currentProfile, getConversation: () => conversation },
    setConversation: (value: Conversation | null) => { conversation = value },
    setProfile: (value: Profile | null) => { currentProfile = value },
  }
}
async function factory() { return (await import('~/composables/useStreetRoom')).createStreetRoom }
const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('street room', () => {
  it.skipIf(!process.env.STREET_PGLITE_MODULE)('authorizes exact group topics in local PostgreSQL, twice, even with broad legacy grants', async () => {
    const { PGlite } = await import(/* @vite-ignore */ process.env.STREET_PGLITE_MODULE!)
    const db = new PGlite()
    try {
      await db.exec(`
        create role authenticated; create role anon;
        create schema auth; create schema realtime;
        create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
        create function auth.role() returns text language sql stable as $$ select current_setting('test.role', true) $$;
        create function realtime.topic() returns text language sql stable as $$ select current_setting('test.topic', true) $$;
        create table public.conversations(id uuid primary key, type text);
        create table public.conversation_members(conversation_id uuid, user_id uuid);
        create function public.can_access_conversation(cid uuid) returns boolean language sql stable security definer as $$ select exists(select 1 from public.conversation_members where conversation_id = cid and user_id = auth.uid()) $$;
        create table realtime.messages(topic text, extension text);
        alter table realtime.messages enable row level security;
        grant usage on schema realtime, auth, public to authenticated, anon;
        grant select on public.conversations to authenticated, anon;
        grant select, insert on realtime.messages to authenticated, anon;
        create policy legacy_read on realtime.messages for select using (true);
        create policy legacy_write on realtime.messages for insert with check (true);
        insert into public.conversations values ('${roomId}', 'group'), ('${peer}', 'direct');
        insert into public.conversation_members values ('${roomId}', '${me}'), ('${peer}', '${me}');
        insert into realtime.messages values ('irrelevant', 'presence'), ('irrelevant', 'broadcast'), ('irrelevant', 'other');
      `)
      expect(existsSync('supabase/migrations/202611040001_street_realtime_authorization.sql')).toBe(true)
      const migration = readFileSync('supabase/migrations/202611040001_street_realtime_authorization.sql', 'utf8')
      expect(migration).not.toMatch(/alter\s+table\s+realtime\.messages/i)
      await db.exec(migration)
      await db.exec(migration)
      for (const [role, user, topic, allowed] of [
        ['authenticated', me, `street:${roomId}`, true],
        ['authenticated', peer, `street:${roomId}`, false],
        ['authenticated', me, `street:${peer}`, false],
        ['authenticated', me, `street:${roomId}:extra`, false],
        ['authenticated', me, 'street:not-a-uuid', false],
        ['authenticated', me, 'street:', false],
        ['anon', '', `street:${roomId}`, false],
      ] as const) {
        await db.exec(`set role ${role}; set test.uid='${user}'; set test.role='${role}'; set test.topic='${topic}';`)
        const result = await db.query('select extension from realtime.messages')
        expect(result.rows.length, `${role}/${user}/${topic}`).toBe(allowed ? 2 : 0)
        for (const extension of ['presence', 'broadcast']) {
          const insert = db.exec(`insert into realtime.messages values ('${topic}', '${extension}')`)
          if (allowed) await insert
          else await expect(insert).rejects.toThrow(/row-level security/)
        }
        await db.exec('reset role; delete from realtime.messages where topic <> \'irrelevant\';')
      }
      await db.exec(`set role anon; set test.topic='typing:${roomId}';`)
      expect((await db.query('select * from realtime.messages')).rows).toHaveLength(3)
      await db.exec(`insert into realtime.messages values ('typing:${roomId}', 'broadcast')`)
      await db.exec(`reset role; drop policy legacy_read on realtime.messages; drop policy legacy_write on realtime.messages;
        set role authenticated; set test.uid='${me}'; set test.role='authenticated'; set test.topic='street:${roomId}';`)
      expect((await db.query('select * from realtime.messages')).rows).toHaveLength(3)
      await db.exec(`insert into realtime.messages values ('street:${roomId}', 'presence')`)
      await db.exec(`set test.topic='typing:${roomId}'`)
      expect((await db.query('select * from realtime.messages')).rows).toHaveLength(0)
    } finally { await db.close() }
  }, 30000)

  it('coalesces joins on a private channel and tracks only public identity after subscribing', async () => {
    const s = setup()
    const room = (await factory())(s.client, s.options)
    const first = room.join()
    const second = room.join()
    await tick()
    expect(s.channels).toHaveLength(1)
    const ch = s.channels[0]
    expect(ch.topic).toBe(`street:${roomId}`)
    expect(ch.config.config).toMatchObject({ private: true, broadcast: { ack: true, self: false } })
    expect(ch.config.config.presence.key).toMatch(/^[\da-f-]{36}$/i)
    expect(ch.track).not.toHaveBeenCalled()
    ch.notify('SUBSCRIBED')
    await Promise.all([first, second])
    expect(room.status.value).toBe('connected')
    expect(room.joined.value).toBe(true)
    expect(ch.track).toHaveBeenCalledWith({ user_id: me, display_name: 'Mai', avatar_color: '#abcdef', session_id: ch.config.config.presence.key })
    await room.leave()
    expect(room.status.value).toBe('idle')
    expect(room.joined.value).toBe(false)
    expect(s.client.removeChannel).toHaveBeenCalledWith(ch)
  })
  it('validates and bounds presence, deduplicates tabs and assigns deterministic overflow seats', async () => {
    const s = setup()
    const room = (await factory())(s.client, s.options)
    const joining = room.join()
    await tick()
    const ch = s.channels[0]
    ch.notify('SUBSCRIBED')
    await joining
    const item = (user_id: string, session_id: string, extra = {}) => ({ user_id, session_id, display_name: 'Peer', avatar_color: '#123456', ...extra })
    const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    ch.state = { [b]: [item(peer, b)], [a]: [item(peer, a)], local: [item(me, a)], bad: [item('outsider', a), item(me, a, { display_name: 'x'.repeat(81) })] }
    ch.emit('presence', 'sync')
    expect(room.participants.value.map(p => [p.user_id, p.session_id, p.seat])).toEqual([[me, a, 0], [peer, a, 1]])
    expect(Object.keys(room.participants.value[0]!).sort()).toEqual(['avatar_color', 'display_name', 'seat', 'session_id', 'user_id'])
    ch.state = { only: [item(peer, b, { avatar_color: 'url(evil)' })] }
    ch.emit('presence', 'sync')
    expect(room.participants.value).toEqual([])
    await room.leave()
  })

  it.each(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED', 'track-error', 'track-reject', 'timeout'])('cleans up %s without public fallback and permits explicit retry', async failure => {
    vi.useFakeTimers()
    const s = setup()
    const room = (await factory())(s.client, s.options)
    const joining = room.join()
    await tick()
    const ch = s.channels[0]
    if (failure === 'track-error') ch.track.mockResolvedValueOnce('error')
    if (failure === 'track-reject') ch.track.mockRejectedValueOnce(new Error('denied'))
    if (failure.startsWith('track')) ch.notify('SUBSCRIBED')
    else if (failure === 'timeout') await vi.advanceTimersByTimeAsync(12000)
    else ch.notify(failure)
    await tick()
    expect(room.status.value).toBe('error')
    await joining
    expect(room.joined.value).toBe(false)
    expect(room.participants.value).toEqual([])
    expect(s.client.removeChannel).toHaveBeenCalledWith(ch)
    expect(s.channels).toHaveLength(1)
    const retry = room.join()
    await tick()
    s.channels[1].notify('SUBSCRIBED')
    await retry
    expect(room.joined.value).toBe(true)
    await room.leave()
  })

  it('waits for channel removal before a replacement and ignores old track completions', async () => {
    const s = setup()
    const room = (await factory())(s.client, s.options)
    let completeTrack!: (value: string) => void
    let completeRemoval!: () => void
    const joining = room.join()
    await tick()
    const old = s.channels[0]
    old.track.mockImplementationOnce(() => new Promise(resolve => { completeTrack = resolve }))
    old.notify('SUBSCRIBED')
    s.client.removeChannel.mockImplementationOnce(() => new Promise<string>(resolve => { completeRemoval = () => resolve('ok') }))
    const leaving = room.leave()
    await joining
    const next = room.join()
    await tick()
    expect(s.channels).toHaveLength(1)
    completeTrack('ok')
    old.notify('CHANNEL_ERROR')
    await tick()
    expect(room.joined.value).toBe(false)
    completeRemoval()
    await leaving
    await tick()
    expect(s.channels).toHaveLength(2)
    s.channels[1].notify('SUBSCRIBED')
    await next
    expect(room.status.value).toBe('connected')
    await room.leave()
  })

  it.each(['subscribe', 'channel', 'switch', 'invalid-id', 'invalid-profile'])('fails closed for %s during join', async failure => {
    const s = setup()
    if (failure === 'channel') s.client.channel.mockImplementationOnce(() => { throw new Error('offline') })
    if (failure === 'invalid-id') s.setConversation({ ...s.options.getConversation()!, id: 'not-uuid' })
    if (failure === 'invalid-profile') s.setProfile({ ...profile, avatar_color: 'red;bad', display_name: 'x'.repeat(81) })
    const room = (await factory())(s.client, s.options)
    if (failure === 'subscribe') {
      const original = s.client.channel.getMockImplementation()!
      s.client.channel.mockImplementationOnce((topic, config) => {
        const ch = original(topic, config)
        ch.subscribe.mockImplementationOnce(() => { throw new Error('offline') })
        return ch
      })
    }
    const joining = room.join()
    await tick()
    if (failure === 'switch') {
      s.setConversation(null)
      s.channels[0].notify('SUBSCRIBED')
      await tick()
      expect(s.channels[0].track).not.toHaveBeenCalled()
    }
    expect(room.status.value).toBe('error')
    await joining
    expect(room.joined.value).toBe(false)
    if (failure.startsWith('invalid')) expect(s.channels).toHaveLength(0)
    await room.leave()
  })

  it('sends bounded tea events only while joined and rate limits local invitations', async () => {
    vi.useFakeTimers()
    const s = setup()
    const room = (await factory())(s.client, s.options)
    await room.inviteTea()
    const joining = room.join()
    await tick()
    const ch = s.channels[0]
    ch.topic = `realtime:street:${roomId}`
    ch.notify('SUBSCRIBED')
    await joining
    await room.inviteTea()
    expect(ch.send).toHaveBeenCalledTimes(1)
    const sent = ch.send.mock.calls[0][0]
    expect(sent).toMatchObject({ type: 'broadcast', event: 'tea', payload: { user_id: me, at: Date.now() } })
    expect(Object.keys(sent.payload).sort()).toEqual(['at', 'id', 'user_id'])
    expect(room.teaNotice.value).toEqual(sent.payload)
    await room.inviteTea()
    expect(ch.send).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(3000)
    await room.inviteTea()
    expect(ch.send).toHaveBeenCalledTimes(2)
    await room.leave()
    await room.inviteTea()
    expect(ch.send).toHaveBeenCalledTimes(2)
  })

  it('accepts only fresh validated tea from current participants and bounds receiver rate', async () => {
    vi.useFakeTimers()
    const s = setup()
    const room = (await factory())(s.client, s.options)
    const joining = room.join()
    await tick()
    const ch = s.channels[0]
    ch.notify('SUBSCRIBED')
    await joining
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const payload = { id, user_id: peer, at: Date.now() }
    ch.emit('broadcast', 'tea', { payload })
    expect(room.teaNotice.value).toBeNull()
    ch.state = { peer: [{ ...payload, session_id: id, display_name: 'Peer', avatar_color: '#123456' }] }
    ch.emit('presence', 'sync')
    for (const bad of [{ ...payload, user_id: 'outsider' }, { ...payload, at: 0 }, { ...payload, id: 'x'.repeat(100) }, { ...payload, content: 'plaintext' }]) {
      ch.emit('broadcast', 'tea', { payload: bad })
      expect(room.teaNotice.value).toBeNull()
    }
    ch.emit('broadcast', 'tea', { payload })
    expect(room.teaNotice.value).toEqual(payload)
    ch.emit('broadcast', 'tea', { payload: { ...payload, id: roomId } })
    expect(room.teaNotice.value?.id).toBe(id)
    await vi.advanceTimersByTimeAsync(3000)
    ch.emit('broadcast', 'tea', { payload })
    expect(room.teaNotice.value?.id).toBe(id)
    ch.emit('broadcast', 'tea', { payload: { ...payload, id: roomId, at: Date.now() } })
    expect(room.teaNotice.value?.id).toBe(roomId)
    await room.leave()
  })

  it('hydrates initial presence after tracking and does not retrack duplicate subscribe callbacks', async () => {
    const s = setup()
    const room = (await factory())(s.client, s.options)
    const joining = room.join()
    await tick()
    const ch = s.channels[0]
    ch.state = { peer: [{ user_id: peer, session_id: roomId, display_name: 'Peer', avatar_color: '#123456' }] }
    ch.emit('presence', 'sync')
    ch.notify('SUBSCRIBED')
    ch.notify('SUBSCRIBED')
    await joining
    expect(room.participants.value).toHaveLength(1)
    expect(ch.track).toHaveBeenCalledTimes(1)
    ch.notify('SUBSCRIBED')
    await tick()
    expect(ch.track).toHaveBeenCalledTimes(1)
    ch.notify('CHANNEL_ERROR')
    expect(room.participants.value).toEqual([])
    ch.emit('presence', 'sync')
    expect(room.participants.value).toEqual([])
    await room.leave()
  })

  it.each(['track', 'send'])('discards late %s completion after the active conversation changes', async operation => {
    const s = setup()
    const room = (await factory())(s.client, s.options)
    const joining = room.join()
    await tick()
    const ch = s.channels[0]
    let resolve!: (value: string) => void
    ch[operation].mockImplementationOnce(() => new Promise(done => { resolve = done }))
    ch.notify('SUBSCRIBED')
    let sending: Promise<void> | undefined
    if (operation === 'send') { await joining; sending = room.inviteTea() }
    s.setConversation(null)
    resolve('ok')
    await tick()
    if (operation === 'track') {
      expect(room.joined.value).toBe(false)
      expect(room.status.value).toBe('error')
      await joining
    } else {
      await sending
      expect(room.teaNotice.value).toBeNull()
    }
    await room.leave()
  })

  it('starts inert and rejects joins without current group membership', async () => {
    const create = await factory()
    const s = setup()
    const room = create(s.client, s.options)
    expect(room.status.value).toBe('idle')
    expect(room.joined.value).toBe(false)
    expect(room.participants.value).toEqual([])
    expect(s.client.channel).not.toHaveBeenCalled()
    s.setConversation(null)
    await room.join()
    expect(room.status.value).toBe('error')
    s.setConversation({ id: roomId, type: 'direct' } as Conversation)
    await room.join()
    s.setConversation({ id: roomId, type: 'group', members: [] } as unknown as Conversation)
    await room.join()
    expect(s.client.channel).not.toHaveBeenCalled()
  })
})
