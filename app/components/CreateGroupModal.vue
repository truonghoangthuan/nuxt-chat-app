<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import type { Contact } from '~/types/chat'
import { isValidEmail } from '~/utils/chat'
import UserAvatar from '~/components/UserAvatar.vue'

const props = withDefaults(
  defineProps<{
    isOpen: boolean
    contacts: Contact[]
  }>(),
  {
    contacts: () => [],
  },
)

const emit = defineEmits<{
  (e: 'close'): void
  (
    e: 'create',
    payload: {
      title: string
      memberUserIds: string[]
      invitedEmails: string[]
    },
  ): void
}>()

const title = ref('')
const selectedUserIds = ref<string[]>([])
const invitedEmails = ref<string[]>([])
const emailInput = ref('')
const emailError = ref<string | null>(null)

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.isOpen) {
    handleClose()
  }
}

function resetForm() {
  title.value = ''
  selectedUserIds.value = []
  invitedEmails.value = []
  emailInput.value = ''
  emailError.value = null
}

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      resetForm()
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

const isValid = computed(() => {
  const hasTitle = title.value.trim().length > 0
  const hasMembers = selectedUserIds.value.length + invitedEmails.value.length > 0
  return hasTitle && hasMembers
})

// Lookup map for contacts
const contactMap = computed(() => {
  const map = new Map<string, Contact>()
  for (const c of props.contacts) {
    map.set(c.contact_user_id, c)
  }
  return map
})

function toggleContact(userId: string) {
  const index = selectedUserIds.value.indexOf(userId)
  if (index >= 0) {
    selectedUserIds.value.splice(index, 1)
  } else {
    selectedUserIds.value.push(userId)
  }
}

function removeSelectedUser(userId: string) {
  const index = selectedUserIds.value.indexOf(userId)
  if (index >= 0) {
    selectedUserIds.value.splice(index, 1)
  }
}

function addInvitedEmail() {
  const email = emailInput.value.trim().toLowerCase()
  if (!email) return

  if (!isValidEmail(email)) {
    emailError.value = 'Please enter a valid email address.'
    return
  }

  if (invitedEmails.value.includes(email)) {
    emailInput.value = ''
    emailError.value = null
    return
  }

  invitedEmails.value.push(email)
  emailInput.value = ''
  emailError.value = null
}

function removeInvitedEmail(email: string) {
  const index = invitedEmails.value.indexOf(email)
  if (index >= 0) {
    invitedEmails.value.splice(index, 1)
  }
}

function handleClose() {
  resetForm()
  emit('close')
}

function handleSubmit() {
  if (!isValid.value) return

  emit('create', {
    title: title.value.trim(),
    memberUserIds: [...selectedUserIds.value],
    invitedEmails: [...invitedEmails.value],
  })

  resetForm()
}
</script>

