import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import MessageSearchBar from '~/components/MessageSearchBar.vue'
import type { ChatMessage } from '~/types/chat'

const pinned_at = '2026-11-01T01:00:00Z'
const row = (id: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id, client_id: id, conversation_id: 'room', user_id: 'alice',
  content: 'Important plan', created_at: new Date(2026, 10, 1, 12).toISOString(), status: 'sent', ...extra,
})
const image = JSON.stringify({ type: 'images', images: [{ path: 'private/photo', mimeType: 'image/png', width: 10, height: 10, size: 100 }], caption: 'PLAN https://example.com' })
const pin = '[data-test="search-pinned-only"]'
const count = '[data-test="search-count"]'

describe('pinned search control', () => {
  it('preserves selected pin on arrival, handles unpin/removal, and resets on explicit toggles', async () => {
    const messages = [row('a', { pinned_at }), row('b', { pinned_at })]
    const wrapper = mount(MessageSearchBar, { props: { messages, modelValue: 'plan' } })
    await wrapper.get(pin).setValue(true)
    await wrapper.get('[data-test="search-input"]').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['b'])
    await wrapper.setProps({ messages: [row('older', { pinned_at }), ...messages] })
    expect(wrapper.get(count).text()).toBe('3 of 3')
    expect(wrapper.emitted('jump')).toHaveLength(2)
    await wrapper.setProps({ messages: [messages[0], { ...messages[1], pinned_at: null }] })
    expect(wrapper.get(count).text()).toBe('1 of 1')
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['a'])
    await wrapper.setProps({ messages: messages.map(m => ({ ...m, pinned_at: null })) })
    expect(wrapper.get(count).text()).toBe('No results')
    const jumps = wrapper.emitted('jump')?.length
    await wrapper.get('[data-test="search-input"]').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('jump')).toHaveLength(jumps!)
    await wrapper.setProps({ messages })
    expect(wrapper.get(count).text()).toBe('1 of 2')
    await wrapper.get('[data-test="search-next-btn"]').trigger('click')
    await wrapper.get(pin).setValue(false)
    expect(wrapper.get(count).text()).toBe('1 of 2')
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['a'])
    await wrapper.setProps({ modelValue: '' })
    expect(wrapper.find(count).exists()).toBe(false)
    wrapper.unmount()
  })

  it('browses pins without keywords, combines content/sender/date filters and resets on reopen', async () => {
    const messages = [row('normal'), row('text', { pinned_at }),
      row('photo', { pinned_at, user_id: 'bob', content: image }),
      row('deleted', { pinned_at, deleted_at: 'now' }), row('locked', { pinned_at, encryption: 'undecryptable' })]
    const wrapper = mount(MessageSearchBar, { props: { messages, modelValue: '' } })
    expect((wrapper.get(pin).element as HTMLInputElement).checked).toBe(false)
    expect(wrapper.get(pin).attributes('type')).toBe('checkbox')
    expect(wrapper.get(pin).element.closest('label')?.textContent).toContain('Pinned only')
    await wrapper.get(pin).setValue(true)
    expect(wrapper.get(count).text()).toBe('1 of 2')
    expect(wrapper.text()).toContain('Keyword optional')
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['text'])
    await wrapper.get('[data-test="search-input"]').trigger('keydown', { key: 'Enter', shiftKey: true })
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['photo'])
    await wrapper.get('[data-test="search-type"]').setValue('images')
    await wrapper.setProps({ modelValue: 'plan' })
    await wrapper.get('[data-test="search-sender"]').setValue('bob')
    await wrapper.get('[data-test="search-from-date"]').setValue('2026-11-01')
    await wrapper.get('[data-test="search-through-date"]').setValue('2026-11-01')
    expect(wrapper.get(count).text()).toBe('1 of 1')
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['photo'])
    await wrapper.get('[data-test="search-type"]').setValue('links')
    expect(wrapper.get(count).text()).toBe('1 of 1')
    await wrapper.get('[data-test="search-through-date"]').setValue('2026-10-31')
    expect(wrapper.get(count).text()).toBe('No results')
    await wrapper.get(pin).trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
    const reopened = mount(MessageSearchBar, { props: { messages, modelValue: '' } })
    expect((reopened.get(pin).element as HTMLInputElement).checked).toBe(false)
    expect(reopened.find(count).exists()).toBe(false)
    reopened.unmount()
  })
})
