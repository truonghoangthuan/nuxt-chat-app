import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import NotificationPermissionBanner from '~/components/NotificationPermissionBanner.vue'

describe('NotificationPermissionBanner component', () => {
  it('renders when permission is default and not dismissed', () => {
    const wrapper = mount(NotificationPermissionBanner, {
      props: {
        permission: 'default',
      },
    })

    expect(wrapper.find('[data-test="notification-permission-banner"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Enable desktop notifications')
  })

  it('does not render when permission is granted or denied', () => {
    const wrapperGranted = mount(NotificationPermissionBanner, {
      props: {
        permission: 'granted',
      },
    })
    expect(wrapperGranted.find('[data-test="notification-permission-banner"]').exists()).toBe(false)

    const wrapperDenied = mount(NotificationPermissionBanner, {
      props: {
        permission: 'denied',
      },
    })
    expect(wrapperDenied.find('[data-test="notification-permission-banner"]').exists()).toBe(false)
  })

  it('emits requestPermission when clicking Enable button', async () => {
    const wrapper = mount(NotificationPermissionBanner, {
      props: {
        permission: 'default',
      },
    })

    const enableBtn = wrapper.find('[data-test="enable-notifications-banner-btn"]')
    expect(enableBtn.exists()).toBe(true)
    await enableBtn.trigger('click')

    expect(wrapper.emitted('requestPermission')).toHaveLength(1)
  })

  it('hides banner and emits dismiss when clicking Dismiss button', async () => {
    const wrapper = mount(NotificationPermissionBanner, {
      props: {
        permission: 'default',
      },
    })

    const dismissBtn = wrapper.find('[data-test="dismiss-banner-btn"]')
    expect(dismissBtn.exists()).toBe(true)
    await dismissBtn.trigger('click')

    expect(wrapper.emitted('dismiss')).toHaveLength(1)
    expect(wrapper.find('[data-test="notification-permission-banner"]').exists()).toBe(false)
  })
})
