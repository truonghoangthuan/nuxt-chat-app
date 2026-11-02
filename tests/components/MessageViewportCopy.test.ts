import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import MessageViewport from '~/components/MessageViewport.vue'
import type { ChatMessage } from '~/types/chat'

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1', client_id: 'client-1', conversation_id: 'conv-1',
    user_id: 'friend', content: '  Hello @Tai 👋\nhttps://example.com `code`  ',
    created_at: '2026-11-02T01:00:00Z', status: 'sent', ...overrides,
  }
}

const wrappers: ReturnType<typeof mount>[] = []
function render(messages = [message()]) {
  const wrapper = mount(MessageViewport, {
    props: { messages, conversationId: 'conv-1', currentUserId: 'me' },
    global: { stubs: { MessageImageGrid: true } },
  })
  wrappers.push(wrapper)
  return wrapper
}

function clipboard(writeText = vi.fn().mockResolvedValue(undefined)) {
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  return writeText
}

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  vi.unstubAllGlobals()
})

describe('MessageViewport message copy', () => {
  it.each(['resolve', 'reject'] as const)('ignores %s after a conversation switch', async (result) => {
    let finish!: () => void
    clipboard(vi.fn(() => new Promise<void>((resolve, reject) => {
      finish = () => result === 'resolve' ? resolve() : reject(new Error('Denied'))
    })))
    const wrapper = render()
    await wrapper.get('[data-test="copy-message-msg-1"]').trigger('click')
    await wrapper.setProps({ conversationId: 'conv-2', messages: [] })
    finish()
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toBe('')
  })

  it('keeps feedback for the latest request when an older request rejects later', async () => {
    let rejectFirst!: (error: Error) => void
    clipboard(vi.fn()
      .mockImplementationOnce(() => new Promise<void>((_, reject) => { rejectFirst = reject }))
      .mockResolvedValue(undefined))
    const wrapper = render([message(), message({ id: 'msg-2', client_id: 'client-2' })])
    await wrapper.get('[data-test="copy-message-msg-1"]').trigger('click')
    await wrapper.get('[data-test="copy-message-msg-2"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toBe('Message copied to clipboard.')
    rejectFirst(new Error('Late denial'))
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toBe('Message copied to clipboard.')
  })

  it('clears existing copy feedback when changing conversations', async () => {
    clipboard()
    const wrapper = render()
    await wrapper.get('[data-test="copy-message-msg-1"]').trigger('click')
    await flushPromises()
    await wrapper.setProps({ conversationId: 'conv-2', messages: [] })
    expect(wrapper.get('[role="status"]').text()).toBe('')
  })

  it('does not mutate feedback after unmount', async () => {
    let finish!: () => void
    clipboard(vi.fn(() => new Promise<void>(resolve => { finish = resolve })))
    const wrapper = render()
    await wrapper.get('[data-test="copy-message-msg-1"]').trigger('click')
    const state = (wrapper.vm as any).$?.setupState
    expect(state.copyFeedback).toBe('')
    wrapper.unmount()
    finish()
    await flushPromises()
    expect(state.copyFeedback).toBe('')
  })

  it('copies a valid image caption without attachment metadata', async () => {
    const writeText = clipboard()
    const caption = '  Trip 🏕️\n@Tai https://example.com  '
    const content = JSON.stringify({ type: 'images', images: [
      { path: 'private/secret.enc', mimeType: 'image/png', width: 100, height: 100, size: 42 },
    ], caption })
    const wrapper = render([message({ content })])
    await wrapper.get('[data-test="copy-message-msg-1"]').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledExactlyOnceWith(caption)
  })

  it.each([
    { deleted_at: '2026-11-02T02:00:00Z' },
    { status: 'sending' as const },
    { status: 'failed' as const },
    { encryption: 'undecryptable' as const },
    { content: 'e2ee:v1:iv:ciphertext' },
    { content: '[sticker:happy:Happy:😊]' },
    { content: '   \n  ' },
    { content: JSON.stringify({ type: 'system', event: 'buzz', actorName: 'Friend' }) },
    { content: JSON.stringify({ type: 'images', images: [] }) },
    { content: JSON.stringify({ type: 'images', images: [], caption: '   ' }) },
    { content: JSON.stringify({ type: 'images', images: [{}], caption: 'Invalid' }) },
  ])('does not expose copy for unavailable or non-text content %j', (overrides) => {
    const writeText = clipboard()
    const wrapper = render([message(overrides)])
    expect(wrapper.find('[data-test="copy-message-msg-1"]').exists()).toBe(false)
    expect(writeText).not.toHaveBeenCalled()
  })

  it('copies sent code including fences, without changing the code-only action', async () => {
    const writeText = clipboard()
    const content = '```ts\nconst x = "🌻"\n```'
    const wrapper = render([message({ user_id: 'me', content })])
    await wrapper.get('[data-test="copy-message-msg-1"]').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenLastCalledWith(content)
    const codeCopy = wrapper.findAll('button').find(button => button.text() === 'Copy' && !button.attributes('data-test'))!
    await codeCopy.trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenLastCalledWith('const x = "🌻"')
  })

  it('reports denied clipboard access and permits retry', async () => {
    const writeText = clipboard(vi.fn().mockRejectedValueOnce(new Error('Denied')).mockResolvedValue(undefined))
    const wrapper = render()
    await wrapper.get('[data-test="copy-message-msg-1"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toContain('Could not copy.')
    expect(wrapper.get('[role="status"]').text()).toContain('select the message text')
    await wrapper.get('[data-test="copy-message-msg-1"]').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledTimes(2)
    expect(wrapper.get('[role="status"]').text()).toBe('Message copied to clipboard.')
  })

  it('reports unavailable clipboard rather than claiming success', async () => {
    vi.stubGlobal('navigator', {})
    const wrapper = render()
    await wrapper.get('[data-test="copy-message-msg-1"]').trigger('click')
    expect(wrapper.get('[role="status"]').text()).toContain('Clipboard unavailable.')
  })

  it('copies original received text only on an explicit action and reports success', async () => {
    const writeText = clipboard()
    const wrapper = render()
    expect(writeText).not.toHaveBeenCalled()
    const button = wrapper.get('[data-test="copy-message-msg-1"]')
    expect(button.attributes('aria-label')).toBe('Copy message')
    await button.trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledExactlyOnceWith(message().content)
    expect(wrapper.get('[role="status"]').text()).toBe('Message copied to clipboard.')
  })
})
