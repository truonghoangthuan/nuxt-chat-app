<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { Conversation } from '~/types/chat'
import {
  X,
  Sparkles,
  Gamepad2,
  StickyNote,
  Image as ImageIcon,
  Link2,
  Smile,
  ChevronRight,
  ExternalLink,
  Flame,
  Laugh,
  CheckCircle2,
} from '@lucide/vue'

const props = withDefaults(
  defineProps<{
    isOpen: boolean
    conversation: Conversation | null
    mediaCount?: number
    linksCount?: number
  }>(),
  {
    isOpen: false,
    conversation: null,
    mediaCount: 0,
    linksCount: 0,
  },
)

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'sendSticker', stickerText: string): void
  (e: 'sendReaction', emoji: string): void
  (e: 'switchTab', tab: 'media' | 'links'): void
  (e: 'openBackground'): void
  (e: 'openConfetti'): void
  (e: 'openGroupInfo'): void
}>()

const activeTab = ref<'chaos' | 'activities' | 'notes'>('chaos')

// Curated Beautiful Chaos Expressive Stickers
const STICKERS = [
  { id: 'fire', emoji: '🔥', label: 'Dumpster Fire', badge: 'Disaster', bg: 'from-amber-500/20 to-rose-500/20 border-amber-500/30' },
  { id: 'clown', emoji: '🤡', label: 'Clown Energy', badge: 'Circus', bg: 'from-purple-500/20 to-pink-500/20 border-purple-500/30' },
  { id: 'skull', emoji: '💀', label: 'I Am Dead', badge: 'RIP', bg: 'from-slate-500/20 to-zinc-500/20 border-slate-500/30' },
  { id: 'moon', emoji: '🚀', label: 'To The Moon', badge: 'Hype', bg: 'from-indigo-500/20 to-cyan-500/20 border-indigo-500/30' },
  { id: 'brain', emoji: '🧠', label: 'Big Brain', badge: '200 IQ', bg: 'from-pink-500/20 to-violet-500/20 border-pink-500/30' },
  { id: 'popcorn', emoji: '🍿', label: 'Popcorn Time', badge: 'Drama', bg: 'from-yellow-500/20 to-amber-500/20 border-yellow-500/30' },
  { id: 'tea', emoji: '☕', label: 'Spill The Tea', badge: 'Gossip', bg: 'from-emerald-500/20 to-teal-500/20 border-emerald-500/30' },
  { id: 'chaos', emoji: '✨', label: 'Pure Chaos', badge: 'Unhinged', bg: 'from-violet-500/20 to-fuchsia-500/20 border-violet-500/30' },
  { id: 'eyes', emoji: '👀', label: 'Suspicious', badge: 'Side Eye', bg: 'from-blue-500/20 to-indigo-500/20 border-blue-500/30' },
  { id: 'queen', emoji: '👑', label: 'Main Character', badge: 'Slay', bg: 'from-amber-400/20 to-yellow-500/20 border-amber-400/30' },
  { id: 'hundred', emoji: '💯', label: 'No Cap', badge: 'Real', bg: 'from-rose-500/20 to-red-600/20 border-rose-500/30' },
  { id: 'alien', emoji: '👾', label: 'Gamer Mode', badge: 'GG', bg: 'from-cyan-500/20 to-blue-600/20 border-cyan-500/30' },
]

const QUICK_REACTIONS = ['😂', '🔥', '💀', '🤡', '👀', '❤️', '🚀', '💩', '🎉', '☕']

// Chaos Scratchpad / Banter Notes (stored in localStorage)
const banterNote = ref('')
const noteSavedIndicator = ref(false)

const noteStorageKey = computed(() => {
  return props.conversation?.id ? `chaos-banter-${props.conversation.id}` : 'chaos-banter-default'
})

function loadNote() {
  if (typeof window === 'undefined') return
  try {
    banterNote.value = localStorage.getItem(noteStorageKey.value) || ''
  } catch {
    banterNote.value = ''
  }
}

function saveNote() {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(noteStorageKey.value, banterNote.value)
    noteSavedIndicator.value = true
    setTimeout(() => {
      noteSavedIndicator.value = false
    }, 2000)
  } catch {
    // ignore
  }
}

watch(noteStorageKey, () => {
  loadNote()
})

onMounted(() => {
  loadNote()
})

