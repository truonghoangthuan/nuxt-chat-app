<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { X, Sparkles, Check, ChevronDown, ChevronUp } from '@lucide/vue'
import Button from '~/components/ui/Button.vue'
import { APP_VERSION, CURRENT_RELEASE, RELEASE_HISTORY, splitItemTitle } from '~/utils/version'

const props = defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const showOlderReleases = ref(false)

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.isOpen) {
    emit('close')
  }
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleKeyDown)
  }
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', handleKeyDown)
  }
})
</script>

<template>
  <Transition name="modal-fade">
    <div
      v-if="isOpen"
      data-test="changelog-modal"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 dark:bg-black/70 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="changelog-title"
      @click.self="emit('close')"
    >
      <div
        class="messenger-dialog-surface w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl border border-black/10 dark:border-white/15 bg-white/95 dark:bg-[#161824]/95 backdrop-blur-2xl shadow-2xl text-[var(--ap-text-primary)] overflow-hidden"
      >
        <!-- Modal Header -->
        <div class="p-5 pb-4 border-b border-black/5 dark:border-white/10 flex items-start justify-between gap-3 shrink-0">
          <div class="flex items-center gap-3">
            <div class="size-10 rounded-xl bg-blue-500/10 dark:bg-blue-500/20 text-blue-500 flex items-center justify-center shrink-0 border border-blue-500/20">
              <Sparkles class="size-5" />
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h3 id="changelog-title" class="text-base font-semibold text-[var(--ap-text-primary)] tracking-tight">
                  What's New in Nuxt Chat
                </h3>
                <span
                  data-test="changelog-version-tag"
                  class="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                >
                  v{{ APP_VERSION }}
                </span>
              </div>
              <p class="text-xs text-[var(--ap-text-muted)] mt-0.5">
                Released {{ CURRENT_RELEASE.date }} · Latest updates & improvements
              </p>
            </div>
          </div>

          <button
            type="button"
            data-test="close-changelog-btn"
            class="size-8 rounded-full text-[var(--ap-text-muted)] hover:text-[var(--ap-text-primary)] hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center transition-all cursor-pointer active:scale-90"
            aria-label="Close dialog"
            @click="emit('close')"
          >
            <X class="size-4" />
          </button>
        </div>

        <!-- Modal Body (Scrollable) -->
        <div class="p-5 overflow-y-auto space-y-5 text-xs">
          <!-- Current Release Highlight Card -->
          <div class="p-4 rounded-xl bg-blue-500/[0.04] dark:bg-blue-500/[0.08] border border-blue-500/20 space-y-3.5">
            <div>
              <div class="flex items-center gap-2">
                <span class="text-sm font-semibold text-[var(--ap-text-primary)]">
                  {{ CURRENT_RELEASE.title }}
                </span>
                <span class="px-1.5 py-0.2 rounded-md text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  Current
                </span>
              </div>
              <p v-if="CURRENT_RELEASE.description" class="text-xs text-[var(--ap-text-secondary)] mt-1 leading-relaxed">
                {{ CURRENT_RELEASE.description }}
              </p>
            </div>

            <!-- Category Breakdown -->
            <div class="space-y-3 pt-1">
              <div
                v-for="cat in CURRENT_RELEASE.highlights"
                :key="cat.category"
                class="space-y-1.5"
              >
                <div class="text-[11px] font-semibold text-[var(--ap-text-muted)] uppercase tracking-wider">
                  {{ cat.category }}
                </div>
                <ul class="space-y-1.5">
                  <li
                    v-for="(item, idx) in cat.items"
                    :key="idx"
                    class="flex items-start gap-2 text-[var(--ap-text-secondary)] leading-relaxed"
                  >
                    <Check class="size-3.5 text-blue-500 shrink-0 mt-0.5" />
                    <span>
                      <strong v-if="splitItemTitle(item).title" class="font-semibold text-[var(--ap-text-primary)]">
                        {{ splitItemTitle(item).title }}:&nbsp;
                      </strong>
                      <span>{{ splitItemTitle(item).body }}</span>
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <!-- Older Releases Toggle -->
          <div class="pt-1">
            <button
              type="button"
              data-test="toggle-older-versions-btn"
              class="w-full flex items-center justify-between p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] hover:bg-black/[0.05] dark:hover:bg-white/[0.05] border border-black/5 dark:border-white/10 text-[var(--ap-text-secondary)] font-medium transition-all active:scale-[0.99] cursor-pointer"
              @click="showOlderReleases = !showOlderReleases"
            >
              <span class="text-xs">Previous Releases</span>
              <span class="flex items-center gap-1 text-[11px] text-[var(--ap-text-muted)]">
                <span>{{ showOlderReleases ? 'Hide' : 'View past versions' }}</span>
                <ChevronUp v-if="showOlderReleases" class="size-3.5" />
                <ChevronDown v-else class="size-3.5" />
              </span>
            </button>

            <!-- Older Releases List -->
            <div
              v-if="showOlderReleases"
              data-test="older-releases-list"
              class="mt-3 space-y-3 pl-1"
            >
              <div
                v-for="rel in RELEASE_HISTORY.slice(1)"
                :key="rel.version"
                class="p-3.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/5 dark:border-white/10 space-y-2"
              >
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <span class="font-mono font-semibold text-[var(--ap-text-primary)]">v{{ rel.version }}</span>
                    <span class="text-[11px] font-medium text-[var(--ap-text-secondary)]">{{ rel.title }}</span>
                  </div>
                  <span class="text-[10px] font-mono text-[var(--ap-text-muted)]">{{ rel.date }}</span>
                </div>
                <p v-if="rel.description" class="text-[11px] text-[var(--ap-text-muted)]">
                  {{ rel.description }}
                </p>
                <ul class="space-y-1 pt-1">
                  <li
                    v-for="(item, idx) in rel.highlights.flatMap(h => h.items)"
                    :key="idx"
                    class="flex items-start gap-2 text-[11px] text-[var(--ap-text-secondary)]"
                  >
                    <span class="size-1 rounded-full bg-[var(--ap-text-muted)] shrink-0 mt-1.5" />
                    <span>{{ item }}</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="p-4 border-t border-black/5 dark:border-white/10 flex items-center justify-between gap-3 bg-black/[0.02] dark:bg-white/[0.02] shrink-0">
          <div class="text-[11px] font-mono text-[var(--ap-text-muted)]">
            Precision Studio · Nuxt 4
          </div>
          <Button
            type="button"
            data-test="close-changelog-footer-btn"
            variant="default"
            size="sm"
            class="rounded-xl px-4 bg-blue-600 hover:bg-blue-500 text-white font-medium cursor-pointer active:scale-95 transition-all"
            @click="emit('close')"
          >
            Got it
          </Button>
        </div>
      </div>
    </div>
  </Transition>
</template>
