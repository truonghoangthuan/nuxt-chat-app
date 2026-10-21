<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { Pencil, Check, X } from '@lucide/vue'
import type { Conversation } from '~/types/chat'
import { isValidEmail } from '~/utils/chat'
import UserAvatar from '~/components/UserAvatar.vue'

const props = withDefaults(
  defineProps<{
    isOpen: boolean
    conversation: Conversation | null
    currentUserId?: string | null
    onlineUserIds?: string[]
  }>(),
  {
    conversation: null,
    currentUserId: null,
    onlineUserIds: () => [],
  },
)

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'addMember', email: string): void
  (e: 'leave', conversationId: string): void
  (e: 'updateTitle', newTitle: string): void
}>()

const newMemberEmail = ref('')
const addMemberError = ref<string | null>(null)
const isEditingTitle = ref(false)
const editedTitle = ref('')
const titleError = ref<string | null>(null)

function startEditTitle() {
  editedTitle.value = props.conversation?.title || ''
  titleError.value = null
  isEditingTitle.value = true
}

function cancelEditTitle() {
  isEditingTitle.value = false
  titleError.value = null
}

function handleSaveTitle() {
  const trimmed = editedTitle.value.trim()
  if (!trimmed) {
    titleError.value = 'Group name cannot be empty.'
    return
  }
  if (trimmed.length > 100) {
    titleError.value = 'Group name must be 100 characters or less.'
    return
  }
  titleError.value = null
  emit('updateTitle', trimmed)
  isEditingTitle.value = false
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.isOpen) {
    handleClose()
  }
}

