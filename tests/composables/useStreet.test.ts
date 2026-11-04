import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import type { ChatMessage, Conversation, Profile } from '~/types/chat'

const room = vi.hoisted(() => ({ value: null as any }))
vi.mock('~/composables/useStreetRoom', () => ({ createStreetRoom: () => room.value }))
import { useStreet } from '~/composables/useStreet'

function setup() {
  const current = ref<Profile>({ id: 'self', email: '', display_name: 'Phát', avatar_color: '#556677' })
  const conversation = ref<Conversation | null>({ id: 'group', type: 'group', title: 'Bạn', created_by: 'self', created_at: '', members: [{ user_id: 'self', conversation_id: 'group', role: 'owner', joined_at: '' }] })
  const messages = ref<ChatMessage[]>([])
  const loading = ref(false)
  const visible = ref(true)
  room.value = { joined: ref(false), participants: ref([{ user_id: 'self' }]), status: ref('idle'), error: ref(null), teaNotice: ref(null), join: vi.fn(), leave: vi.fn().mockImplementation(async () => { room.value.joined.value = false }), inviteTea: vi.fn() }
  vi.stubGlobal('useSupabaseClient', () => ({}))
  const scope = effectScope()
  const street = scope.run(() => useStreet(conversation, current, messages, loading, visible))!
  return { scope, street, conversation, current, messages, loading, visible }
}
function message(id: string, content: string): ChatMessage {
  return { id, client_id: id, conversation_id: 'group', user_id: 'self', content, created_at: new Date().toISOString(), status: 'sent', encryption: 'e2ee' }
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
describe('useStreet integration lifecycle', () => {
  it('shows only new decryptable text from seated people and expires it without replaying history', async () => {
    vi.useFakeTimers()
    const state = setup()
    state.messages.value = [message('history', 'Old story')]
    room.value.joined.value = true
    await nextTick()
    expect(state.street.speech.value).toEqual({})
    state.messages.value = [...state.messages.value, message('new', 'Chào cả bàn')]
    await nextTick()
    expect(state.street.speech.value).toEqual({ self: 'Chào cả bàn' })
    await vi.advanceTimersByTimeAsync(6000)
    expect(state.street.speech.value).toEqual({})
    state.loading.value = true
    state.messages.value = [message('older', 'History page'), ...state.messages.value]
    await nextTick()
    state.loading.value = false
    await nextTick()
    expect(state.street.speech.value).toEqual({})
    const invalid = { ...message('invalid', 'Secret'), encryption: 'undecryptable' as const }
    state.messages.value.push(invalid)
    await nextTick()
    expect(state.street.speech.value).toEqual({})
    state.scope.stop()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('leaves synchronously on conversation switch, hiding the street, and scope disposal without autojoin', async () => {
    const state = setup()
    expect(room.value.join).not.toHaveBeenCalled()
    room.value.joined.value = true
    state.conversation.value = { ...state.conversation.value!, id: 'another' }
    expect(room.value.leave).toHaveBeenCalledOnce()
    state.visible.value = false
    expect(room.value.leave).toHaveBeenCalledTimes(2)
    state.scope.stop()
    expect(room.value.leave).toHaveBeenCalledTimes(3)
  })
})
