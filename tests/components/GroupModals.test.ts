import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CreateGroupModal from '~/components/CreateGroupModal.vue'
import GroupInfoModal from '~/components/GroupInfoModal.vue'
import type { Contact, Conversation } from '~/types/chat'

describe('CreateGroupModal.vue', () => {
  const mockContacts: Contact[] = [
    {
      user_id: 'me-1',
      contact_user_id: 'u-1',
      created_at: '2026-10-20T08:00:00Z',
      profile: {
        id: 'u-1',
        email: 'alice@example.com',
        display_name: 'Alice',
        avatar_color: '#6366f1',
      },
    },
    {
      user_id: 'me-1',
      contact_user_id: 'u-2',
      created_at: '2026-10-20T09:00:00Z',
      profile: {
        id: 'u-2',
        email: 'bob@example.com',
        display_name: 'Bob',
        avatar_color: '#f59e0b',
      },
    },
    {
      user_id: 'me-1',
      contact_user_id: 'u-3',
      created_at: '2026-10-20T10:00:00Z',
      profile: {
        id: 'u-3',
        email: 'charlie@example.com',
        display_name: 'Charlie',
        avatar_color: '#10b981',
      },
    },
  ]

  it('does not render modal content when isOpen is false', () => {
    const wrapper = mount(CreateGroupModal, {
      props: {
        isOpen: false,
        contacts: mockContacts,
      },
    })
    expect(wrapper.find('[data-test="create-group-modal"]').exists()).toBe(false)
  })

  it('renders modal content when isOpen is true', () => {
    const wrapper = mount(CreateGroupModal, {
      props: {
        isOpen: true,
        contacts: mockContacts,
      },
    })
    expect(wrapper.find('[data-test="create-group-modal"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="group-title-input"]').exists()).toBe(true)
  })

  it('emits close when clicking close button, backdrop, or pressing Escape', async () => {
    const wrapper = mount(CreateGroupModal, {
      props: {
        isOpen: true,
        contacts: mockContacts,
      },
      attachTo: document.body,
    })

    // 1. Close button
    const closeBtn = wrapper.find('[aria-label="Close"]')
    expect(closeBtn.exists()).toBe(true)
    await closeBtn.trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)

    // 2. Backdrop click
    const backdrop = wrapper.find('[data-test="create-group-backdrop"]')
    await backdrop.trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(2)

    // 3. Escape key
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('close')).toHaveLength(3)

    wrapper.unmount()
  })

  it('validates required fields: disables submit when title or members are empty', async () => {
    const wrapper = mount(CreateGroupModal, {
      props: {
        isOpen: true,
        contacts: mockContacts,
      },
    })

    const submitBtn = wrapper.find('[data-test="submit-group-btn"]')
    expect(submitBtn.attributes('disabled')).toBeDefined()

    // Title only, no members
    const titleInput = wrapper.find('[data-test="group-title-input"]')
    await titleInput.setValue('Gamers Club')
    expect(submitBtn.attributes('disabled')).toBeDefined()

    // Select a contact -> now valid
    const contactItem = wrapper.find('[data-test="contact-item-u-1"]')
    await contactItem.trigger('click')
    expect(submitBtn.attributes('disabled')).toBeUndefined()

    // Clear title -> disabled again
    await titleInput.setValue('   ')
    expect(submitBtn.attributes('disabled')).toBeDefined()
  })

  it('toggles contact selection and renders selected chips with quick remove', async () => {
    const wrapper = mount(CreateGroupModal, {
      props: {
        isOpen: true,
        contacts: mockContacts,
      },
    })

    // Click contact u-1 to select
    await wrapper.find('[data-test="contact-item-u-1"]').trigger('click')
    expect(wrapper.find('[data-test="selected-contact-chip-u-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="selected-contact-chip-u-1"]').text()).toContain('Alice')

    // Click contact u-2 to select
    await wrapper.find('[data-test="contact-item-u-2"]').trigger('click')
    expect(wrapper.find('[data-test="selected-contact-chip-u-2"]').exists()).toBe(true)

    // Click chip remove button on u-1
    await wrapper.find('[data-test="remove-contact-chip-u-1"]').trigger('click')
    expect(wrapper.find('[data-test="selected-contact-chip-u-1"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="selected-contact-chip-u-2"]').exists()).toBe(true)

    // Click contact u-2 again in list to toggle off
    await wrapper.find('[data-test="contact-item-u-2"]').trigger('click')
    expect(wrapper.find('[data-test="selected-contact-chip-u-2"]').exists()).toBe(false)
  })

  it('adds invited email on-the-fly with validation and allows removing chips', async () => {
    const wrapper = mount(CreateGroupModal, {
      props: {
        isOpen: true,
        contacts: mockContacts,
      },
    })

    const emailInput = wrapper.find('[data-test="invite-email-input"]')
    const addEmailBtn = wrapper.find('[data-test="add-email-btn"]')

    // Invalid email rejection
    await emailInput.setValue('invalid-email')
    await addEmailBtn.trigger('click')
    expect(wrapper.find('[data-test="email-error"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-test^="invited-email-chip-"]')).toHaveLength(0)

    // Valid email addition
    await emailInput.setValue('dave@example.com')
    await addEmailBtn.trigger('click')
    expect(wrapper.find('[data-test="email-error"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="invited-email-chip-dave@example.com"]').exists()).toBe(true)
    expect((emailInput.element as HTMLInputElement).value).toBe('')

    // Duplicate email rejection/ignored
    await emailInput.setValue('dave@example.com')
    await addEmailBtn.trigger('click')
    expect(wrapper.findAll('[data-test^="invited-email-chip-"]')).toHaveLength(1)

    // Remove email chip
    await wrapper.find('[data-test="remove-email-chip-dave@example.com"]').trigger('click')
    expect(wrapper.find('[data-test="invited-email-chip-dave@example.com"]').exists()).toBe(false)
  })

  it('submits valid form and emits create payload, then resets inputs', async () => {
    const wrapper = mount(CreateGroupModal, {
      props: {
        isOpen: true,
        contacts: mockContacts,
      },
    })

    // Enter title
    await wrapper.find('[data-test="group-title-input"]').setValue('Project Squad')

    // Select u-1
    await wrapper.find('[data-test="contact-item-u-1"]').trigger('click')

    // Add email invitee
    await wrapper.find('[data-test="invite-email-input"]').setValue('external@example.com')
    await wrapper.find('[data-test="add-email-btn"]').trigger('click')

    // Submit form
    await wrapper.find('form').trigger('submit')

    const createEvents = wrapper.emitted('create')
    expect(createEvents).toHaveLength(1)
    expect(createEvents![0]).toEqual([
      {
        title: 'Project Squad',
        memberUserIds: ['u-1'],
        invitedEmails: ['external@example.com'],
      },
    ])

    // Verify form resets
    expect((wrapper.find('[data-test="group-title-input"]').element as HTMLInputElement).value).toBe('')
    expect(wrapper.findAll('[data-test^="selected-contact-chip-"]')).toHaveLength(0)
    expect(wrapper.findAll('[data-test^="invited-email-chip-"]')).toHaveLength(0)
  })
})