<template>
  <div
    v-if="isOpen"
    data-test="create-group-backdrop"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
    @click.self="handleClose"
  >
    <div
      data-test="create-group-modal"
      class="w-full max-w-md rounded-2xl border border-white/15 bg-[#161824]/90 backdrop-blur-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
    >
      <!-- Header -->
      <div class="px-5 py-4 border-b border-white/5 flex items-center justify-between shrink-0">
        <div>
          <h3 class="text-[15px] font-semibold text-white/95 tracking-tight">
            Create a Group
          </h3>
          <p class="text-xs text-white/40 mt-0.5">
            Start a group conversation with your friends
          </p>
        </div>
        <button
          type="button"
          aria-label="Close"
          class="w-7 h-7 rounded-full text-white/60 hover:text-white hover:bg-white/10 text-lg font-bold flex items-center justify-center cursor-pointer transition-colors"
          @click="handleClose"
        >
          ×
        </button>
      </div>

      <!-- Form Body -->
      <form class="flex flex-col flex-1 min-h-0" @submit.prevent="handleSubmit">
        <div class="p-5 space-y-4 overflow-y-auto flex-1 custom-scroll">
          <!-- Group Title -->
          <div>
            <label class="block text-xs font-semibold text-white/70 mb-1.5">
              Group Title <span class="text-rose-400">*</span>
            </label>
            <input
              v-model="title"
              data-test="group-title-input"
              type="text"
              required
              placeholder="e.g. Project Squad, Weekend Gamers"
              class="w-full h-10 px-4 text-xs rounded-full border border-white/10 bg-white/8 text-white placeholder-white/40 focus:outline-none focus:bg-white/12 focus:ring-1 focus:ring-blue-500/50 transition-all"
            />
          </div>

          <!-- Selected Members Chips -->
          <div v-if="selectedUserIds.length > 0 || invitedEmails.length > 0" class="space-y-1.5">
            <label class="block text-xs font-semibold text-white/70">
              Selected Members ({{ selectedUserIds.length + invitedEmails.length }})
            </label>
            <div class="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 rounded-2xl bg-white/5 border border-white/10 custom-scroll">
              <!-- Contact chips -->
              <span
                v-for="userId in selectedUserIds"
                :key="userId"
                :data-test="`selected-contact-chip-${userId}`"
                class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-blue-500/20 border border-blue-500/30 text-blue-300 backdrop-blur-xs"
              >
                <span>{{ contactMap.get(userId)?.profile?.display_name || contactMap.get(userId)?.profile?.email || userId }}</span>
                <button
                  type="button"
                  :data-test="`remove-contact-chip-${userId}`"
                  class="w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-white/20 text-xs font-bold leading-none cursor-pointer"
                  @click.stop="removeSelectedUser(userId)"
                >
                  ×
                </button>
              </span>

              <!-- Invited email chips -->
              <span
                v-for="email in invitedEmails"
                :key="email"
                :data-test="`invited-email-chip-${email}`"
                class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 backdrop-blur-xs"
              >
                <span>{{ email }}</span>
                <button
                  type="button"
                  :data-test="`remove-email-chip-${email}`"
                  class="w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-white/20 text-xs font-bold leading-none cursor-pointer"
                  @click.stop="removeInvitedEmail(email)"
                >
                  ×
                </button>
              </span>
            </div>
          </div>

          <!-- Add Invitee by Email -->
          <div>
            <label class="block text-xs font-semibold text-white/70 mb-1.5">
              Invite by Email
            </label>
            <div class="flex gap-2">
              <input
                v-model="emailInput"
                data-test="invite-email-input"
                type="email"
                placeholder="colleague@example.com"
                class="flex-1 h-10 px-4 text-xs rounded-full border border-white/10 bg-white/8 text-white placeholder-white/40 focus:outline-none focus:bg-white/12 focus:ring-1 focus:ring-blue-500/50 transition-all"
                @keydown.enter.prevent="addInvitedEmail"
              />
              <button
                type="button"
                data-test="add-email-btn"
                :disabled="!emailInput.trim()"
                class="h-10 px-4 rounded-full text-xs font-semibold bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shadow-md shadow-blue-500/30 shrink-0"
                @click.prevent="addInvitedEmail"
              >
                Add
              </button>
            </div>
            <p v-if="emailError" data-test="email-error" class="text-xs text-rose-400 font-medium mt-1">
              {{ emailError }}
            </p>
          </div>

          <!-- Contact Multiselect List -->
          <div>
            <label class="block text-xs font-semibold text-white/70 mb-1.5">
              Select Contacts
            </label>
            <div v-if="contacts.length === 0" class="text-xs text-white/40 py-3 text-center border border-dashed border-white/10 rounded-2xl">
              No contacts found. You can invite people by email above.
            </div>
            <div v-else class="space-y-1 max-h-48 overflow-y-auto rounded-2xl border border-white/10 p-1.5 bg-white/5 custom-scroll">
              <div
                v-for="contact in contacts"
                :key="contact.contact_user_id"
                :data-test="`contact-item-${contact.contact_user_id}`"
                role="button"
                tabindex="0"
                class="flex items-center justify-between p-2 rounded-xl hover:bg-white/5 cursor-pointer transition-colors"
                :class="{ 'bg-blue-600/25 border border-blue-500/30': selectedUserIds.includes(contact.contact_user_id) }"
                @click="toggleContact(contact.contact_user_id)"
                @keydown.enter.space.prevent="toggleContact(contact.contact_user_id)"
              >
                <div class="flex items-center gap-2.5 min-w-0">
                  <UserAvatar
                    :display-name="contact.profile?.display_name || contact.profile?.email || contact.contact_user_id"
                    :avatar-color="contact.profile?.avatar_color"
                    :avatar-url="contact.profile?.avatar_url"
                    size="sm"
                  />
                  <div class="min-w-0">
                    <p class="text-xs font-medium text-white/95 truncate">
                      {{ contact.profile?.display_name || contact.profile?.email || contact.contact_user_id }}
                    </p>
                    <p v-if="contact.profile?.email && contact.profile?.display_name" class="text-[11px] text-white/40 truncate font-mono">
                      {{ contact.profile.email }}
                    </p>
                  </div>
                </div>

                <!-- Checkbox Indicator -->
                <div
                  class="w-4 h-4 rounded-full border flex items-center justify-center transition-colors shrink-0"
                  :class="selectedUserIds.includes(contact.contact_user_id) ? 'bg-blue-500 border-blue-500 text-white' : 'border-white/20'"
                >
                  <svg v-if="selectedUserIds.includes(contact.contact_user_id)" class="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-5 py-3 border-t border-white/5 flex items-center justify-end gap-2.5 shrink-0 bg-white/2">
          <button
            type="button"
            class="px-4 py-2 rounded-full text-xs border border-white/10 bg-white/5 hover:bg-white/10 text-white/80 hover:text-white transition-colors font-medium cursor-pointer"
            @click="handleClose"
          >
            Cancel
          </button>
          <button
            type="submit"
            data-test="submit-group-btn"
            :disabled="!isValid"
            class="px-5 py-2 rounded-full text-xs font-semibold bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shadow-md shadow-blue-500/30"
          >
            Create Group
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
