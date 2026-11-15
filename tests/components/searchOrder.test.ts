import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import MessageSearchBar from '~/components/MessageSearchBar.vue'
import type { ChatMessage } from '~/types/chat'

const row = (id: string, minute: number): ChatMessage => ({
  id, client_id: id, conversation_id: 'room', user_id: 'user', content: 'Plan release',
  created_at: new Date(2026, 10, 16, 10, minute).toISOString(), status: 'sent',
})
const messages = [row('one', 1), row('two', 2), row('three', 3)]

describe('loaded search result order', () => {
  it.each(['oldest', 'newest'])('preserves selected IDs through arrivals and pagination in %s order', async (order) => {
    const wrapper = mount(MessageSearchBar, { props: { messages, modelValue: 'plan' } })
    await wrapper.get('[data-test="search-order"]').setValue(order)
    await wrapper.get('[data-test="search-next-btn"]').trigger('click')
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['two'])
    const jumps = wrapper.emitted('jump')!.length
    const expanded = [row('older', 0), ...messages, row('newer', 4)]
    await wrapper.setProps({ messages: expanded })
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('3 of 5')
    expect(wrapper.emitted('jump')).toHaveLength(jumps)
    await wrapper.setProps({ messages: expanded.map(message => message.id === 'two'
      ? { ...message, deleted_at: '2026-11-16T12:00:00Z' } : message) })
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('3 of 4')
    expect(wrapper.emitted('jump')?.at(-1)).toEqual([order === 'oldest' ? 'three' : 'one'])
    wrapper.unmount()
  })

  it('combines newest-first with all existing filters and handles empty/single matches', async () => {
    const photo = (caption: string) => JSON.stringify({ type: 'images',
      images: [{ path: 'private/image.enc', mimeType: 'image/png', width: 10, height: 10, size: 100 }], caption })
    const pinned_at = '2026-11-16T01:00:00Z'
    const rows = [
      { ...row('old', 0), content: photo('Plan approved'), pinned_at, created_at: '2026-01-01T00:00:00Z' },
      { ...row('one', 1), content: photo('Plan approved'), pinned_at },
      { ...row('two', 2), content: photo('Plan approved'), pinned_at },
      { ...row('draft', 3), content: photo('Plan draft'), pinned_at },
      { ...row('peer', 4), content: photo('Plan approved'), pinned_at, user_id: 'peer' },
      { ...row('unpin', 5), content: photo('Plan approved') },
      { ...row('text', 6), pinned_at },
      { ...row('locked', 7), content: photo('Plan approved'), pinned_at, encryption: 'undecryptable' as const },
      { ...row('deleted', 8), content: photo('Plan approved'), pinned_at, deleted_at: pinned_at },
    ]
    const wrapper = mount(MessageSearchBar, { props: { messages: rows, modelValue: 'plan' } })
    await wrapper.get('[data-test="search-order"]').setValue('newest')
    await wrapper.get('[data-test="search-exclude"]').setValue('draft')
    await wrapper.get('[data-test="search-type"]').setValue('images')
    await wrapper.get('[data-test="search-pinned-only"]').setValue(true)
    await wrapper.get('[data-test="search-sender"]').setValue('user')
    await wrapper.get('[data-test="search-from-date"]').setValue('2026-11-16')
    await wrapper.get('[data-test="search-through-date"]').setValue('2026-11-16')
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('1 of 2')
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['two'])
    await wrapper.get('[data-test="search-next-btn"]').trigger('click')
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['one'])
    await wrapper.setProps({ modelValue: '' })
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['two'])
    await wrapper.setProps({ messages: rows.slice(1, 2) })
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('1 of 1')
    expect(wrapper.get('[data-test="search-next-btn"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[data-test="search-order"]').setValue('oldest')
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['one'])
    await wrapper.setProps({ messages: [] })
    const jumps = wrapper.emitted('jump')!.length
    await wrapper.get('[data-test="search-order"]').setValue('newest')
    await wrapper.get('[data-test="search-input"]').trigger('keydown', { key: 'Enter' })
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('No results')
    expect(wrapper.get('[data-test="search-prev-btn"]').attributes('disabled')).toBeDefined()
    expect(wrapper.emitted('jump')).toHaveLength(jumps)
    wrapper.unmount()
    const reopened = mount(MessageSearchBar, { props: { messages, modelValue: '' } })
    expect((reopened.get('[data-test="search-order"]').element as HTMLSelectElement).value).toBe('oldest')
    expect(reopened.find('[data-test="search-count"]').exists()).toBe(false)
    reopened.unmount()
  })

  it('defaults to oldest and changes navigation order without changing the timeline', async () => {
    const wrapper = mount(MessageSearchBar, { props: { messages, modelValue: 'plan' } })
    const order = wrapper.get('[data-test="search-order"]')
    expect(order.attributes('aria-label')).toBe('Search result order')
    expect((order.element as HTMLSelectElement).value).toBe('oldest')
    expect(order.findAll('option').map(option => option.text())).toEqual(['Oldest first', 'Newest first'])
    await wrapper.get('[data-test="search-next-btn"]').trigger('click')
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['two'])
    await order.setValue('newest')
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('1 of 3')
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['three'])
    await wrapper.get('[data-test="search-input"]').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['two'])
    await wrapper.get('[data-test="search-next-btn"]').trigger('click')
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['one'])
    await wrapper.get('[data-test="search-input"]').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['three'])
    await wrapper.get('[data-test="search-input"]').trigger('keydown', { key: 'Enter', shiftKey: true })
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['one'])
    await wrapper.get('[data-test="search-prev-btn"]').trigger('click')
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['two'])
    await order.setValue('oldest')
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('1 of 3')
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['one'])
    expect(messages.map(message => message.id)).toEqual(['one', 'two', 'three'])
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    await order.trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })
})
