import { ref } from 'vue'
import type { Conversation, Profile } from '~/types/chat'
import type { StreetParticipant, StreetStatus, StreetTeaNotice } from '~/types/street'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function validIdentity(value: any): boolean {
  return typeof value?.display_name === 'string' && value.display_name.trim().length > 0 && value.display_name.length <= 80
    && !/[\u0000-\u001f\u007f]/.test(value.display_name)
    && typeof value.avatar_color === 'string' && /^#[\da-f]{6}$/i.test(value.avatar_color)
}

export function createStreetRoom(client: any, options: { getProfile: () => Profile | null; getConversation: () => Conversation | null }) {
  const participants = ref<StreetParticipant[]>([])
  const joined = ref(false)
  const status = ref<StreetStatus>('idle')
  const error = ref<string | null>(null)
  const teaNotice = ref<StreetTeaNotice | null>(null)
  let channel: any = null
  let canAct = () => false
  let pending: Promise<void> | null = null
  let finish: (() => void) | null = null
  let removal = Promise.resolve()
  let generation = 0

  function remove(ch: any) {
    removal = removal.then(() => client.removeChannel(ch)).then(() => {}).catch(() => {})
    return removal
  }

  async function leave() {
    generation++
    const old = channel
    channel = null
    finish?.()
    pending = null
    joined.value = false
    participants.value = []
    teaNotice.value = null
    status.value = 'idle'
    error.value = null
    if (old) await remove(old)
    else await removal
  }

  function join(): Promise<void> {
    if (pending) return pending
    if (joined.value) return Promise.resolve()
    const profile = options.getProfile()
    const conversation = options.getConversation()
    if (!profile || !UUID.test(profile.id) || !validIdentity(profile) || !UUID.test(conversation?.id ?? '') || conversation?.type !== 'group' || !conversation.members?.some(member => member.user_id === profile.id)) {
      status.value = 'error'
      error.value = 'Join an active group you belong to.'
      return Promise.resolve()
    }
    status.value = 'connecting'
    error.value = null
    const epoch = generation
    pending = new Promise<void>(resolve => { finish = resolve })
    const result = pending
    const active = () => generation === epoch && options.getProfile()?.id === profile.id
      && options.getConversation()?.id === conversation.id && options.getConversation()?.type === 'group'
      && !!options.getConversation()?.members?.some(member => member.user_id === profile.id)
    const failSetup = () => {
      if (generation !== epoch) return
      const old = channel
      channel = null
      finish?.()
      finish = null
      pending = null
      joined.value = false
      participants.value = []
      teaNotice.value = null
      status.value = 'error'
      error.value = 'Street connection failed. Please retry.'
      if (old) void remove(old)
    }
    void (async () => {
      await removal
      if (generation !== epoch) return
      if (!active()) { failSetup(); return }
      const session_id = crypto.randomUUID()
      const ch = client.channel(`street:${conversation.id}`, { config: { private: true, broadcast: { ack: true, self: false }, presence: { key: session_id } } })
      channel = ch
      canAct = active
      const syncPresence = () => {
        if (channel !== ch || !joined.value || !active()) return
        const members = new Set(options.getConversation()?.members?.map(member => member.user_id))
        const users = new Map<string, StreetParticipant>()
        let scanned = 0
        for (const entries of Object.values(ch.presenceState()).slice(0, 512)) {
          if (!Array.isArray(entries)) continue
          for (const value of entries.slice(0, 32)) {
            if (++scanned > 2048) break
            if (!value || !members.has(value.user_id) || !UUID.test(value.session_id)
              || typeof value.display_name !== 'string' || !value.display_name.trim() || value.display_name.length > 80
              || typeof value.avatar_color !== 'string' || !/^#[\da-f]{6}$/i.test(value.avatar_color)) continue
            const previous = users.get(value.user_id)
            if (!previous || value.session_id < previous.session_id) users.set(value.user_id, {
              user_id: value.user_id, session_id: value.session_id, display_name: value.display_name,
              avatar_color: value.avatar_color, seat: 0,
            })
          }
        }
        participants.value = [...users.values()].sort((a, b) => a.user_id < b.user_id ? -1 : 1).map((user, seat) => ({ ...user, seat }))
      }
      ch.on('presence', { event: 'sync' }, syncPresence)
      const seenTea = new Set<string>()
      const receivedAt = new Map<string, number>()
      ch.on('broadcast', { event: 'tea' }, (message: any) => {
        if (channel !== ch || !joined.value || !active()) return
        const value = message?.payload
        const now = Date.now()
        if (!value || Object.keys(value).length !== 3 || !UUID.test(value.id) || !UUID.test(value.user_id)
          || !Number.isSafeInteger(value.at) || Math.abs(now - value.at) > 15000
          || !options.getConversation()?.members?.some(member => member.user_id === value.user_id)
          || !participants.value.some(user => user.user_id === value.user_id)
          || seenTea.has(value.id) || now - (receivedAt.get(value.user_id) ?? -Infinity) < 3000) return
        receivedAt.set(value.user_id, now)
        seenTea.add(value.id)
        if (seenTea.size > 256) seenTea.delete(seenTea.values().next().value!)
        if (receivedAt.size > 512) receivedAt.delete(receivedAt.keys().next().value!)
        teaNotice.value = { user_id: value.user_id, id: value.id, at: value.at }
      })
      let timer: ReturnType<typeof setTimeout> | null = null
      const settle = () => {
        if (timer) clearTimeout(timer)
        timer = null
        finish?.()
        finish = null
        pending = null
      }
      const fail = (message: string) => {
        if (channel !== ch) return
        channel = null
        joined.value = false
        participants.value = []
        teaNotice.value = null
        status.value = 'error'
        error.value = message
        settle()
        void remove(ch)
      }
      timer = setTimeout(() => fail('Street connection timed out. Please retry.'), 10000)
      const resolveJoin = finish!
      finish = () => { if (timer) clearTimeout(timer); timer = null; resolveJoin() }
      let tracking = false
      ch.subscribe(async (state: string) => {
        if (channel !== ch) return
        if (!active()) { fail('Street group changed. Please rejoin.'); return }
        if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(state)) {
          fail('Street connection failed. Please retry.')
          return
        }
        if (state !== 'SUBSCRIBED' || tracking || joined.value) return
        tracking = true
        try {
          const tracked = await ch.track({ user_id: profile.id, display_name: profile.display_name, avatar_color: profile.avatar_color, session_id })
          if (channel !== ch) return
          if (!active()) { fail('Street group changed. Please rejoin.'); return }
          if (tracked !== 'ok') throw new Error('Presence rejected')
          joined.value = true
          status.value = 'connected'
          syncPresence()
          settle()
        } catch {
          fail('Street presence failed. Please retry.')
        }
      })
    })().catch(failSetup)
    return result
  }

  let lastInvite = -Infinity
  async function inviteTea() {
    const ch = channel
    const profile = options.getProfile()
    const conversation = options.getConversation()
    const now = Date.now()
    if (!ch || !joined.value || !profile || !canAct()
      || conversation?.type !== 'group' || !conversation.members?.some(member => member.user_id === profile.id)
      || now - lastInvite < 3000) return
    lastInvite = now
    const payload = { user_id: profile.id, id: crypto.randomUUID(), at: now }
    try {
      const result = await ch.send({ type: 'broadcast', event: 'tea', payload })
      if (channel !== ch || !canAct()) return
      if (result !== 'ok') throw new Error('Tea invitation rejected')
      teaNotice.value = payload
    } catch {
      if (channel === ch) error.value = 'Tea invitation failed. Please retry.'
    }
  }

  return { participants, joined, status, error, teaNotice, join, leave, inviteTea }
}
