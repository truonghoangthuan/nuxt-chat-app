<script setup lang="ts">
import { computed } from 'vue'
import type { ChatMessage, Profile } from '~/types/chat'
import { extractLinksFromMessages, formatDateDivider } from '~/utils/chat'
import UserAvatar from '~/components/UserAvatar.vue'
import { Link2, ExternalLink, MessageSquare } from '@lucide/vue'

const props = withDefaults(
  defineProps<{
    messages: ChatMessage[]
    hasMoreHistory?: boolean
    isLoadingHistory?: boolean
    loadOlder?: () => Promise<number>
  }>(),
  {
    hasMoreHistory: false,
    isLoadingHistory: false,
    loadOlder: () => Promise.resolve(0),
  },
)

const emit = defineEmits<{
  (e: 'jumpToMessage', messageId: string): void
  (e: 'viewProfile', profile: Profile): void
}>()

const linkItems = computed(() => extractLinksFromMessages(props.messages))
</script>

<template>
  <div
    data-test="chat-links-list"
    class="flex-1 overflow-y-auto p-4 md:p-6"
  >
    <!-- Empty State -->
    <div
      v-if="linkItems.length === 0"
      data-test="links-empty-state"
      class="h-full min-h-[260px] flex flex-col items-center justify-center text-center gap-3 text-[var(--ap-text-muted)]"
    >
      <div class="w-12 h-12 rounded-2xl bg-black/5 dark:bg-white/5 border border-[var(--ap-glass-border)] flex items-center justify-center">
        <Link2 class="w-6 h-6 opacity-60" />
      </div>
      <div>
        <p class="text-sm font-semibold text-[var(--ap-text-primary)]">No links shared yet</p>
        <p class="text-xs text-[var(--ap-text-secondary)] mt-0.5">Web links shared in messages will be collected here.</p>
      </div>
      <button
        v-if="hasMoreHistory"
        type="button"
        data-test="load-older-links-btn"
        :disabled="isLoadingHistory"
        class="mt-2 px-3.5 py-1.5 rounded-full text-xs font-medium bg-black/5 dark:bg-white/8 hover:bg-black/10 dark:hover:bg-white/12 border border-[var(--ap-glass-border)] text-[var(--ap-text-primary)] transition cursor-pointer disabled:opacity-50"
        @click="loadOlder()"
      >
        {{ isLoadingHistory ? 'Loading history...' : 'Load older messages' }}
      </button>
    </div>

    <!-- Links List -->
    <div v-else class="max-w-3xl mx-auto space-y-2.5">
      <div
        v-for="item in linkItems"
        :key="item.id"
        data-test="link-list-item"
        class="p-3.5 rounded-xl border border-[var(--ap-glass-border)] bg-black/[0.03] dark:bg-white/[0.04] hover:bg-black/[0.06] dark:hover:bg-white/[0.07] transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
      >
        <div class="min-w-0 flex-1 space-y-1.5">
          <div class="flex items-center gap-2 flex-wrap">
            <span
              data-test="link-domain-badge"
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
            >
              <Link2 class="w-3 h-3" />
              {{ item.domain }}
            </span>

            <button
              v-if="item.author"
              type="button"
              data-test="link-item-author"
              class="inline-flex items-center gap-1.5 text-xs text-[var(--ap-text-secondary)] hover:text-[var(--ap-text-primary)] cursor-pointer"
              @click="emit('viewProfile', item.author)"
            >
              <UserAvatar
                :display-name="item.author.display_name"
                :avatar-color="item.author.avatar_color"
                :avatar-url="item.author.avatar_url"
                size="sm"
              />
              <span class="font-medium">{{ item.author.display_name }}</span>
            </button>

            <span class="text-[11px] text-[var(--ap-text-muted)]">
              {{ formatDateDivider(item.createdAt) }}
            </span>
          </div>

          <a
            :href="item.url"
            target="_blank"
            rel="noopener noreferrer"
            data-test="link-external-anchor"
            class="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline break-all"
          >
            <span>{{ item.url }}</span>
            <ExternalLink class="w-3.5 h-3.5 shrink-0" />
          </a>
        </div>

        <button
          type="button"
          data-test="jump-to-link-message"
          class="self-start sm:self-center shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-black/5 dark:bg-white/8 hover:bg-black/10 dark:hover:bg-white/12 border border-[var(--ap-glass-border)] text-[var(--ap-text-primary)] transition cursor-pointer"
          @click="emit('jumpToMessage', item.messageId)"
        >
          <MessageSquare class="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
          <span>Jump to message</span>
        </button>
      </div>

      <div v-if="hasMoreHistory" class="flex justify-center pt-2">
        <button
          type="button"
          data-test="load-older-links-btn"
          :disabled="isLoadingHistory"
          class="px-4 py-1.5 rounded-full text-xs font-medium bg-black/5 dark:bg-white/8 hover:bg-black/10 dark:hover:bg-white/12 border border-[var(--ap-glass-border)] text-[var(--ap-text-primary)] transition cursor-pointer disabled:opacity-50"
          @click="loadOlder()"
        >
          {{ isLoadingHistory ? 'Loading older links...' : 'Load older links' }}
        </button>
      </div>
    </div>
  </div>
</template>
