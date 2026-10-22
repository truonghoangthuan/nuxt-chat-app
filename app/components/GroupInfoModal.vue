<script setup lang="ts">
import { ref, computed, watch, onUnmounted, nextTick } from 'vue'
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
const titleInputRef = ref<HTMLInputElement | null>(null)

function startEditTitle() {
  editedTitle.value = props.conversation?.title || ''
  titleError.value = null
  isEditingTitle.value = true
  nextTick(() => {
    titleInputRef.value?.focus()
  })
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
  if (trimmed === (props.conversation?.title || '').trim()) {
    isEditingTitle.value = false
    return
  }
  emit('updateTitle', trimmed)
  isEditingTitle.value = false
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.isOpen) {
    handleClose()
  }
}

watch(
  () => [props.isOpen, props.conversation?.id],
  ([open]) => {
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
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
    @click.self="handleClose"
  >
    <div
      data-test="group-info-modal"
      class="w-full max-w-md rounded-2xl border border-white/15 bg-[#161824]/90 backdrop-blur-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
    >
      <!-- Header -->
      <div class="px-5 py-4 border-b border-white/5 flex items-center justify-between shrink-0">
        <div class="min-w-0 flex-1 mr-3">
          <!-- Static Title View -->
          <div v-if="!isEditingTitle" class="flex items-center gap-2">
            <h3 data-test="group-title" class="text-[15px] font-semibold text-white/95 truncate tracking-tight">
              {{ groupTitle }}
            </h3>
            <button
              type="button"
              data-test="edit-title-btn"
              aria-label="Edit group name"
              class="w-6 h-6 rounded-full text-white/60 hover:text-white hover:bg-white/10 flex items-center justify-center cursor-pointer transition-colors shrink-0"
              @click="startEditTitle"
            >
              <Pencil class="w-3.5 h-3.5" />
            </button>
          </div>

          <!-- Edit Title Form -->
          <div v-else>
            <form data-test="edit-title-form" class="flex items-center gap-1.5" @submit.prevent="handleSaveTitle">
              <input
                ref="titleInputRef"
                v-model="editedTitle"
                data-test="edit-title-input"
                type="text"
                maxlength="100"
                class="flex-1 min-w-0 px-3 py-1 text-xs font-semibold rounded-full border border-white/10 bg-white/8 text-white focus:outline-none focus:bg-white/12 focus:ring-1 focus:ring-blue-500/50"
                placeholder="Group name"
                autofocus
                @keydown.esc.stop="cancelEditTitle"
              />
              <button
                type="submit"
                data-test="save-title-btn"
                aria-label="Save group name"
                class="w-7 h-7 rounded-full bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center cursor-pointer shrink-0 transition-colors shadow-xs"
              >
                <Check class="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                data-test="cancel-edit-title-btn"
                aria-label="Cancel editing"
                class="w-7 h-7 rounded-full border border-white/10 text-white/60 hover:text-white hover:bg-white/10 flex items-center justify-center cursor-pointer shrink-0 transition-colors"
                @click="cancelEditTitle"
              >
                <X class="w-3.5 h-3.5" />
              </button>
            </form>
            <p v-if="titleError" data-test="title-error" class="text-xs text-rose-400 font-medium mt-1">
              {{ titleError }}
            </p>
          </div>

          <p data-test="member-count" class="text-xs text-white/40 mt-0.5">
            {{ memberCountText }}
          </p>
        </div>
        <button
          type="button"
          aria-label="Close"
          class="w-7 h-7 rounded-full text-white/60 hover:text-white hover:bg-white/10 text-lg font-bold flex items-center justify-center cursor-pointer transition-colors shrink-0"
          @click="handleClose"
        >
          ×
        </button>
      </div>

      <!-- Body -->
      <div class="p-5 space-y-4 overflow-y-auto flex-1 min-h-0 custom-scroll">
        <!-- Add Member Form -->
        <div>
          <label class="block text-xs font-semibold text-white/70 mb-1.5">
            Add Member
          </label>
          <form data-test="add-member-form" class="flex gap-2" @submit.prevent="handleAddMember">
            <input
              v-model="newMemberEmail"
              data-test="add-member-input"
              type="email"
              placeholder="friend@example.com"
              class="flex-1 h-10 px-4 text-xs rounded-full border border-white/10 bg-white/8 text-white placeholder-white/40 focus:outline-none focus:bg-white/12 focus:ring-1 focus:ring-blue-500/50 transition-all"
            />
            <button
              type="submit"
              data-test="add-member-btn"
              :disabled="!newMemberEmail.trim()"
              class="h-10 px-4 rounded-full text-xs font-semibold bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shadow-md shadow-blue-500/30 shrink-0"
            >
              Add
            </button>
          </form>
          <p v-if="addMemberError" data-test="add-member-error" class="text-xs text-rose-400 font-medium mt-1">
            {{ addMemberError }}
          </p>
        </div>

        <!-- Members Roster -->
        <div>
          <label class="block text-xs font-semibold text-white/70 mb-2">
            Members Roster
          </label>
          <div class="space-y-1 max-h-60 overflow-y-auto rounded-2xl border border-white/10 p-1.5 bg-white/5 custom-scroll">
            <div
              v-for="member in members"
              :key="member.user_id"
              :data-test="`member-item-${member.user_id}`"
              class="flex items-center justify-between p-2 rounded-xl hover:bg-white/5 transition-colors"
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
                    <p class="text-xs font-medium text-white/95 truncate">
                      {{ member.profile?.display_name || member.profile?.email || member.user_id }}
                    </p>
                    <span
                      v-if="currentUserId && member.user_id === currentUserId"
                      class="text-[10px] font-semibold px-1.5 py-0.2 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30"
                    >
                      (You)
                    </span>
                  </div>
                  <p v-if="member.profile?.email" class="text-[11px] text-white/40 truncate font-mono">
                    {{ member.profile.email }}
                  </p>
                </div>
              </div>

              <!-- Role Badge -->
              <div class="shrink-0 pl-2">
                <span
                  :data-test="`member-role-${member.user_id}`"
                  class="text-[11px] font-medium px-2 py-0.5 rounded-full"
                  :class="member.role === 'owner' ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' : 'bg-white/5 text-white/50 border border-white/10'"
                >
                  {{ member.role === 'owner' ? 'Owner' : 'Member' }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-5 py-3 border-t border-white/5 flex items-center justify-between shrink-0 bg-white/2">
        <button
          type="button"
          data-test="leave-group-btn"
          class="px-4 py-2 rounded-full text-xs font-medium text-rose-400 hover:bg-rose-500/15 transition-colors cursor-pointer"
          @click="handleLeave"
        >
          Leave Group
        </button>
        <button
          type="button"
          class="px-4 py-2 rounded-full text-xs border border-white/10 bg-white/5 hover:bg-white/10 text-white/80 hover:text-white transition-colors font-medium cursor-pointer"
          @click="handleClose"
        >
          Close
        </button>
      </div>
    </div>
  </div>
</template>
