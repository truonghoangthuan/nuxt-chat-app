<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import type { Contact, Profile } from '~/types/chat'
import UserAvatar from '~/components/UserAvatar.vue'

const props = withDefaults(
  defineProps<{
    isOpen: boolean
    contacts: Contact[]
    onlineUserIds?: string[]
    currentUserId?: string | null
    findUserByEmail?: (email: string) => Promise<Profile | null>
  }>(),
  {
    contacts: () => [],
    onlineUserIds: () => [],
    currentUserId: null,
    findUserByEmail: undefined,
  },
)

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'selectContact', userId: string): void
  (e: 'addContactByEmail', email: string): void
  (e: 'removeContact', userId: string): void
}>()

const searchEmail = ref('')
const searchResult = ref<Profile | null>(null)
const searchError = ref<string | null>(null)
const isSearching = ref(false)

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.isOpen) {
    handleClose()
  }
}

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      searchEmail.value = ''
      searchResult.value = null
      searchError.value = null
      isSearching.value = false
      if (typeof window !== 'undefined') {
        window.addEventListener('keydown', onKeyDown)
      }
    } else {
      if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', onKeyDown)
      }
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', onKeyDown)
  }
})

// Sort contacts alphabetically by display name (or fallback)
const sortedContacts = computed(() => {
  return [...props.contacts].sort((a, b) => {
    const nameA = a.profile?.display_name || a.profile?.email || a.contact_user_id || ''
    const nameB = b.profile?.display_name || b.profile?.email || b.contact_user_id || ''
    return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' })
  })
})

const isSearchResultContact = computed(() => {
  if (!searchResult.value) return false
  return props.contacts.some(c => c.contact_user_id === searchResult.value?.id)
})

const isSearchResultSelf = computed(() => {
  if (!searchResult.value || !props.currentUserId) return false
  return searchResult.value.id === props.currentUserId
})

function handleClose() {
  emit('close')
}

function handleSelect(userId: string) {
  emit('selectContact', userId)
}

function handleRemove(userId: string) {
  emit('removeContact', userId)
}

function handleAddContact(email: string) {
  emit('addContactByEmail', email)
  searchEmail.value = ''
  searchResult.value = null
  searchError.value = null
}

async function handleSearchOrAdd() {
  const query = searchEmail.value.trim()
  if (!query) return

  if (props.findUserByEmail) {
    isSearching.value = true
    searchError.value = null
    searchResult.value = null
    try {
      const profile = await props.findUserByEmail(query)
      if (profile) {
        searchResult.value = profile
      } else {
        searchError.value = 'No user found with this email'
      }
    } catch (err: any) {
      searchError.value = err?.message || 'Error searching for user'
    } finally {
      isSearching.value = false
    }
  } else {
    emit('addContactByEmail', query)
    searchEmail.value = ''
    searchResult.value = null
    searchError.value = null
  }
}
</script>

