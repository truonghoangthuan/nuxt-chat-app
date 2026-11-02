import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MessageSearchBar from '~/components/MessageSearchBar.vue'
import type { ChatMessage } from '~/types/chat'

describe('MessageSearchBar', () => {
  const sampleMessages: ChatMessage[] = [
    {
      id: 'msg-1',
      client_id: 'c-1',
      conversation_id: 'conv-1',
      user_id: 'u-1',
      content: 'Apples are delicious fruits',
      created_at: '2026-10-22T10:00:00Z',
      status: 'sent',
    },
    {
      id: 'msg-2',
      client_id: 'c-2',
      conversation_id: 'conv-1',
      user_id: 'u-2',
      content: 'Oranges and apples in a basket',
      created_at: '2026-10-22T10:01:00Z',
      status: 'sent',
    },
  ]

  it('finds uncaptioned images and caption links without a keyword, then combines filters', async () => {
    const image = (caption?: string) => JSON.stringify({
      type: 'images', images: [{ path: 'private/metadata-only.example', mimeType: 'image/png', width: 10, height: 10, size: 100 }], caption,
    })
    const messages: ChatMessage[] = [
      ...sampleMessages,
      { ...sampleMessages[0], id: 'photo', content: image() },
      { ...sampleMessages[1], id: 'caption', content: image('Apples https://example.com') },
      { ...sampleMessages[0], id: 'link', content: 'https://example.org apples' },
      { ...sampleMessages[0], id: 'deleted', content: image(), deleted_at: '2026-11-01T00:00:00Z' },
      { ...sampleMessages[0], id: 'locked', content: image(), encryption: 'undecryptable' },
    ]
    const wrapper = mount(MessageSearchBar, { props: { messages, modelValue: '' } })
    const type = wrapper.get('[data-test="search-type"]')
    expect(type.attributes('aria-label')).toBe('Filter by message type')
    expect(wrapper.find('[data-test="search-count"]').exists()).toBe(false)
    await type.setValue('images')
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('1 of 2')
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['photo'])
    await wrapper.get('[data-test="search-input"]').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['caption'])
    await type.setValue('links')
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('1 of 2')
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['caption'])
    await wrapper.setProps({ modelValue: 'APPLES' })
    await wrapper.get('[data-test="search-sender"]').setValue('u-2')
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('1 of 1')
    await wrapper.get('[data-test="search-from-date"]').setValue('2026-10-23')
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('No results')
    await wrapper.get('[data-test="search-from-date"]').setValue('')
    await wrapper.setProps({ modelValue: 'metadata-only' })
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('No results')
    await wrapper.setProps({ modelValue: '' })
    await type.setValue('all')
    expect(wrapper.find('[data-test="search-count"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('resets type navigation even for identical matches and preserves selected IDs on arrival', async () => {
    const content = JSON.stringify({ type: 'images', images: [{ path: 'photo', mimeType: 'image/png', width: 10, height: 10, size: 100 }], caption: 'https://example.com apples' })
    const messages = sampleMessages.map(message => ({ ...message, content }))
    const wrapper = mount(MessageSearchBar, { props: { messages, modelValue: '' } })
    await wrapper.get('[data-test="search-type"]').setValue('images')
    await wrapper.get('[data-test="search-input"]').trigger('keydown', { key: 'Enter' })
    const older = { ...messages[0], id: 'older' }
    await wrapper.setProps({ messages: [older, ...messages] })
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('3 of 3')
    expect(wrapper.emitted('jump')).toHaveLength(2)
    await wrapper.get('[data-test="search-type"]').setValue('links')
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('1 of 3')
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['older'])
    await wrapper.get('[data-test="search-input"]').trigger('keydown', { key: 'Enter', shiftKey: true })
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['msg-2'])
    await wrapper.setProps({ messages: [older, messages[0]] })
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('2 of 2')
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['msg-1'])
    await wrapper.get('[data-test="search-type"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
    const reopened = mount(MessageSearchBar, { props: { messages, modelValue: '' } })
    expect((reopened.get('[data-test="search-type"]').element as HTMLSelectElement).value).toBe('all')
    expect(reopened.find('[data-test="search-count"]').exists()).toBe(false)
    reopened.unmount()
  })

  it('narrows keyword matches to inclusive local days and combines with sender', async () => {
    const localTime = (day: number, hour: number, minute = 0) =>
      new Date(2026, 9, day, hour, minute).toISOString()
    const wrapper = mount(MessageSearchBar, {
      props: {
        messages: [
          { ...sampleMessages[0], id: 'before', created_at: localTime(21, 23, 59) },
          { ...sampleMessages[0], id: 'start', created_at: localTime(22, 0) },
          { ...sampleMessages[1], id: 'end', created_at: localTime(22, 23, 59) },
          { ...sampleMessages[1], id: 'after', created_at: localTime(23, 0) },
        ],
        modelValue: 'apples',
      },
    })
    const from = wrapper.get('[data-test="search-from-date"]')
    const through = wrapper.get('[data-test="search-through-date"]')
    expect(from.attributes('type')).toBe('date')
    expect(from.attributes('aria-label')).toBe('From date (local time)')
    expect(through.attributes('aria-label')).toBe('Through date (local time)')
    await from.setValue('2026-10-22')
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('1 of 3')
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['start'])
    await through.setValue('2026-10-22')
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('1 of 2')
    await wrapper.get('[data-test="search-next-btn"]').trigger('click')
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['end'])
    await wrapper.get('[data-test="search-sender"]').setValue('u-2')
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('1 of 1')
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['end'])
    await from.setValue('')
    await wrapper.get('[data-test="search-sender"]').setValue('')
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('1 of 3')
    await through.setValue('')
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('1 of 4')
    expect(wrapper.text()).toContain('Local time')
    wrapper.unmount()
  })

  it('resets on changed bounds even with identical matches and preserves live selection', async () => {
    const wrapper = mount(MessageSearchBar, {
      props: { messages: sampleMessages, modelValue: 'apples' },
    })
    await wrapper.get('[data-test="search-next-btn"]').trigger('click')
    await wrapper.get('[data-test="search-from-date"]').setValue('2026-01-01')
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('1 of 2')
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['msg-1'])
    await wrapper.get('[data-test="search-input"]').trigger('keydown', { key: 'Enter' })
    const older = { ...sampleMessages[0], id: 'older' }
    await wrapper.setProps({ messages: [older, ...sampleMessages] })
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('3 of 3')
    await wrapper.get('[data-test="search-through-date"]').setValue('2026-12-31')
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('1 of 3')
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['older'])
    wrapper.unmount()
  })

  it('explains reversed ranges accessibly and restores matches when corrected', async () => {
    const wrapper = mount(MessageSearchBar, {
      props: { messages: sampleMessages, modelValue: 'apples' },
    })
    const from = wrapper.get('[data-test="search-from-date"]')
    const through = wrapper.get('[data-test="search-through-date"]')
    await from.setValue('2026-10-23')
    await through.setValue('2026-10-22')
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('No results')
    const error = wrapper.get('[role="alert"]')
    expect(error.text()).toBe('From date must be on or before through date.')
    expect(from.attributes('aria-invalid')).toBe('true')
    expect(through.attributes('aria-invalid')).toBe('true')
    expect(from.attributes('aria-describedby')).toBe(error.attributes('id'))
    expect(through.attributes('aria-describedby')).toBe(error.attributes('id'))
    await through.trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')).toHaveLength(1)
    await from.setValue('2026-10-21')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(from.attributes('aria-invalid')).toBeUndefined()
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('1 of 2')
    wrapper.unmount()
  })

  it('keeps caption privacy exclusions and rejects invalid timestamps only when bounded', async () => {
    const wrapper = mount(MessageSearchBar, {
      props: {
        messages: [
          { ...sampleMessages[0], id: 'invalid', created_at: 'invalid' },
          { ...sampleMessages[1], id: 'caption', content: JSON.stringify({ type: 'images', images: [], caption: 'Apples photo' }) },
          { ...sampleMessages[1], id: 'deleted', deleted_at: '2026-11-01T00:00:00Z' },
          { ...sampleMessages[1], id: 'locked', encryption: 'undecryptable' },
        ],
        modelValue: 'apples',
      },
    })
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('1 of 2')
    await wrapper.get('[data-test="search-from-date"]').setValue('2026-01-01')
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('1 of 1')
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['caption'])
    await wrapper.get('[data-test="search-from-date"]').setValue('')
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('1 of 2')
    wrapper.unmount()
  })

  it('renders input and updates counter as user types', async () => {
    const wrapper = mount(MessageSearchBar, {
      props: {
        messages: sampleMessages,
        modelValue: '',
      },
    })

    const input = wrapper.find('[data-test="search-input"]')
    expect(input.exists()).toBe(true)

    await input.setValue('apples')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['apples'])

    await wrapper.setProps({ modelValue: 'apples' })
    const counter = wrapper.find('[data-test="search-count"]')
    expect(counter.text()).toContain('1 of 2')
  })

  it('narrows keyword matches by sender and restores all senders', async () => {
    const wrapper = mount(MessageSearchBar, {
      props: { messages: sampleMessages, modelValue: 'apples' },
    })
    const sender = wrapper.get('[data-test="search-sender"]')
    expect(sender.attributes('aria-label')).toBe('Filter by sender')
    await sender.setValue('u-2')
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('1 of 1')
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['msg-2'])
    expect(wrapper.get('[data-test="search-next-btn"]').attributes('disabled')).toBeDefined()
    await sender.setValue('')
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('1 of 2')
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['msg-1'])
    expect(wrapper.text()).toContain('Loaded messages only')
    wrapper.unmount()
  })

  it('keeps selection stable across history arrivals and clamps after deletion', async () => {
    const wrapper = mount(MessageSearchBar, {
      props: { messages: sampleMessages, modelValue: 'apples' },
    })
    await wrapper.get('[data-test="search-next-btn"]').trigger('click')
    const older = { ...sampleMessages[0], id: 'older', client_id: 'older' }
    await wrapper.setProps({ messages: [older, ...sampleMessages] })
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('3 of 3')
    expect(wrapper.emitted('jump')).toHaveLength(1)
    await wrapper.setProps({ messages: [older, sampleMessages[0]] })
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('2 of 2')
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['msg-1'])
    await wrapper.setProps({ messages: [] })
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('No results')
    await wrapper.get('[data-test="search-input"]').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('jump')).toHaveLength(2)
    wrapper.unmount()
  })

  it('retains a selected sender when their last loaded message disappears', async () => {
    const wrapper = mount(MessageSearchBar, {
      props: { messages: sampleMessages, modelValue: 'apples' },
    })
    await wrapper.get('[data-test="search-sender"]').setValue('u-2')
    await wrapper.setProps({ messages: [sampleMessages[0]] })
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('No results')
    expect(wrapper.find('option[value="u-2"]').exists()).toBe(true)
    expect((wrapper.get('select').element as HTMLSelectElement).value).toBe('u-2')
    wrapper.unmount()
  })

  it('keeps equal display names as distinct sender IDs and labels unknown senders', async () => {
    const author = { id: 'u-1', email: '', display_name: 'Sam', avatar_color: '#000' }
    const wrapper = mount(MessageSearchBar, {
      props: {
        messages: [
          { ...sampleMessages[0], author },
          { ...sampleMessages[1], author: { ...author, id: 'u-2' } },
          { ...sampleMessages[0], id: 'unknown', user_id: 'u-3' },
        ],
        modelValue: 'apples',
      },
    })
    const options = wrapper.findAll('option')
    expect(options.filter(option => option.text() === 'Sam')).toHaveLength(2)
    expect(wrapper.get('option[value="u-3"]').text()).toBe('u-3')
    await wrapper.get('select').setValue('u-2')
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['msg-2'])
    wrapper.unmount()
  })

  it('filters locally decrypted captions but excludes deleted and undecryptable rows', async () => {
    const wrapper = mount(MessageSearchBar, {
      props: {
        messages: [
          sampleMessages[0],
          { ...sampleMessages[1], id: 'deleted', deleted_at: '2026-11-01T00:00:00Z' },
          { ...sampleMessages[1], id: 'locked', encryption: 'undecryptable' },
          { ...sampleMessages[1], id: 'caption', content: JSON.stringify({ type: 'images', images: [], caption: 'Apples photo' }) },
        ],
        modelValue: 'apples',
      },
    })
    await wrapper.get('select').setValue('u-2')
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('1 of 1')
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['caption'])
    await wrapper.setProps({ modelValue: '  ' })
    expect(wrapper.find('[data-test="search-count"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="search-next-btn"]').attributes('disabled')).toBeDefined()
    await wrapper.get('select').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('resets on keyword changes and preserves Enter and Shift+Enter wraparound', async () => {
    const wrapper = mount(MessageSearchBar, {
      props: { messages: sampleMessages, modelValue: 'apples' },
    })
    const input = wrapper.get('[data-test="search-input"]')
    await input.trigger('keydown', { key: 'Enter', shiftKey: true })
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['msg-2'])
    await input.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['msg-1'])
    await wrapper.setProps({ modelValue: 'oranges' })
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('1 of 1')
    expect(wrapper.emitted('jump')?.at(-1)).toEqual(['msg-2'])
    await wrapper.setProps({ messages: sampleMessages.map(message => ({ ...message, content: 'changed' })) })
    expect(wrapper.get('[data-test="search-count"]').text()).toBe('No results')
    wrapper.unmount()
  })

  it('cycles through results with next and prev buttons', async () => {
    const wrapper = mount(MessageSearchBar, {
      props: {
        messages: sampleMessages,
        modelValue: 'apples',
      },
    })

    const nextBtn = wrapper.find('[data-test="search-next-btn"]')
    await nextBtn.trigger('click')

    expect(wrapper.emitted('jump')?.[0]).toEqual(['msg-2'])

    const prevBtn = wrapper.find('[data-test="search-prev-btn"]')
    await prevBtn.trigger('click')
    expect(wrapper.emitted('jump')?.[1]).toEqual(['msg-1'])
  })

  it('emits close on close button click and escape key', async () => {
    const wrapper = mount(MessageSearchBar, {
      props: {
        messages: sampleMessages,
        modelValue: 'apples',
      },
    })

    const closeBtn = wrapper.find('[data-test="search-close-btn"]')
    await closeBtn.trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()

    const input = wrapper.find('[data-test="search-input"]')
    await input.trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')?.length).toBe(2)
  })
})
