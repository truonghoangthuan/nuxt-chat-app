import { ref, computed, type ComputedRef } from 'vue'
import type { TypingUser } from '~/types/chat'

export function createTypingTracker(
  currentUserId: () => string | undefined,
  timeoutMs = 3000,
) {
  const typingMap = ref<Map<string, { user: TypingUser; timer: ReturnType<typeof setTimeout> }>>(new Map())

  const typingUsers: ComputedRef<TypingUser[]> = computed(() => {
    return Array.from(typingMap.value.values()).map(entry => entry.user)
  })

  const typingLabel: ComputedRef<string> = computed(() => {
    const list = typingUsers.value
    if (list.length === 0) return ''
    if (list.length === 1) return `${list[0].display_name} is typing...`
    if (list.length === 2) return `${list[0].display_name} and ${list[1].display_name} are typing...`
    return `${list.length} people are typing...`
  })

  function recordTyping(user: { user_id: string; display_name: string }): void {
    if (currentUserId() && user.user_id === currentUserId()) {
      return
    }

    const existing = typingMap.value.get(user.user_id)
    if (existing) {
      clearTimeout(existing.timer)
    }

    const timer = setTimeout(() => {
      clearUserTyping(user.user_id)
    }, timeoutMs)

    const updated = new Map(typingMap.value)
    updated.set(user.user_id, {
      user: {
        user_id: user.user_id,
        display_name: user.display_name,
        expires_at: Date.now() + timeoutMs,
      },
      timer,
    })
    typingMap.value = updated
  }

  function clearUserTyping(userId: string): void {
    const existing = typingMap.value.get(userId)
    if (existing) {
      clearTimeout(existing.timer)
      const updated = new Map(typingMap.value)
      updated.delete(userId)
      typingMap.value = updated
    }
  }

  function clearAll(): void {
    for (const entry of typingMap.value.values()) {
      clearTimeout(entry.timer)
    }
    typingMap.value = new Map()
  }

  return {
    typingUsers,
    typingLabel,
    recordTyping,
    clearUserTyping,
    clearAll,
  }
}