function handleSendSticker(sticker: typeof STICKERS[0]) {
  const content = `[sticker:${sticker.id}:${sticker.label}:${sticker.emoji}]`
  emit('sendSticker', content)
}
</script>

<template>
  <div class="h-full shrink-0 flex">
    <!-- Mobile Backdrop -->
    <div
      v-if="isOpen"
      data-test="utility-panel-backdrop"
      class="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden"
      @click="emit('close')"
    ></div>

    <aside
      data-test="right-utility-panel"
      class="fixed inset-y-0 right-0 z-50 md:static md:z-30 flex flex-col h-full bg-[var(--ap-sidebar)] backdrop-blur-2xl rounded-l-2xl md:rounded-2xl border-l md:border border-[var(--ap-glass-border)] shadow-2xl md:shadow-xl overflow-hidden transition-all duration-300 ease-in-out shrink-0 select-none"
      :class="[
        isOpen
          ? 'w-80 opacity-100 translate-x-0'
          : 'w-0 opacity-0 pointer-events-none border-0 p-0 overflow-hidden translate-x-full md:translate-x-0'
      ]"
    >
    <!-- Panel Header -->
    <div class="h-14 px-4 border-b border-[var(--ap-glass-border)] flex items-center justify-between shrink-0 bg-white/5 dark:bg-white/[0.02]">
      <div class="flex items-center gap-2">
        <div class="w-7 h-7 rounded-lg bg-gradient-to-tr from-purple-500 to-indigo-500 flex items-center justify-center text-white shadow-xs">
          <Sparkles class="w-4 h-4" />
        </div>
        <div>
          <h3 class="text-xs font-bold text-[var(--ap-text-primary)] tracking-tight flex items-center gap-1.5">
            <span>Chaos Hub</span>
            <span class="text-[9.5px] px-1.5 py-0.2 rounded-full font-mono bg-purple-500/15 text-purple-600 dark:text-purple-300 border border-purple-500/20 font-semibold">20% Nonsense</span>
          </h3>
          <p class="text-[10px] text-[var(--ap-text-muted)] truncate max-w-[170px]">
            {{ conversation?.title || conversation?.peer?.display_name || 'Room utilities' }}
          </p>
        </div>
      </div>
      <button
        type="button"
        data-test="close-utility-panel"
        class="p-1 rounded-full text-[var(--ap-text-muted)] hover:text-[var(--ap-text-primary)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
        aria-label="Close Chaos Panel"
        @click="emit('close')"
      >
        <X class="w-4 h-4" />
      </button>
    </div>

    <!-- Navigation Tabs -->
    <div class="h-10 px-3 border-b border-[var(--ap-glass-border)] flex items-center gap-1 shrink-0 bg-black/[0.02] dark:bg-white/[0.02]">
      <button
        type="button"
        data-test="utility-tab-chaos"
        class="flex-1 py-1 px-2 rounded-lg text-xs font-medium transition-all text-center cursor-pointer"
        :class="activeTab === 'chaos' ? 'bg-purple-600/15 dark:bg-purple-600/25 text-purple-700 dark:text-purple-300 font-semibold shadow-xs border border-purple-500/20' : 'text-[var(--ap-text-muted)] hover:text-[var(--ap-text-primary)] hover:bg-black/5 dark:hover:bg-white/5'"
        @click="activeTab = 'chaos'"
      >
        Stickers
      </button>
      <button
        type="button"
        data-test="utility-tab-activities"
        class="flex-1 py-1 px-2 rounded-lg text-xs font-medium transition-all text-center cursor-pointer"
        :class="activeTab === 'activities' ? 'bg-purple-600/15 dark:bg-purple-600/25 text-purple-700 dark:text-purple-300 font-semibold shadow-xs border border-purple-500/20' : 'text-[var(--ap-text-muted)] hover:text-[var(--ap-text-primary)] hover:bg-black/5 dark:hover:bg-white/5'"
        @click="activeTab = 'activities'"
      >
        Games
      </button>
      <button
        type="button"
        data-test="utility-tab-notes"
        class="flex-1 py-1 px-2 rounded-lg text-xs font-medium transition-all text-center cursor-pointer"
        :class="activeTab === 'notes' ? 'bg-purple-600/15 dark:bg-purple-600/25 text-purple-700 dark:text-purple-300 font-semibold shadow-xs border border-purple-500/20' : 'text-[var(--ap-text-muted)] hover:text-[var(--ap-text-primary)] hover:bg-black/5 dark:hover:bg-white/5'"
        @click="activeTab = 'notes'"
      >
        Banter
      </button>
    </div>

    <!-- Tab 1: Stickers & Memes -->
    <div v-if="activeTab === 'chaos'" class="flex-1 overflow-y-auto p-3 space-y-4 custom-scroll">
      <!-- Quick Reactions Row -->
      <div>
        <div class="text-[10.5px] uppercase font-semibold text-[var(--ap-text-muted)] tracking-wider mb-2 flex items-center justify-between">
          <span>Quick Reactions</span>
          <Smile class="w-3 h-3 text-purple-500" />
        </div>
        <div class="grid grid-cols-5 gap-1.5 bg-black/5 dark:bg-white/5 p-2 rounded-xl border border-black/5 dark:border-white/5">
          <button
            v-for="emoji in QUICK_REACTIONS"
            :key="emoji"
            type="button"
            class="h-8 rounded-lg text-lg flex items-center justify-center hover:bg-black/10 dark:hover:bg-white/10 hover:scale-125 active:scale-95 transition-all cursor-pointer"
            :title="`React ${emoji}`"
            @click="emit('sendReaction', emoji)"
          >
            {{ emoji }}
          </button>
        </div>
      </div>

      <!-- Expressive Stickers Deck -->
      <div>
        <div class="text-[10.5px] uppercase font-semibold text-[var(--ap-text-muted)] tracking-wider mb-2 flex items-center justify-between">
          <span>Expressive Stickers</span>
          <span class="text-[10px] text-purple-500 font-normal">Click to blast</span>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <button
            v-for="sticker in STICKERS"
            :key="sticker.id"
            type="button"
            data-test="sticker-item"
            class="flex flex-col items-center justify-center p-2.5 rounded-xl border bg-gradient-to-br transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-xs group"
            :class="sticker.bg"
            @click="handleSendSticker(sticker)"
          >
            <span class="text-2xl group-hover:animate-bounce mb-1">{{ sticker.emoji }}</span>
            <span class="text-[11.5px] font-semibold text-[var(--ap-text-primary)] leading-tight">{{ sticker.label }}</span>
            <span class="text-[9.5px] font-mono font-medium text-[var(--ap-text-muted)] mt-0.5">{{ sticker.badge }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Tab 2: Mini-Games & Room Activities -->
    <div v-else-if="activeTab === 'activities'" class="flex-1 overflow-y-auto p-3 space-y-3 custom-scroll">
      <div class="text-[10.5px] uppercase font-semibold text-[var(--ap-text-muted)] tracking-wider mb-1">
        Room Mini-Games
      </div>

      <!-- Caro Card -->
      <a
        href="/caro"
        class="block p-3 rounded-xl bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border border-blue-500/20 hover:border-blue-500/40 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-xs group cursor-pointer"
      >
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-500 flex items-center justify-center font-bold text-base">
              ✕◯
            </div>
            <div>
              <h4 class="text-xs font-bold text-[var(--ap-text-primary)] group-hover:text-blue-500 transition-colors">Play Caro (Gomoku)</h4>
              <p class="text-[10.5px] text-[var(--ap-text-muted)]">5 in a row classic duel</p>
            </div>
          </div>
          <ExternalLink class="w-3.5 h-3.5 text-[var(--ap-text-muted)] group-hover:text-blue-500 transition-colors" />
        </div>
        <div class="mt-2.5 flex items-center justify-between text-[10px] text-blue-600 dark:text-blue-400 font-medium">
          <span>Realtime P2P sync</span>
          <span class="underline">Launch Game →</span>
        </div>
      </a>

      <!-- Chess Card -->
      <a
        href="/chess"
        class="block p-3 rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20 hover:border-amber-500/40 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-xs group cursor-pointer"
      >
        <div class="flex items-start justify-between">
          <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-500 flex items-center justify-center font-bold text-base">
              ♞
            </div>
            <div>
              <h4 class="text-xs font-bold text-[var(--ap-text-primary)] group-hover:text-amber-500 transition-colors">Multiplayer Chess</h4>
              <p class="text-[10.5px] text-[var(--ap-text-muted)]">Realtime board with clocks</p>
            </div>
          </div>
          <ExternalLink class="w-3.5 h-3.5 text-[var(--ap-text-muted)] group-hover:text-amber-500 transition-colors" />
        </div>
        <div class="mt-2.5 flex items-center justify-between text-[10px] text-amber-600 dark:text-amber-400 font-medium">
          <span>Official FIDE rules</span>
          <span class="underline">Launch Board →</span>
        </div>
      </a>

      <!-- Quick Room Customization Actions -->
      <div class="pt-3 border-t border-[var(--ap-glass-border)] space-y-2">
        <div class="text-[10.5px] uppercase font-semibold text-[var(--ap-text-muted)] tracking-wider mb-1">
          Customization Shortcuts
        </div>
        <button
          type="button"
          class="w-full flex items-center justify-between p-2 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-xs font-medium text-[var(--ap-text-primary)] transition-all cursor-pointer"
          @click="emit('openBackground')"
        >
          <span class="flex items-center gap-2">
            <ImageIcon class="w-3.5 h-3.5 text-blue-500" />
            <span>Chat Wallpaper</span>
          </span>
          <ChevronRight class="w-3.5 h-3.5 text-[var(--ap-text-muted)]" />
        </button>
        <button
          type="button"
          class="w-full flex items-center justify-between p-2 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-xs font-medium text-[var(--ap-text-primary)] transition-all cursor-pointer"
          @click="emit('openConfetti')"
        >
          <span class="flex items-center gap-2">
            <Sparkles class="w-3.5 h-3.5 text-amber-500" />
            <span>Confetti Triggers</span>
          </span>
          <ChevronRight class="w-3.5 h-3.5 text-[var(--ap-text-muted)]" />
        </button>
      </div>
    </div>

    <!-- Tab 3: Banter Board & Scratchpad -->
    <div v-else-if="activeTab === 'notes'" class="flex-1 overflow-y-auto p-3 space-y-3 custom-scroll">
      <div>
        <div class="flex items-center justify-between mb-1">
          <span class="text-[10.5px] uppercase font-semibold text-[var(--ap-text-muted)] tracking-wider">
            Group Banter Board
          </span>
          <span v-if="noteSavedIndicator" class="text-[10px] text-emerald-500 flex items-center gap-1">
            <CheckCircle2 class="w-3 h-3" /> Saved!
          </span>
        </div>
        <p class="text-[11px] text-[var(--ap-text-muted)] mb-2">
          Keep running jokes, inside lore, betting tallies, or room rules handy.
        </p>
        <textarea
          v-model="banterNote"
          rows="5"
          placeholder="e.g. John owes pizza from Caro duel. House rule: no sending clown emojis before 9 AM..."
          class="w-full p-2.5 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-xs text-[var(--ap-text-primary)] placeholder-[var(--ap-text-muted)] focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none custom-scroll"
          @input="saveNote"
        ></textarea>
      </div>

      <!-- Quick Media and Links summary -->
      <div class="pt-2 border-t border-[var(--ap-glass-border)] space-y-2">
        <div class="text-[10.5px] uppercase font-semibold text-[var(--ap-text-muted)] tracking-wider mb-1">
          Media & Links Summary
        </div>
        <div class="grid grid-cols-2 gap-2">
          <button
            type="button"
            class="p-2.5 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-left transition-all cursor-pointer border border-transparent hover:border-purple-500/30"
            @click="emit('switchTab', 'media')"
          >
            <div class="flex items-center gap-1.5 text-blue-500 text-xs font-semibold mb-0.5">
              <ImageIcon class="w-3.5 h-3.5" />
              <span>Media</span>
            </div>
            <div class="text-sm font-bold text-[var(--ap-text-primary)]">{{ mediaCount }} files</div>
          </button>
          <button
            type="button"
            class="p-2.5 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-left transition-all cursor-pointer border border-transparent hover:border-purple-500/30"
            @click="emit('switchTab', 'links')"
          >
            <div class="flex items-center gap-1.5 text-purple-500 text-xs font-semibold mb-0.5">
              <Link2 class="w-3.5 h-3.5" />
              <span>Links</span>
            </div>
            <div class="text-sm font-bold text-[var(--ap-text-primary)]">{{ linksCount }} links</div>
          </button>
        </div>
      </div>
    </div>
  </aside>
  </div>
</template>
