<script setup lang="ts">
import { ref } from 'vue'
import { MoreHorizontal } from '@lucide/vue'
import type { ChatMessage } from '~/types/chat'
import { REACTION_EMOJIS } from '~/utils/chat'
import { isImagePayload } from '~/utils/image'

const props = defineProps<{
  message: ChatMessage
  currentUserId: string
}>()

const emit = defineEmits<{
  (event: 'toggleReaction', payload: { messageId: string; emoji: string }): void
  (event: 'reply', message: ChatMessage): void
  (event: 'edit', message: ChatMessage): void
  (event: 'delete', messageId: string): void
}>()

const isOpen = ref(false)

function run(action: () => void) {
  action()
  isOpen.value = false
}
</script>

<template>
  <div class="relative z-20 md:hidden shrink-0 self-center">
    <button
      type="button"
      data-test="open-mobile-actions"
      :aria-label="`Open actions for message from ${message.author?.display_name || 'friend'}`"
      :aria-expanded="isOpen"
      class="inline-flex size-8 items-center justify-center rounded-lg border border-[var(--fp-border)] bg-[var(--fp-surface-elevated)] text-[var(--fp-text-secondary)] shadow-sm hover:text-[var(--fp-text-primary)] focus-visible:outline-2 focus-visible:outline-indigo-500"
      @click="isOpen = !isOpen"
    >
      <MoreHorizontal class="size-4" aria-hidden="true" />
    </button>

    <div
      v-if="isOpen"
      data-test="mobile-action-menu"
      role="menu"
      aria-label="Message actions"
      class="absolute top-full mt-1 w-52 max-w-[calc(100vw-1.5rem)] rounded-xl border border-[var(--fp-border)] bg-[var(--fp-surface-elevated)] p-2 text-[var(--fp-text-primary)] shadow-xl"
      :class="message.user_id === currentUserId ? 'left-0' : 'right-0'"
    >
      <div class="grid grid-cols-5 gap-1 border-b border-[var(--fp-border)] pb-2">
        <button
          v-for="emoji in REACTION_EMOJIS"
          :key="emoji"
          type="button"
          role="menuitem"
          data-test="mobile-reaction"
          :aria-label="`React with ${emoji}`"
          class="flex size-8 items-center justify-center rounded-md text-base hover:bg-[var(--fp-hover)] focus-visible:outline-2 focus-visible:outline-indigo-500"
          @click="run(() => emit('toggleReaction', { messageId: message.id, emoji }))"
        >
          {{ emoji }}
        </button>
      </div>
      <div class="mt-1 grid gap-0.5">
        <button
          type="button"
          role="menuitem"
          data-test="mobile-reply"
          class="rounded-md px-2.5 py-2 text-left text-sm hover:bg-[var(--fp-hover)]"
          @click="run(() => emit('reply', message))"
        >
          Reply
        </button>
        <button
          v-if="message.user_id === currentUserId && !isImagePayload(message.content)"
          type="button"
          role="menuitem"
          data-test="mobile-edit"
          class="rounded-md px-2.5 py-2 text-left text-sm hover:bg-[var(--fp-hover)]"
          @click="run(() => emit('edit', message))"
        >
          Edit
        </button>
        <button
          v-if="message.user_id === currentUserId"
          type="button"
          role="menuitem"
          data-test="mobile-delete"
          class="rounded-md px-2.5 py-2 text-left text-sm text-rose-500 hover:bg-rose-500/10"
          @click="run(() => emit('delete', message.id))"
        >
          Delete
        </button>
      </div>
    </div>
  </div>
</template>