<template>
  <div
    v-if="isOpen"
    data-test="contacts-modal-backdrop"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
    @click.self="handleClose"
  >
    <div
      data-test="contacts-modal"
      class="w-full max-w-md fp-stage-surface rounded-[14px] border border-[var(--fp-border)] overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
    >
      <!-- Header -->
      <div class="px-5 py-4 border-b border-[var(--fp-border)] flex items-center justify-between shrink-0">
        <div>
          <h3 class="fp-font-display text-[16px] font-bold text-[var(--fp-text-primary)]">
            Contacts
          </h3>
          <p class="text-xs text-[var(--fp-text-secondary)] mt-0.5">
            Manage your friends and address book
          </p>
        </div>
        <button
          type="button"
          aria-label="Close"
          class="w-7 h-7 rounded-md text-[var(--fp-text-secondary)] hover:text-[var(--fp-text-primary)] hover:bg-[var(--fp-hover)] text-lg font-bold flex items-center justify-center cursor-pointer transition-colors"
          @click="handleClose"
        >
          ×
        </button>
      </div>

      <!-- Search / Add by Email Section -->
      <div class="p-4 border-b border-[var(--fp-border)] space-y-3 shrink-0">
        <form class="flex gap-2" @submit.prevent="handleSearchOrAdd">
          <input
            v-model="searchEmail"
            type="email"
            placeholder="Find user by email..."
            class="flex-1 px-3.5 py-2 rounded-[8px] border border-[var(--fp-border)] bg-[var(--fp-input-bg)] text-[14px] text-[var(--fp-text-primary)] placeholder-[var(--fp-text-muted)] focus:outline-none focus:border-indigo-500 transition-colors"
          />
          <button
            type="submit"
            :disabled="!searchEmail.trim() || isSearching"
            class="px-3.5 py-2 rounded-[8px] text-xs font-semibold fp-btn-primary disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shrink-0"
          >
            {{ isSearching ? 'Searching...' : (findUserByEmail ? 'Search' : 'Add') }}
          </button>
        </form>

        <!-- Search Error -->
        <p v-if="searchError" class="text-xs text-rose-500 font-medium">
          {{ searchError }}
        </p>

        <!-- Search Result Preview -->
        <div
          v-if="searchResult"
          data-test="search-result-preview"
          class="p-3 rounded-[10px] border border-[var(--fp-border)] bg-[var(--fp-surface-elevated)] flex items-center justify-between gap-3"
        >
          <div class="flex items-center gap-3 min-w-0">
            <UserAvatar
              :display-name="searchResult.display_name"
              :avatar-color="searchResult.avatar_color"
              :avatar-url="searchResult.avatar_url"
              :show-online="onlineUserIds.includes(searchResult.id)"
              size="sm"
            />
            <div class="truncate">
              <div class="text-sm font-semibold text-[var(--fp-text-primary)] truncate">
                {{ searchResult.display_name }}
              </div>
              <div class="text-xs text-[var(--fp-text-secondary)] truncate">
                {{ searchResult.email }}
              </div>
            </div>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <template v-if="isSearchResultContact">
              <span class="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                In Contacts
              </span>
              <button
                type="button"
                data-test="search-result-message-btn"
                class="px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-500/15 text-[var(--fp-accent-bright)] hover:bg-indigo-500 hover:text-white transition-colors cursor-pointer"
                @click="handleSelect(searchResult.id)"
              >
                Message
              </button>
            </template>
            <template v-else-if="isSearchResultSelf">
              <span class="px-2 py-0.5 rounded text-[11px] font-medium text-[var(--fp-text-muted)] italic">
                You
              </span>
            </template>
            <template v-else>
              <button
                type="button"
                data-test="add-contact-btn"
                class="px-2.5 py-1 rounded-md text-xs font-semibold fp-btn-primary transition-all cursor-pointer"
                @click="handleAddContact(searchResult.email)"
              >
                Add to Contacts
              </button>
            </template>
          </div>
        </div>
      </div>

      <!-- Contacts Directory -->
      <div class="flex-1 overflow-y-auto p-4">
        <!-- Empty State -->
        <div
          v-if="sortedContacts.length === 0"
          class="py-10 text-center text-xs text-[var(--fp-text-muted)]"
        >
          No contacts yet. Search an email above to add friends.
        </div>

        <!-- Contact List -->
        <div v-else class="space-y-1">
          <div
            v-for="contact in sortedContacts"
            :key="contact.contact_user_id"
            data-test="contact-item"
            class="flex items-center justify-between p-2.5 rounded-[8px] hover:bg-[var(--fp-hover)] transition-colors group"
          >
            <!-- Clickable contact info -->
            <div
              class="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
              @click="handleSelect(contact.contact_user_id)"
            >
              <UserAvatar
                :display-name="contact.profile?.display_name || '?'"
                :avatar-color="contact.profile?.avatar_color || ''"
                :avatar-url="contact.profile?.avatar_url || null"
                :show-online="onlineUserIds.includes(contact.contact_user_id)"
                size="sm"
              />
              <div class="truncate">
                <div class="text-sm font-semibold text-[var(--fp-text-primary)] truncate">
                  {{ contact.profile?.display_name || 'Unknown User' }}
                </div>
                <div class="text-[11px] text-[var(--fp-text-secondary)] flex items-center gap-1.5 truncate">
                  <span>{{ contact.profile?.email || contact.contact_user_id }}</span>
                  <span>•</span>
                  <span :class="onlineUserIds.includes(contact.contact_user_id) ? 'text-emerald-500 font-medium' : 'text-[var(--fp-text-muted)]'">
                    {{ onlineUserIds.includes(contact.contact_user_id) ? 'Online' : 'Offline' }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex items-center gap-1.5 shrink-0 ml-2">
              <button
                type="button"
                :data-test="`message-contact-${contact.contact_user_id}`"
                title="Send Message"
                class="px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-500/15 text-[var(--fp-accent-bright)] hover:bg-indigo-500 hover:text-white transition-colors cursor-pointer"
                @click="handleSelect(contact.contact_user_id)"
              >
                Message
              </button>
              <button
                type="button"
                :data-test="`remove-contact-${contact.contact_user_id}`"
                aria-label="Remove contact"
                title="Remove contact"
                class="p-1.5 rounded-md text-[var(--fp-text-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                @click.stop="handleRemove(contact.contact_user_id)"
              >
                <!-- Trash Icon -->
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="1.8"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