describe('GroupInfoModal.vue', () => {
  const mockGroupConversation: Conversation = {
    id: 'conv-group-1',
    type: 'group',
    title: 'Secret Agents',
    created_by: 'u-1',
    created_at: '2026-10-20T08:00:00Z',
    members: [
      {
        conversation_id: 'conv-group-1',
        user_id: 'u-1',
        role: 'owner',
        joined_at: '2026-10-20T08:00:00Z',
        profile: {
          id: 'u-1',
          email: 'alice@example.com',
          display_name: 'Alice Agent',
          avatar_color: '#6366f1',
        },
      },
      {
        conversation_id: 'conv-group-1',
        user_id: 'u-2',
        role: 'member',
        joined_at: '2026-10-20T08:30:00Z',
        profile: {
          id: 'u-2',
          email: 'bob@example.com',
          display_name: 'Bob Builder',
          avatar_color: '#f59e0b',
        },
      },
    ],
  }

  it('does not render when isOpen is false or conversation is null', () => {
    const wrapperHidden = mount(GroupInfoModal, {
      props: {
        isOpen: false,
        conversation: mockGroupConversation,
        onlineUserIds: [],
      },
    })
    expect(wrapperHidden.find('[data-test="group-info-modal"]').exists()).toBe(false)

    const wrapperNullConv = mount(GroupInfoModal, {
      props: {
        isOpen: true,
        conversation: null,
        onlineUserIds: [],
      },
    })
    expect(wrapperNullConv.find('[data-test="group-info-modal"]').exists()).toBe(false)
  })

  it('renders group title, member count, and members list when open', () => {
    const wrapper = mount(GroupInfoModal, {
      props: {
        isOpen: true,
        conversation: mockGroupConversation,
        currentUserId: 'u-2',
        onlineUserIds: ['u-1'],
      },
    })

    expect(wrapper.find('[data-test="group-info-modal"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="group-title"]').text()).toBe('Secret Agents')
    expect(wrapper.find('[data-test="member-count"]').text()).toContain('2 members')

    // Member 1 (Alice - Owner, online)
    const member1 = wrapper.find('[data-test="member-item-u-1"]')
    expect(member1.exists()).toBe(true)
    expect(member1.text()).toContain('Alice Agent')
    expect(member1.text()).toContain('alice@example.com')
    expect(wrapper.find('[data-test="member-role-u-1"]').text()).toBe('Owner')

    // Member 2 (Bob - Member, offline, current user)
    const member2 = wrapper.find('[data-test="member-item-u-2"]')
    expect(member2.exists()).toBe(true)
    expect(member2.text()).toContain('Bob Builder')
    expect(member2.text()).toContain('(You)')
    expect(wrapper.find('[data-test="member-role-u-2"]').text()).toBe('Member')
  })

  it('emits close when clicking close button, backdrop, or pressing Escape', async () => {
    const wrapper = mount(GroupInfoModal, {
      props: {
        isOpen: true,
        conversation: mockGroupConversation,
        onlineUserIds: [],
      },
      attachTo: document.body,
    })

    // 1. Close button
    const closeBtn = wrapper.find('[aria-label="Close"]')
    expect(closeBtn.exists()).toBe(true)
    await closeBtn.trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)

    // 2. Backdrop click
    const backdrop = wrapper.find('[data-test="group-info-backdrop"]')
    await backdrop.trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(2)

    // 3. Escape key
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('close')).toHaveLength(3)

    wrapper.unmount()
  })

  it('validates and emits addMember with email', async () => {
    const wrapper = mount(GroupInfoModal, {
      props: {
        isOpen: true,
        conversation: mockGroupConversation,
        onlineUserIds: [],
      },
    })

    const input = wrapper.find('[data-test="add-member-input"]')
    const form = wrapper.find('[data-test="add-member-form"]')

    // Invalid email
    await input.setValue('not-an-email')
    await form.trigger('submit')
    expect(wrapper.emitted('addMember')).toBeUndefined()
    expect(wrapper.find('[data-test="add-member-error"]').exists()).toBe(true)

    // Valid email
    await input.setValue('charlie@example.com')
    await form.trigger('submit')
    expect(wrapper.emitted('addMember')).toHaveLength(1)
    expect(wrapper.emitted('addMember')![0]).toEqual(['charlie@example.com'])
    expect((input.element as HTMLInputElement).value).toBe('')
    expect(wrapper.find('[data-test="add-member-error"]').exists()).toBe(false)
  })

  it('emits leave with conversation ID when clicking Leave Group button', async () => {
    const wrapper = mount(GroupInfoModal, {
      props: {
        isOpen: true,
        conversation: mockGroupConversation,
        currentUserId: 'u-2',
        onlineUserIds: [],
      },
    })

    const leaveBtn = wrapper.find('[data-test="leave-group-btn"]')
    expect(leaveBtn.exists()).toBe(true)
    await leaveBtn.trigger('click')

    expect(wrapper.emitted('leave')).toHaveLength(1)
    expect(wrapper.emitted('leave')![0]).toEqual(['conv-group-1'])
  })

  it('renders edit button and toggles inline title input', async () => {
    const wrapper = mount(GroupInfoModal, {
      props: {
        isOpen: true,
        conversation: mockGroupConversation,
        onlineUserIds: [],
      },
    })

    const editBtn = wrapper.find('[data-test="edit-title-btn"]')
    expect(editBtn.exists()).toBe(true)

    // Not editing initially
    expect(wrapper.find('[data-test="edit-title-input"]').exists()).toBe(false)

    // Click edit button -> input appears with current title
    await editBtn.trigger('click')
    const input = wrapper.find('[data-test="edit-title-input"]')
    expect(input.exists()).toBe(true)
    expect((input.element as HTMLInputElement).value).toBe('Secret Agents')

    // Click cancel button -> returns to static view
    const cancelBtn = wrapper.find('[data-test="cancel-edit-title-btn"]')
    await cancelBtn.trigger('click')
    expect(wrapper.find('[data-test="edit-title-input"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="group-title"]').text()).toBe('Secret Agents')
  })

  it('validates title and emits updateTitle event when saved', async () => {
    const wrapper = mount(GroupInfoModal, {
      props: {
        isOpen: true,
        conversation: mockGroupConversation,
        onlineUserIds: [],
      },
    })

    await wrapper.find('[data-test="edit-title-btn"]').trigger('click')
    const input = wrapper.find('[data-test="edit-title-input"]')
    const form = wrapper.find('[data-test="edit-title-form"]')

    // Empty title
    await input.setValue('   ')
    await form.trigger('submit')
    expect(wrapper.emitted('updateTitle')).toBeUndefined()
    expect(wrapper.find('[data-test="title-error"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="title-error"]').text()).toContain('Group name cannot be empty.')

    // Valid title
    await input.setValue('Delta Squad')
    await form.trigger('submit')
    expect(wrapper.emitted('updateTitle')).toHaveLength(1)
    expect(wrapper.emitted('updateTitle')![0]).toEqual(['Delta Squad'])
    expect(wrapper.find('[data-test="edit-title-input"]').exists()).toBe(false)
  })

  it('rejects title longer than 100 characters and cancels on escape', async () => {
    const wrapper = mount(GroupInfoModal, {
      props: {
        isOpen: true,
        conversation: mockGroupConversation,
        onlineUserIds: [],
      },
    })

    await wrapper.find('[data-test="edit-title-btn"]').trigger('click')
    const input = wrapper.find('[data-test="edit-title-input"]')
    const form = wrapper.find('[data-test="edit-title-form"]')

    await input.setValue('a'.repeat(101))
    await form.trigger('submit')
    expect(wrapper.emitted('updateTitle')).toBeUndefined()
    expect(wrapper.find('[data-test="title-error"]').text()).toContain('Group name must be 100 characters or less.')

    // Escape cancels edit
    await input.trigger('keydown.esc')
    expect(wrapper.find('[data-test="edit-title-input"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="group-title"]').text()).toBe('Secret Agents')
  })

  it('does not emit updateTitle when saved with unchanged title', async () => {
    const wrapper = mount(GroupInfoModal, {
      props: {
        isOpen: true,
        conversation: mockGroupConversation,
        onlineUserIds: [],
      },
    })

    await wrapper.find('[data-test="edit-title-btn"]').trigger('click')
    const form = wrapper.find('[data-test="edit-title-form"]')

    // Submit with existing title ('Secret Agents')
    await form.trigger('submit')
    expect(wrapper.emitted('updateTitle')).toBeUndefined()
    expect(wrapper.find('[data-test="edit-title-input"]').exists()).toBe(false)
  })
})
