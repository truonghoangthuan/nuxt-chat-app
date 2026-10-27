import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ChangelogModal from '~/components/ChangelogModal.vue'
import ChatSidebar from '~/components/ChatSidebar.vue'
import { APP_VERSION, CURRENT_RELEASE } from '~/utils/version'

describe('ChangelogModal Component', () => {
  it('does not render modal when isOpen is false', () => {
    const wrapper = mount(ChangelogModal, {
      props: {
        isOpen: false,
      },
    })
    expect(wrapper.find('[data-test="changelog-modal"]').exists()).toBe(false)
  })

  it('renders dynamic version, release title, and categories when open', () => {
    const wrapper = mount(ChangelogModal, {
      props: {
        isOpen: true,
      },
    })

    expect(wrapper.find('[data-test="changelog-modal"]').exists()).toBe(true)
    const versionTag = wrapper.find('[data-test="changelog-version-tag"]')
    expect(versionTag.exists()).toBe(true)
    expect(versionTag.text()).toBe(`v${APP_VERSION}`)
    expect(wrapper.text()).toContain(CURRENT_RELEASE.title)
    expect(wrapper.text()).toContain(CURRENT_RELEASE.date)
  })

  it('emits close when clicking the header close button', async () => {
    const wrapper = mount(ChangelogModal, {
      props: {
        isOpen: true,
      },
    })

    const closeBtn = wrapper.find('[data-test="close-changelog-btn"]')
    expect(closeBtn.exists()).toBe(true)
    await closeBtn.trigger('click')

    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('emits close when clicking the footer got it button', async () => {
    const wrapper = mount(ChangelogModal, {
      props: {
        isOpen: true,
      },
    })

    const footerCloseBtn = wrapper.find('[data-test="close-changelog-footer-btn"]')
    expect(footerCloseBtn.exists()).toBe(true)
    await footerCloseBtn.trigger('click')

    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('emits close when clicking the modal backdrop', async () => {
    const wrapper = mount(ChangelogModal, {
      props: {
        isOpen: true,
      },
    })

    const backdrop = wrapper.find('[data-test="changelog-modal"]')
    await backdrop.trigger('click')

    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('emits close when Escape key is pressed', async () => {
    const wrapper = mount(ChangelogModal, {
      props: {
        isOpen: true,
      },
    })

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('toggles visibility of older releases list', async () => {
    const wrapper = mount(ChangelogModal, {
      props: {
        isOpen: true,
      },
    })

    expect(wrapper.find('[data-test="older-releases-list"]').exists()).toBe(false)
    const toggleBtn = wrapper.find('[data-test="toggle-older-versions-btn"]')
    expect(toggleBtn.exists()).toBe(true)

    await toggleBtn.trigger('click')
    expect(wrapper.find('[data-test="older-releases-list"]').exists()).toBe(true)

    await toggleBtn.trigger('click')
    expect(wrapper.find('[data-test="older-releases-list"]').exists()).toBe(false)
  })
})

describe('ChatSidebar Version Indicator', () => {
  it('renders open-changelog button with current dynamic version and emits openChangelog on click', async () => {
    const wrapper = mount(ChatSidebar, {
      props: {
        unreadCounts: {},
        onlineFriends: [],
        currentUser: null,
        isDark: false,
        connectionStatus: 'connected',
        isOpenMobile: false,
      },
    })

    const versionBtn = wrapper.find('[data-test="open-changelog"]')
    expect(versionBtn.exists()).toBe(true)
    expect(versionBtn.text()).toContain(`v${APP_VERSION}`)

    await versionBtn.trigger('click')
    expect(wrapper.emitted('openChangelog')).toBeTruthy()
  })
})
