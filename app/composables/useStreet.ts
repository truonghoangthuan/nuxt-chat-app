import { onScopeDispose, ref, watch, type Ref } from 'vue'
import { isSystemPayload } from '~/utils/chat'
import { isImagePayload } from '~/utils/image'
import type { ChatMessage, Conversation, Profile } from '~/types/chat'
import { createStreetRoom } from '~/composables/useStreetRoom'

/** A street belongs to the selected group, never to the global online roster. */
export function useStreet(
  conversation: Ref<Conversation | null>,
  profile: Ref<Profile | null>,
  messages: Ref<ChatMessage[]>,
  loading: Ref<boolean>,
  visible: Ref<boolean>,
) {
  const room = createStreetRoom(useSupabaseClient(), {
    getProfile: () => profile.value,
    getConversation: () => conversation.value,
  })
  const speech = ref<Record<string, string>>({})
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  let lastMessageId: string | undefined
  function clearSpeech() {
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear()
    speech.value = {}
    lastMessageId = messages.value.at(-1)?.id
  }
  watch(
    () => [conversation.value?.id, profile.value?.id, visible.value,
      conversation.value?.members?.some(member => member.user_id === profile.value?.id)],
    () => { clearSpeech(); void room.leave() },
    { flush: 'sync' },
  )
  watch(() => room.joined.value, clearSpeech, { flush: 'sync' })
  watch(() => {
    const tail = messages.value.at(-1)
    return [messages.value.length, tail?.id, tail?.status, tail?.content, tail?.deleted_at, loading.value]
  }, () => {
    const tail = messages.value.at(-1)
    if (!room.joined.value || !visible.value || loading.value) { clearSpeech(); return }
    if (!tail || tail.conversation_id !== conversation.value?.id) return
    if (tail.deleted_at || tail.encryption === 'undecryptable') {
      delete speech.value[tail.user_id]
      clearTimeout(timers.get(tail.user_id))
      timers.delete(tail.user_id)
      return
    }
    if (tail.id === lastMessageId || tail.status !== 'sent') return
    lastMessageId = tail.id
    if (!room.participants.value.some(person => person.user_id === tail.user_id)
      || isSystemPayload(tail.content) || isImagePayload(tail.content)
      || !tail.content.trim() || Date.now() - Date.parse(tail.created_at) > 20_000) return
    speech.value[tail.user_id] = Array.from(tail.content).slice(0, 100).join('')
    clearTimeout(timers.get(tail.user_id))
    timers.set(tail.user_id, setTimeout(() => {
      delete speech.value[tail.user_id]
      timers.delete(tail.user_id)
    }, 6000))
  })
  onScopeDispose(() => { clearSpeech(); void room.leave() })
  return { ...room, speech }
}
