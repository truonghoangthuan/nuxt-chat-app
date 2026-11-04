import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StreetScene from '~/components/StreetScene.vue'

const base = {
  participants: [],
  currentUserId: 'me',
  joined: false,
  status: 'idle' as const,
}

const person = (id: string, seat: number) => ({
  user_id: id,
  display_name: `Người ${id}`,
  avatar_color: '#8093a0',
  session_id: `session-${id}`,
  seat,
})

describe('StreetScene', () => {
  it('isolates SVG definitions between instances so references never cross rooms', () => {
    const wrapper = mount({
      components: { StreetScene },
      template:
        '<div><StreetScene v-bind="base"/><StreetScene v-bind="base"/></div>',
      setup: () => ({ base }),
    })
    const ids = wrapper
      .findAll('svg defs [id]')
      .map((el) => el.attributes('id'))
    expect(new Set(ids).size).toBe(ids.length)
    for (const scene of wrapper.findAllComponents(StreetScene)) {
      const local = new Set(
        scene.findAll('defs [id]').map((el) => '#' + el.attributes('id')),
      )
      for (const use of scene.findAll('use'))
        expect(local.has(use.attributes('href') ?? '')).toBe(true)
    }
  })
  it('keeps accessible controls and compact mobile illustration encapsulated from the app theme', () => {
    const wrapper = mount(StreetScene, {
      props: { ...base, participants: [person('real', 0)] },
    })
    expect(wrapper.find('svg').attributes('role')).toBe('group')
    expect(wrapper.text()).not.toContain('Chưa có ai ở phố')
    const source = readFileSync('app/components/StreetScene.vue', 'utf8')
    expect(source).toMatch(/button\s*\{[^}]*min-height:\s*44px/s)
    expect(source).toContain(':focus-visible')
    expect(source).toContain('@media (max-width: 767px)')
    // The illustration must shrink inside the page's street row, keeping actions visible.
    // A fixed 210px scene clipped the leave button at 390x844 with the roster present.
    expect(source).toMatch(/\.scene\s*\{[^}]*min-height:\s*0/s)
    expect(source).not.toMatch(/\.scene\s*\{[^}]*height:\s*210px/s)
    expect(source).toContain('<style scoped>')
    expect(source).not.toMatch(/:root|localStorage|fetch\(|useSupabase/)
  })
  it('pauses the actual SVG vehicles and honors reduced motion without audio', async () => {
    const wrapper = mount(StreetScene, { props: base })
    const motion = wrapper.find('[data-test="street-motion"]')
    expect(motion.exists()).toBe(true)
    expect(motion.attributes('aria-pressed')).toBe('false')
    expect(wrapper.findAll('.traffic use, .traffic2 use')).toHaveLength(2)
    await motion.trigger('click')
    expect(motion.attributes('aria-pressed')).toBe('true')
    expect(wrapper.classes()).toContain('paused')
    expect(motion.attributes('aria-label')).toBe('Tiếp tục chuyển động')
    await motion.trigger('click')
    expect(wrapper.classes()).not.toContain('paused')
    const source = readFileSync('app/components/StreetScene.vue', 'utf8')
    expect(source).toContain('@media (prefers-reduced-motion: reduce)')
    expect(source).toMatch(/\.paused[\s\S]*animation-play-state:\s*paused/)
    expect(source).toMatch(/@keyframes traffic[\s\S]*translateX/)
    expect(wrapper.find('audio, video').exists()).toBe(false)
  })
  it('shows only supplied roster speech and resolves tea inviter from real presence', async () => {
    const wrapper = mount(StreetScene, {
      props: {
        ...base,
        participants: [person('real', 0)],
        speech: { real: '<b>Chào</b>' + 'x'.repeat(100), ghost: 'FAKE' },
        teaNotice: { user_id: 'real', id: 'tea1', at: 1 },
      },
    })
    expect(wrapper.findAll('[data-test="street-speech"]')).toHaveLength(1)
    expect(
      wrapper.find('[data-test="street-speech"]').text().length,
    ).toBeLessThanOrEqual(40)
    expect(wrapper.find('[data-test="street-speech"] b').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('FAKE')
    expect(wrapper.find('[data-test="street-tea-notice"]').text()).toContain(
      'Người real mời cả bàn một vòng trà',
    )
    await wrapper.setProps({ participants: [], speech: {} })
    expect(wrapper.find('[data-test="street-speech"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="street-tea-notice"]').exists()).toBe(false)
  })
  it('bounds and escapes participant text, sanitizes colors, and makes figures keyboard profile triggers', async () => {
    const malicious = {
      ...person('unsafe', 0),
      display_name: '<img src=x onerror=alert(1)>' + 'x'.repeat(300),
      avatar_color: 'url(https://evil.test/a)',
    }
    const wrapper = mount(StreetScene, {
      props: { ...base, participants: [malicious], roomTitle: 'T'.repeat(500) },
    })
    const figure = wrapper.find('[data-test="street-person"]')
    expect(figure.find('text').text().length).toBeLessThanOrEqual(24)
    expect(figure.find('use').attributes('style')).not.toContain('url(')
    expect(wrapper.find('img').exists()).toBe(false)
    expect(
      wrapper.find('[data-test="street-title"]').text().length,
    ).toBeLessThanOrEqual(60)
    expect(figure.attributes('role')).toBe('button')
    await figure.trigger('keydown', { key: 'Enter' })
    await figure.trigger('keydown', { key: ' ' })
    expect(wrapper.emitted('viewProfile')).toEqual([['unsafe'], ['unsafe']])
  })
  it('places real participants deterministically and keeps every overflow participant accessible', async () => {
    const participants = Array.from({ length: 10 }, (_, index) =>
      person(String(index), index),
    )
    const wrapper = mount(StreetScene, {
      props: { ...base, participants, currentUserId: '0' },
    })
    expect(wrapper.findAll('[data-test="street-person"]')).toHaveLength(6)
    expect(wrapper.findAll('[data-test="street-roster-member"]')).toHaveLength(
      10,
    )
    expect(wrapper.text()).toContain('10 người đang ở phố')
    expect(wrapper.text()).toContain('Bạn')
    const positions = () =>
      Object.fromEntries(
        wrapper
          .findAll('[data-test="street-person"]')
          .map((el) => [
            el.attributes('data-user-id'),
            el.attributes('transform'),
          ]),
      )
    const before = positions()
    expect(new Set(Object.values(before)).size).toBe(6)
    await wrapper.setProps({ participants: [...participants].reverse() })
    expect(positions()).toEqual(before)
    await wrapper
      .findAll('[data-test="street-roster-member"]')[9]
      .trigger('click')
    expect(wrapper.emitted('viewProfile')).toEqual([['9']])
    await wrapper.setProps({ participants: participants.slice(0, 1) })
    expect(wrapper.findAll('[data-test="street-person"]')).toHaveLength(1)
    expect(wrapper.findAll('[data-test="street-roster-member"]')).toHaveLength(
      1,
    )
    expect(wrapper.text()).not.toContain('Người 9')
  })
  it('only allows tea while joined and connected, and leaves without local mutation', async () => {
    const wrapper = mount(StreetScene, { props: base })
    expect(wrapper.find('[data-test="street-tea"]').exists()).toBe(true)
    expect(
      wrapper.find('[data-test="street-tea"]').attributes('disabled'),
    ).toBeDefined()
    await wrapper.setProps({ joined: true, status: 'connected' })
    expect(wrapper.find('[data-test="street-empty-seat"]').exists()).toBe(false)
    await wrapper.find('[data-test="street-tea"]').trigger('click')
    await wrapper.find('[data-test="street-leave"]').trigger('click')
    expect(wrapper.emitted('inviteTea')).toEqual([[]])
    expect(wrapper.emitted('leave')).toEqual([[]])
    expect(wrapper.find('[data-test="street-leave"]').exists()).toBe(true)
    await wrapper.setProps({ status: 'connecting' })
    expect(
      wrapper.find('[data-test="street-tea"]').attributes('disabled'),
    ).toBeDefined()
    expect(
      wrapper.find('[data-test="street-leave"]').attributes('disabled'),
    ).toBeDefined()
    await wrapper.setProps({ status: 'error' })
    expect(
      wrapper.find('[data-test="street-tea"]').attributes('disabled'),
    ).toBeDefined()
  })
  it('guards disabled and pending joins and exposes connection errors', async () => {
    const wrapper = mount(StreetScene, { props: { ...base, enabled: false } })
    expect(
      wrapper.find('[data-test="street-join"]').attributes('disabled'),
    ).toBeDefined()
    expect(wrapper.text()).toContain('Chọn một nhóm')
    await wrapper
      .find('[data-test="street-empty-seat"]')
      .trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('join')).toBeUndefined()
    await wrapper.setProps({ enabled: true, status: 'connecting' })
    expect(
      wrapper.find('[data-test="street-join"]').attributes('disabled'),
    ).toBeDefined()
    expect(
      wrapper.find('[data-test="street-empty-seat"]').attributes('tabindex'),
    ).toBe('-1')
    await wrapper.setProps({ status: 'error', error: 'Mất kết nối. Thử lại.' })
    expect(wrapper.find('[role="alert"]').text()).toBe('Mất kết nối. Thử lại.')
    expect(
      wrapper.find('[data-test="street-join"]').attributes('disabled'),
    ).toBeUndefined()
  })
  it('emits join from the action and keyboard seat without inventing local presence', async () => {
    const wrapper = mount(StreetScene, { props: base })
    await wrapper.get('[data-test="street-join"]').trigger('click')
    await wrapper
      .get('[data-test="street-empty-seat"]')
      .trigger('keydown', { key: 'Enter' })
    await wrapper
      .get('[data-test="street-empty-seat"]')
      .trigger('keydown', { key: ' ' })
    expect(wrapper.emitted('join')).toHaveLength(3)
    expect(wrapper.findAll('[data-test="street-person"]').length).toBe(0)
  })
  it('preserves the illustrated tea stall and invites an empty room without fictional people or chat', () => {
    const wrapper = mount(StreetScene, { props: base })
    expect(wrapper.find('svg').attributes('viewBox')).toBe('0 0 1000 710')
    expect(wrapper.findAll('svg path').length).toBeGreaterThan(35)
    expect(wrapper.text()).toContain('TRÀ ĐÁ · CÔ TƯ')
    expect(wrapper.text()).toContain('Chưa có ai ở phố')
    expect(wrapper.text()).not.toMatch(/Minh|Linh|Huy|DỮ LIỆU MẪU/)
    expect(wrapper.find('textarea, input, form').exists()).toBe(false)
  })
})
