import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import UserProfileModal from '~/components/UserProfileModal.vue'

describe('UserProfileModal', () => {
  const mockProfile = {
    id: 'u-bob-123',
    email: 'bob@example.com',
    display_name: 'Bob Ross',
    avatar_color: '#7c3aed',
    avatar_url: 'https://example.com/bob.jpg',
  }

  it('renders nothing when isOpen is false', () => {
    const wrapper = mount(UserProfileModal, {
      props: {
        isOpen: false,
        profile: mockProfile,
      },
    })
    expect(wrapper.find('[data-test="user-profile-modal"]').exists()).toBe(false)
  })

  it('renders bank QR code section when profile has bank_qr_url', () => {
    const wrapper = mount(UserProfileModal, {
      props: {
        isOpen: true,
        profile: {
          id: 'u-1',
          display_name: 'Tam',
          email: 'tam@example.com',
          avatar_color: 'bg-emerald-500',
          bank_qr_url: 'https://example.com/qr.png',
        },
      },
    })
    expect(wrapper.find('[data-test="user-bank-qr"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="user-bank-qr"] img').attributes('src')).toBe('https://example.com/qr.png')
  })

  it('renders profile information with display name, email, avatar, and online status', () => {
    const wrapper = mount(UserProfileModal, {
      props: {
        isOpen: true,
        profile: mockProfile,
        isOnline: true,
        isCurrentUser: false,
      },
    })

    expect(wrapper.find('[data-test="user-profile-modal"]').exists()).toBe(true)
    const avatar = wrapper.findComponent({ name: 'UserAvatar' })
    expect(avatar.exists()).toBe(true)
    expect(avatar.props('size')).toBe('2xl')
    expect(wrapper.text()).toContain('Bob Ross')
    expect(wrapper.text()).toContain('bob@example.com')
    expect(wrapper.text()).toContain('u-bob-123')
    expect(wrapper.text()).toContain('Active now')
    expect(wrapper.find('[data-test="start-dm-btn"]').exists()).toBe(true)
  })

  it('emits startDm when Send Direct Message is clicked', async () => {
    const wrapper = mount(UserProfileModal, {
      props: {
        isOpen: true,
        profile: mockProfile,
        isCurrentUser: false,
      },
    })

    await wrapper.find('[data-test="start-dm-btn"]').trigger('click')
    expect(wrapper.emitted('startDm')?.[0]).toEqual(['u-bob-123'])
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('hides startDm button when isCurrentUser is true', () => {
    const wrapper = mount(UserProfileModal, {
      props: {
        isOpen: true,
        profile: mockProfile,
        isCurrentUser: true,
      },
    })

    expect(wrapper.find('[data-test="start-dm-btn"]').exists()).toBe(false)
  })

  it('emits close when close button or backdrop is clicked', async () => {
    const wrapper = mount(UserProfileModal, {
      props: {
        isOpen: true,
        profile: mockProfile,
      },
    })

    await wrapper.find('[data-test="close-profile-modal"]').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()

    await wrapper.find('[data-test="profile-modal-backdrop"]').trigger('click')
    expect(wrapper.emitted('close')?.length).toBe(2)
  })

  it('copies email and user ID to clipboard when respective copy buttons clicked', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })

    const wrapper = mount(UserProfileModal, {
      props: {
        isOpen: true,
        profile: mockProfile,
      },
    })

    await wrapper.find('[data-test="copy-profile-email"]').trigger('click')
    expect(writeText).toHaveBeenCalledWith('bob@example.com')

    await wrapper.find('[data-test="copy-profile-id"]').trigger('click')
    expect(writeText).toHaveBeenCalledWith('u-bob-123')
  })

  it('emits close when Escape key is pressed', async () => {
    const wrapper = mount(UserProfileModal, {
      props: {
        isOpen: true,
        profile: mockProfile,
      },
    })

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('close')).toBeTruthy()
  })
})
