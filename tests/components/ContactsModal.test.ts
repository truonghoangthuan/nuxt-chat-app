import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ContactsModal from '~/components/ContactsModal.vue'
import type { Contact, Profile } from '~/types/chat'

describe('ContactsModal.vue', () => {
  const mockContacts: Contact[] = [
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
  ]

  it('does not render modal content when isOpen is false', () => {
    const wrapper = mount(ContactsModal, {
      props: {
        isOpen: false,
        contacts: mockContacts,
        onlineUserIds: [],
      },
    })

    expect(wrapper.find('[data-test="contacts-modal"]').exists()).toBe(false)
  })

  it('renders modal dialog when isOpen is true', () => {
    const wrapper = mount(ContactsModal, {
      props: {
        isOpen: true,
        contacts: mockContacts,
        onlineUserIds: [],
      },
    })

    expect(wrapper.find('[data-test="contacts-modal"]').exists()).toBe(true)
    expect(wrapper.find('input[placeholder*="Find user by email"]').exists()).toBe(true)
  })

  it('emits close when clicking close button, clicking overlay backdrop, or pressing Escape', async () => {
    const wrapper = mount(ContactsModal, {
      props: {
        isOpen: true,
        contacts: mockContacts,
        onlineUserIds: [],
      },
      attachTo: document.body,
    })

    // 1. Close button
    const closeBtn = wrapper.find('[aria-label="Close"]')
    expect(closeBtn.exists()).toBe(true)
    await closeBtn.trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)

    // 2. Backdrop overlay click
    const backdrop = wrapper.find('[data-test="contacts-modal-backdrop"]')
    await backdrop.trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(2)

    // 3. Escape keydown
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('close')).toHaveLength(3)

    wrapper.unmount()
  })

  it('renders empty state when contacts list is empty', () => {
    const wrapper = mount(ContactsModal, {
      props: {
        isOpen: true,
        contacts: [],
        onlineUserIds: [],
      },
    })

    expect(wrapper.text()).toContain('No contacts yet. Search an email above to add friends.')
  })

  it('renders contacts sorted alphabetically by display name with presence indicator', () => {
    const wrapper = mount(ContactsModal, {
      props: {
        isOpen: true,
        contacts: mockContacts,
        onlineUserIds: ['u-1', 'u-3'], // Alice & Charlie online; Bob offline
      },
    })

    const contactItems = wrapper.findAll('[data-test="contact-item"]')
    expect(contactItems).toHaveLength(3)

    // Alphabetical order: Alice, Bob, Charlie
    expect(contactItems[0].text()).toContain('Alice')
    expect(contactItems[0].text()).toContain('alice@example.com')
    expect(contactItems[1].text()).toContain('Bob')
    expect(contactItems[1].text()).toContain('bob@example.com')
    expect(contactItems[2].text()).toContain('Charlie')
    expect(contactItems[2].text()).toContain('charlie@example.com')

    // Online status checks
    expect(contactItems[0].text()).toContain('Online')
    expect(contactItems[1].text()).toContain('Offline')
    expect(contactItems[2].text()).toContain('Online')
  })

  it('emits selectContact when clicking the Message button or contact row', async () => {
    const wrapper = mount(ContactsModal, {
      props: {
        isOpen: true,
        contacts: mockContacts,
        onlineUserIds: [],
      },
    })

    // Click Message button on Alice (u-1)
    const aliceMsgBtn = wrapper.find('[data-test="message-contact-u-1"]')
    expect(aliceMsgBtn.exists()).toBe(true)
    await aliceMsgBtn.trigger('click')

    expect(wrapper.emitted('selectContact')?.[0]).toEqual(['u-1'])
  })

  it('emits removeContact when clicking Remove button without triggering selectContact', async () => {
    const wrapper = mount(ContactsModal, {
      props: {
        isOpen: true,
        contacts: mockContacts,
        onlineUserIds: [],
      },
    })

    const removeBobBtn = wrapper.find('[data-test="remove-contact-u-2"]')
    expect(removeBobBtn.exists()).toBe(true)
    await removeBobBtn.trigger('click')

    expect(wrapper.emitted('removeContact')?.[0]).toEqual(['u-2'])
    expect(wrapper.emitted('selectContact')).toBeUndefined()
  })

  it('searches user by email when findUserByEmail is provided and shows preview with Add to Contacts button', async () => {
    const foundProfile: Profile = {
      id: 'u-dave',
      email: 'dave@example.com',
      display_name: 'Dave',
      avatar_color: '#ec4899',
    }

    const findUserByEmail = vi.fn().mockResolvedValue(foundProfile)

    const wrapper = mount(ContactsModal, {
      props: {
        isOpen: true,
        contacts: mockContacts,
        onlineUserIds: ['u-dave'],
        findUserByEmail,
      },
    })

    const input = wrapper.find('input[placeholder*="Find user by email"]')
    await input.setValue('dave@example.com')
    await wrapper.find('form').trigger('submit')

    expect(findUserByEmail).toHaveBeenCalledWith('dave@example.com')

    // Allow async resolution
    await vi.waitFor(() => {
      expect(wrapper.find('[data-test="search-result-preview"]').exists()).toBe(true)
    })

    const preview = wrapper.find('[data-test="search-result-preview"]')
    expect(preview.text()).toContain('Dave')
    expect(preview.text()).toContain('dave@example.com')

    // "Add to Contacts" button appears
    const addBtn = wrapper.find('[data-test="add-contact-btn"]')
    expect(addBtn.exists()).toBe(true)
    await addBtn.trigger('click')

    expect(wrapper.emitted('addContactByEmail')?.[0]).toEqual(['dave@example.com'])
  })

  it('shows In Contacts indicator and Message button if searched user is already in contacts', async () => {
    const foundProfile: Profile = {
      id: 'u-1',
      email: 'alice@example.com',
      display_name: 'Alice',
      avatar_color: '#6366f1',
    }

    const findUserByEmail = vi.fn().mockResolvedValue(foundProfile)

    const wrapper = mount(ContactsModal, {
      props: {
        isOpen: true,
        contacts: mockContacts, // u-1 is already in contacts
        onlineUserIds: [],
        findUserByEmail,
      },
    })

    const input = wrapper.find('input[placeholder*="Find user by email"]')
    await input.setValue('alice@example.com')
    await wrapper.find('form').trigger('submit')

    await vi.waitFor(() => {
      expect(wrapper.find('[data-test="search-result-preview"]').exists()).toBe(true)
    })

    const preview = wrapper.find('[data-test="search-result-preview"]')
    expect(preview.text()).toContain('In Contacts')

    const messageBtn = wrapper.find('[data-test="search-result-message-btn"]')
    expect(messageBtn.exists()).toBe(true)
    await messageBtn.trigger('click')

    expect(wrapper.emitted('selectContact')?.[0]).toEqual(['u-1'])
  })

  it('shows error message when findUserByEmail returns null', async () => {
    const findUserByEmail = vi.fn().mockResolvedValue(null)

    const wrapper = mount(ContactsModal, {
      props: {
        isOpen: true,
        contacts: mockContacts,
        onlineUserIds: [],
        findUserByEmail,
      },
    })

    const input = wrapper.find('input[placeholder*="Find user by email"]')
    await input.setValue('unknown@example.com')
    await wrapper.find('form').trigger('submit')

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('No user found with this email')
    })

    expect(wrapper.find('[data-test="search-result-preview"]').exists()).toBe(false)
  })

  it('emits addContactByEmail directly when findUserByEmail is not provided', async () => {
    const wrapper = mount(ContactsModal, {
      props: {
        isOpen: true,
        contacts: mockContacts,
        onlineUserIds: [],
      },
    })

    const input = wrapper.find('input[placeholder*="Find user by email"]')
    await input.setValue('newperson@example.com')
    await wrapper.find('form').trigger('submit')

    expect(wrapper.emitted('addContactByEmail')?.[0]).toEqual(['newperson@example.com'])
  })
})
