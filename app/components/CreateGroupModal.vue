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
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
    @click.self="handleClose"
  >
    <div
      data-test="create-group-modal"
      class="w-full max-w-md rounded-[14px] border border-[var(--om-border-strong)] bg-[var(--om-card)] overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
    >
      <!-- Header -->
      <div class="px-5 py-4 border-b border-[var(--om-border)] flex items-center justify-between shrink-0">
        <div>
          <h3 class="text-[16px] font-semibold text-[var(--om-text-primary)]">
            Create a Group
          </h3>
          <p class="text-xs text-[var(--om-text-muted)] mt-0.5">
            Start a group conversation with your friends
          </p>
        </div>
        <button
          type="button"
          aria-label="Close"
          class="w-7 h-7 rounded-[6px] text-[var(--om-text-secondary)] hover:text-[var(--om-text-primary)] hover:bg-[var(--om-hover)] text-lg font-bold flex items-center justify-center cursor-pointer transition-colors"
          @click="handleClose"
        >
          ×
        </button>
      </div>

      <!-- Form Body -->
      <form class="flex flex-col flex-1 min-h-0" @submit.prevent="handleSubmit">
        <div class="p-5 space-y-4 overflow-y-auto flex-1">
          <!-- Group Title -->
          <div>
            <label class="block text-xs font-semibold text-[var(--om-text-secondary)] mb-1.5">
              Group Title <span class="text-rose-500">*</span>
            </label>
            <input
              v-model="title"
              data-test="group-title-input"
              type="text"
              required
              placeholder="e.g. Project Squad, Weekend Gamers"
              class="w-full px-3.5 py-1.5 rounded-[8px] border border-[var(--om-border)] bg-[var(--om-input-bg)] text-sm text-[var(--om-text-primary)] placeholder-[var(--om-text-muted)] focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          <!-- Selected Members Chips -->
          <div v-if="selectedUserIds.length > 0 || invitedEmails.length > 0" class="space-y-1.5">
            <label class="block text-xs font-semibold text-[var(--om-text-secondary)]">
              Selected Members ({{ selectedUserIds.length + invitedEmails.length }})
            </label>
            <div class="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1.5 rounded-[8px] bg-[var(--om-input-bg)] border border-[var(--om-border)]">
              <!-- Contact chips -->
              <span
                v-for="userId in selectedUserIds"
                :key="userId"
                :data-test="`selected-contact-chip-${userId}`"
                class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-500/15 border border-indigo-500/30 text-indigo-400"
              >
                <span>{{ contactMap.get(userId)?.profile?.display_name || contactMap.get(userId)?.profile?.email || userId }}</span>
                <button
                  type="button"
                  :data-test="`remove-contact-chip-${userId}`"
                  class="w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-indigo-500/30 text-xs font-bold leading-none cursor-pointer"
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
                class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 border border-emerald-500/30 text-emerald-400"
              >
                <span>{{ email }}</span>
                <button
                  type="button"
                  :data-test="`remove-email-chip-${email}`"
                  class="w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-emerald-500/30 text-xs font-bold leading-none cursor-pointer"
                  @click.stop="removeInvitedEmail(email)"
                >
                  ×
                </button>
              </span>
            </div>
          </div>

          <!-- Add Invitee by Email -->
          <div>
            <label class="block text-xs font-semibold text-[var(--om-text-secondary)] mb-1.5">
              Invite by Email
            </label>
            <div class="flex gap-2">
              <input
                v-model="emailInput"
                data-test="invite-email-input"
                type="email"
                placeholder="colleague@example.com"
                class="flex-1 px-3.5 py-1.5 rounded-[8px] border border-[var(--om-border)] bg-[var(--om-input-bg)] text-sm text-[var(--om-text-primary)] placeholder-[var(--om-text-muted)] focus:outline-none focus:border-indigo-500 transition-colors"
                @keydown.enter.prevent="addInvitedEmail"
              />
              <button
                type="button"
                data-test="add-email-btn"
                :disabled="!emailInput.trim()"
                class="px-3.5 py-1.5 rounded-[8px] text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shrink-0"
                @click.prevent="addInvitedEmail"
              >
                Add
              </button>
            </div>
            <p v-if="emailError" data-test="email-error" class="text-xs text-rose-500 font-medium mt-1">
              {{ emailError }}
            </p>
          </div>

          <!-- Contact Multiselect List -->
          <div>
            <label class="block text-xs font-semibold text-[var(--om-text-secondary)] mb-1.5">
              Select Contacts
            </label>
            <div v-if="contacts.length === 0" class="text-xs text-[var(--om-text-muted)] py-3 text-center border border-dashed border-[var(--om-border)] rounded-[8px]">
              No contacts found. You can invite people by email above.
            </div>
            <div v-else class="space-y-1 max-h-48 overflow-y-auto rounded-[8px] border border-[var(--om-border)] p-1 bg-[var(--om-input-bg)]">
              <div
                v-for="contact in contacts"
                :key="contact.contact_user_id"
                :data-test="`contact-item-${contact.contact_user_id}`"
                role="button"
                tabindex="0"
                class="flex items-center justify-between p-2 rounded-[6px] hover:bg-[var(--om-hover)] cursor-pointer transition-colors"
                :class="{ 'bg-indigo-500/15': selectedUserIds.includes(contact.contact_user_id) }"
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
                    <p class="text-xs font-medium text-[var(--om-text-primary)] truncate">
                      {{ contact.profile?.display_name || contact.profile?.email || contact.contact_user_id }}
                    </p>
                    <p v-if="contact.profile?.email && contact.profile?.display_name" class="text-[11px] text-[var(--om-text-muted)] truncate">
                      {{ contact.profile.email }}
                    </p>
                  </div>
                </div>

                <!-- Checkbox Indicator -->
                <div
                  class="w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0"
                  :class="selectedUserIds.includes(contact.contact_user_id) ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-[var(--om-border-strong)]'"
                >
                  <svg v-if="selectedUserIds.includes(contact.contact_user_id)" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-5 py-3 border-t border-[var(--om-border)] flex items-center justify-end gap-2.5 shrink-0 bg-[var(--om-card)]">
          <button
            type="button"
            class="px-4 py-1.5 rounded-[8px] text-xs border border-[var(--om-border)] text-[var(--om-text-secondary)] hover:text-[var(--om-text-primary)] hover:bg-[var(--om-hover)] transition-colors font-medium cursor-pointer"
            @click="handleClose"
          >
            Cancel
          </button>
          <button
            type="submit"
            data-test="submit-group-btn"
            :disabled="!isValid"
            class="px-4 py-1.5 rounded-[8px] text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            Create Group
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
