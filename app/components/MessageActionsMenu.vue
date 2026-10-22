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
  <div class="relative z-20 md:hidden shrink-0 self-center opacity-70 hover:opacity-100 active:opacity-100 transition-opacity">
    <button
      type="button"
      data-test="open-mobile-actions"
      :aria-label="`Open actions for message from ${message.author?.display_name || 'friend'}`"
      :aria-expanded="isOpen"
      class="inline-flex size-8 items-center justify-center rounded-[8px] border border-[var(--om-border)] bg-[var(--om-card)] text-[var(--om-text-secondary)] shadow-sm hover:text-[var(--om-text-primary)] hover:border-[var(--om-border-strong)] focus-visible:outline-2 focus-visible:outline-indigo-500 transition-colors"
      @click="isOpen = !isOpen"
    >
      <MoreHorizontal class="size-4" aria-hidden="true" />
    </button>

    <div
      v-if="isOpen"
      data-test="mobile-action-menu"
      role="menu"
      aria-label="Message actions"
      class="absolute top-full mt-1.5 w-52 max-w-[calc(100vw-1.5rem)] rounded-[10px] border border-[var(--om-border-strong)] bg-[var(--om-card)] p-2 text-[var(--om-text-primary)] shadow-2xl"
      :class="message.user_id === currentUserId ? 'left-0' : 'right-0'"
    >
      <div class="grid grid-cols-5 gap-1 border-b border-[var(--om-border)] pb-2">
        <button
          v-for="emoji in REACTION_EMOJIS"
          :key="emoji"
          type="button"
          role="menuitem"
          data-test="mobile-reaction"
          :aria-label="`React with ${emoji}`"
          class="flex size-8 items-center justify-center rounded-[6px] text-base hover:bg-[var(--om-hover)] focus-visible:outline-2 focus-visible:outline-indigo-500 transition-colors cursor-pointer"
          @click="run(() => emit('toggleReaction', { messageId: message.id, emoji }))"
        >
          {{ emoji }}
        </button>
      </div>
      <div class="mt-1.5 grid gap-0.5">
        <button
          type="button"
          role="menuitem"
          data-test="mobile-reply"
          class="rounded-[6px] px-2.5 py-1.5 text-left text-xs font-medium text-[var(--om-text-primary)] hover:bg-[var(--om-hover)] transition-colors cursor-pointer"
          @click="run(() => emit('reply', message))"
        >
          Reply
        </button>
        <button
          v-if="message.user_id === currentUserId && !isImagePayload(message.content)"
          type="button"
          role="menuitem"
          data-test="mobile-edit"
          class="rounded-[6px] px-2.5 py-1.5 text-left text-xs font-medium text-[var(--om-text-primary)] hover:bg-[var(--om-hover)] transition-colors cursor-pointer"
          @click="run(() => emit('edit', message))"
        >
          Edit
        </button>
        <button
          v-if="message.user_id === currentUserId"
          type="button"
          role="menuitem"
          data-test="mobile-delete"
          class="rounded-[6px] px-2.5 py-1.5 text-left text-xs font-medium text-[var(--om-destructive)] hover:bg-rose-500/10 transition-colors cursor-pointer"
          @click="run(() => emit('delete', message.id))"
        >
          Delete
        </button>
      </div>
    </div>
  </div>
</template>
