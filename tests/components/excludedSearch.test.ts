import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import MessageSearchBar from '~/components/MessageSearchBar.vue'
import type { ChatMessage } from '~/types/chat'

const row = (id: string, content: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id, client_id: id, conversation_id: 'room', user_id: 'user',
  content, created_at: '2026-11-15T00:00:00Z', status: 'sent', ...extra,
})
const messages = [row('one', 'Plan release'), row('two', 'Plan draft'), row('three', 'Plan approved')]

describe('search exclusion controls', () => {
  it('works without keywords, preserves live selection and clears on reopening', async () => {
    const wrapper = mount(MessageSearchBar, { props: { messages, modelValue: '' } })
    expect(wrapper.find('[data-test="search-count"]').exists()).toBe(false)
    await wrapper.get('[data-test="search-exclude"]').setValue('draft')
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('1 of 2')
    await wrapper.get('[data-test="search-exclude"]').trigger('keydown', { key: 'Enter' })
    const jumps = wrapper.emitted('jump')!.length
    await wrapper.setProps({ messages: [row('older', 'Plan earlier'), ...messages] })
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('3 of 3')
    expect(wrapper.emitted('jump')).toHaveLength(jumps)
    await wrapper.setProps({ messages: [row('older', 'Plan earlier'), ...messages.slice(0, 2)] })
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('2 of 2')
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['one'])
    await wrapper.get('[data-test="search-exclude"]').setValue('plan')
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('No results')
    expect(wrapper.get('[data-test="search-next-btn"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[data-test="search-exclude"]').setValue(' ')
    expect(wrapper.find('[data-test="search-count"]').exists()).toBe(false)
    wrapper.unmount()
    const reopened = mount(MessageSearchBar, { props: { messages, modelValue: '' } })
    expect((reopened.get('[data-test="search-exclude"]').element as HTMLInputElement).value).toBe('')
    expect(reopened.find('[data-test="search-count"]').exists()).toBe(false)
    reopened.unmount()
  })

  it('combines excluded captions with sender, dates, pins, type and keyword filters', async () => {
    const photo = (caption: string) => JSON.stringify({
      type: 'images', images: [{ path: 'secret', mimeType: 'image/png', width: 10, height: 10, size: 100 }], caption,
    })
    const pinned_at = '2026-11-15T01:00:00Z'
    const rows = [row('keep', photo('Plan approved'), { pinned_at }),
      row('omit', photo('Plan DRAFT'), { pinned_at }),
      row('unpin', photo('Plan approved')),
      row('peer', photo('Plan approved'), { pinned_at, user_id: 'peer' }),
      row('old', photo('Plan approved'), { pinned_at, created_at: '2026-01-01T00:00:00Z' })]
    const wrapper = mount(MessageSearchBar, { props: { messages: rows, modelValue: 'plan' } })
    await wrapper.get('[data-test="search-exclude"]').setValue('draft')
    await wrapper.get('[data-test="search-type"]').setValue('images')
    await wrapper.get('[data-test="search-pinned-only"]').setValue(true)
    await wrapper.get('[data-test="search-sender"]').setValue('user')
    await wrapper.get('[data-test="search-from-date"]').setValue('2026-11-14')
    await wrapper.get('[data-test="search-through-date"]').setValue('2026-11-16')
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('1 of 1')
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['keep'])
    await wrapper.get('[data-test="search-exclude"]').setValue('')
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('1 of 2')
    wrapper.unmount()
  })

  it('filters matches and resets navigation, including when the resulting IDs are unchanged', async () => {
    const wrapper = mount(MessageSearchBar, { props: { messages, modelValue: 'plan' } })
    await wrapper.get('[data-test="search-next-btn"]').trigger('click')
    const excluded = wrapper.get('[data-test="search-exclude"]')
    expect(excluded.attributes('aria-label')).toBe('Exclude phrase from loaded messages')
    expect(excluded.attributes('autocomplete')).toBe('off')
    await excluded.setValue(' DRAFT ')
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('1 of 2')
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['one'])
    await excluded.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['three'])
    await excluded.setValue('absent')
    await excluded.trigger('keydown', { key: 'Enter' })
    await excluded.setValue('also absent')
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('1 of 3')
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['one'])
    await excluded.trigger('keydown', { key: 'Enter', shiftKey: true })
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['three'])
    await excluded.trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })
})