watch(
  () => props.isOpen,
  (open) => {
    isEditingTitle.value = false
    titleError.value = null
    if (open) {
      newMemberEmail.value = ''
      addMemberError.value = null
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

const members = computed(() => props.conversation?.members || [])
const groupTitle = computed(() => props.conversation?.title || 'Group Chat')
const memberCountText = computed(() => {
  const count = members.value.length
  return `${count} ${count === 1 ? 'member' : 'members'}`
})

function handleAddMember() {
  const email = newMemberEmail.value.trim()
  if (!email || !isValidEmail(email)) {
    addMemberError.value = 'Please enter a valid email address.'
    return
  }

  const alreadyMember = members.value.some(
    m => m.profile?.email?.toLowerCase() === email.toLowerCase(),
  )
  if (alreadyMember) {
    addMemberError.value = 'This user is already a member.'
    return
  }

  addMemberError.value = null
  emit('addMember', email)
  newMemberEmail.value = ''
}

function handleLeave() {
  if (!props.conversation) return
  emit('leave', props.conversation.id)
}

function handleClose() {
  newMemberEmail.value = ''
  addMemberError.value = null
  isEditingTitle.value = false
  titleError.value = null
  emit('close')
}
</script>

<template>
  <div
    v-if="isOpen && conversation"
    data-test="group-info-backdrop"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
    @click.self="handleClose"
  >
    <div
      data-test="group-info-modal"
      class="w-full max-w-md fp-stage-surface rounded-[14px] border border-[var(--fp-border)] overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
    >
      <!-- Header -->
      <div class="px-5 py-4 border-b border-[var(--fp-border)] flex items-center justify-between shrink-0">
        <div class="min-w-0 flex-1 mr-3">
          <!-- Static Title View -->
          <div v-if="!isEditingTitle" class="flex items-center gap-2">
            <h3 data-test="group-title" class="fp-font-display text-[16px] font-bold text-[var(--fp-text-primary)] truncate">
              {{ groupTitle }}
            </h3>
            <button
              type="button"
              data-test="edit-title-btn"
              aria-label="Edit group name"
              class="w-6 h-6 rounded-md text-[var(--fp-text-secondary)] hover:text-[var(--fp-text-primary)] hover:bg-[var(--fp-hover)] flex items-center justify-center cursor-pointer transition-colors shrink-0"
              @click="startEditTitle"
            >
              <Pencil class="w-3.5 h-3.5" />
            </button>
          </div>

          <!-- Edit Title Form -->
          <div v-else>
            <form data-test="edit-title-form" class="flex items-center gap-1.5" @submit.prevent="handleSaveTitle">
              <input
                v-model="editedTitle"
                data-test="edit-title-input"
                type="text"
                maxlength="100"
                class="flex-1 min-w-0 px-2.5 py-1 text-sm font-semibold rounded-[6px] border border-[var(--fp-border)] bg-[var(--fp-input-bg)] text-[var(--fp-text-primary)] focus:outline-none focus:border-indigo-500"
                placeholder="Group name"
                autofocus
                @keydown.esc="cancelEditTitle"
              />
              <button
                type="submit"
                data-test="save-title-btn"
                aria-label="Save group name"
                class="w-7 h-7 rounded-[6px] bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center cursor-pointer shrink-0 transition-colors"
              >
                <Check class="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                data-test="cancel-edit-title-btn"
                aria-label="Cancel editing"
                class="w-7 h-7 rounded-[6px] border border-[var(--fp-border)] text-[var(--fp-text-secondary)] hover:text-[var(--fp-text-primary)] hover:bg-[var(--fp-hover)] flex items-center justify-center cursor-pointer shrink-0 transition-colors"
                @click="cancelEditTitle"
              >
                <X class="w-3.5 h-3.5" />
              </button>
            </form>
            <p v-if="titleError" data-test="title-error" class="text-xs text-rose-500 font-medium mt-1">
              {{ titleError }}
            </p>
          </div>

          <p data-test="member-count" class="text-xs text-[var(--fp-text-secondary)] mt-0.5">
            {{ memberCountText }}
          </p>
        </div>
        <button
          type="button"
          aria-label="Close"
          class="w-7 h-7 rounded-md text-[var(--fp-text-secondary)] hover:text-[var(--fp-text-primary)] hover:bg-[var(--fp-hover)] text-lg font-bold flex items-center justify-center cursor-pointer transition-colors shrink-0"
          @click="handleClose"
        >
          ×
        </button>
      </div>

      <!-- Body -->
      <div class="p-5 space-y-4 overflow-y-auto flex-1 min-h-0">
        <!-- Add Member Form -->
        <div>
          <label class="block text-xs font-semibold text-[var(--fp-text-secondary)] mb-1.5">
            Add Member
          </label>
          <form data-test="add-member-form" class="flex gap-2" @submit.prevent="handleAddMember">
            <input
              v-model="newMemberEmail"
              data-test="add-member-input"
              type="email"
              placeholder="friend@example.com"
              class="flex-1 px-3.5 py-2 rounded-[8px] border border-[var(--fp-border)] bg-[var(--fp-input-bg)] text-[14px] text-[var(--fp-text-primary)] placeholder-[var(--fp-text-muted)] focus:outline-none focus:border-indigo-500 transition-colors"
            />
            <button
              type="submit"
              data-test="add-member-btn"
              :disabled="!newMemberEmail.trim()"
              class="px-3.5 py-2 rounded-[8px] text-xs font-semibold fp-btn-primary disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shrink-0"
            >
              Add
            </button>
          </form>
          <p v-if="addMemberError" data-test="add-member-error" class="text-xs text-rose-500 font-medium mt-1">
            {{ addMemberError }}
          </p>
        </div>

        <!-- Members Roster -->
        <div>
          <label class="block text-xs font-semibold text-[var(--fp-text-secondary)] mb-2">
            Members Roster
          </label>
          <div class="space-y-1.5 max-h-60 overflow-y-auto rounded-[8px] border border-[var(--fp-border)] p-1.5 bg-[var(--fp-surface-muted)]">
            <div
              v-for="member in members"
              :key="member.user_id"
              :data-test="`member-item-${member.user_id}`"
              class="flex items-center justify-between p-2 rounded-[6px] hover:bg-[var(--fp-hover)] transition-colors"
            >
              <!-- Avatar & Details -->
              <div class="flex items-center gap-2.5 min-w-0">
                <UserAvatar
                  :display-name="member.profile?.display_name || member.profile?.email || member.user_id"
                  :avatar-color="member.profile?.avatar_color"
                  :avatar-url="member.profile?.avatar_url"
                  :show-online="onlineUserIds.includes(member.user_id)"
                  size="sm"
                />
                <div class="min-w-0">
                  <div class="flex items-center gap-1.5">
                    <p class="text-xs font-medium text-[var(--fp-text-primary)] truncate">
                      {{ member.profile?.display_name || member.profile?.email || member.user_id }}
                    </p>
                    <span
                      v-if="currentUserId && member.user_id === currentUserId"
                      class="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-indigo-500/15 text-indigo-600 dark:text-indigo-400"
                    >
                      (You)
                    </span>
                  </div>
                  <p v-if="member.profile?.email" class="text-[11px] text-[var(--fp-text-secondary)] truncate">
                    {{ member.profile.email }}
                  </p>
                </div>
              </div>

              <!-- Role Badge -->
              <div class="shrink-0 pl-2">
                <span
                  :data-test="`member-role-${member.user_id}`"
                  class="text-[11px] font-medium px-2 py-0.5 rounded-full"
                  :class="member.role === 'owner' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30' : 'bg-[var(--fp-hover)] text-[var(--fp-text-secondary)] border border-[var(--fp-border)]'"
                >
                  {{ member.role === 'owner' ? 'Owner' : 'Member' }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-5 py-3 border-t border-[var(--fp-border)] flex items-center justify-between shrink-0 bg-[var(--fp-stage-surface)]">
        <button
          type="button"
          data-test="leave-group-btn"
          class="px-3.5 py-1.5 rounded-[8px] text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
          @click="handleLeave"
        >
          Leave Group
        </button>
        <button
          type="button"
          class="px-4 py-2 rounded-[8px] text-xs border border-[var(--fp-border)] text-[var(--fp-text-secondary)] hover:text-[var(--fp-text-primary)] hover:bg-[var(--fp-hover)] transition-colors font-medium cursor-pointer"
          @click="handleClose"
        >
          Close
        </button>
      </div>
    </div>
  </div>
</template>
