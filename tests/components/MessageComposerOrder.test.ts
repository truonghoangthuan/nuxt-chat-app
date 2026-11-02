import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { toRaw } from 'vue'
import MessageComposer from '~/components/MessageComposer.vue'

const wrappers: ReturnType<typeof mount>[] = []
function render() {
  const wrapper = mount(MessageComposer, {
    props: { conversationId: 'conv-1', channelSlug: 'friends' },
    attachTo: document.body,
  })
  wrappers.push(wrapper)
  return wrapper
}
async function queue(wrapper: ReturnType<typeof render>, files: File[]) {
  const input = wrapper.get('[data-test="file-input"]')
  Object.defineProperty(input.element, 'files', { value: files, configurable: true })
  await input.trigger('change')
}
function names(wrapper: ReturnType<typeof render>) {
  return wrapper.findAll('[data-test="attachment-preview"] img').map(img => img.attributes('alt'))
}
function photos() {
  return ['first.png', 'second.png', 'third.png'].map(name => new File([name], name, { type: 'image/png' }))
}

beforeEach(() => {
  let id = 0
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:preview-${++id}`)
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  vi.restoreAllMocks()
})

describe('composer attachment order', () => {
  it('hides single-image controls and disables movement at boundaries and while disabled', async () => {
    const wrapper = render()
    const files = photos()
    await queue(wrapper, [files[0]])
    expect(wrapper.find('[data-test="move-attachment-earlier"]').exists()).toBe(false)
    await queue(wrapper, files.slice(1))
    const earlier = wrapper.findAll('[data-test="move-attachment-earlier"]')
    const later = wrapper.findAll('[data-test="move-attachment-later"]')
    expect(earlier[0].attributes('disabled')).toBeDefined()
    expect(later[2].attributes('disabled')).toBeDefined()
    expect(earlier[1].attributes('aria-label')).toBe('Move second.png earlier')
    await earlier[0].trigger('click')
    await later[2].trigger('click')
    expect(names(wrapper)).toEqual(files.map(file => file.name))
    await wrapper.setProps({ disabled: true })
    expect([...earlier, ...later].every(button => button.attributes('disabled') !== undefined)).toBe(true)
    await later[0].trigger('click')
    expect(names(wrapper)).toEqual(files.map(file => file.name))
    expect(wrapper.emitted('sendImages')).toBeUndefined()
  })

  it('keeps duplicate filenames paired with their original File, URL and DOM node', async () => {
    const wrapper = render()
    const files = ['one', 'two', 'three'].map(data => new File([data], 'same.png', { type: 'image/png' }))
    await queue(wrapper, files)
    const firstPreview = wrapper.findAll('[data-test="attachment-preview"]')[0].element
    await wrapper.get('[data-test="move-attachment-later"]').trigger('click')
    expect(wrapper.findAll('[data-test="attachment-preview"]')[1].element).toBe(firstPreview)
    expect(wrapper.findAll('[data-test="attachment-preview"] img').map(img => img.attributes('src')))
      .toEqual(['blob:preview-2', 'blob:preview-1', 'blob:preview-3'])
    await wrapper.get('button[title="Send message"]').trigger('click')
    const sent = wrapper.emitted('sendImages')![0][0] as File[]
    expect(sent.map(toRaw)).toEqual([files[1], files[0], files[2]])
    expect(toRaw(sent[0])).toBe(files[1])
  })

  it('preserves order when appending and removing, and revokes only removed URLs', async () => {
    const wrapper = render()
    const files = photos()
    await queue(wrapper, files.slice(0, 2))
    await wrapper.get('[data-test="move-attachment-later"]').trigger('click')
    await queue(wrapper, [files[2]])
    expect(names(wrapper)).toEqual(['second.png', 'first.png', 'third.png'])
    await wrapper.findAll('[data-test="remove-attachment"]')[1].trigger('click')
    expect(names(wrapper)).toEqual(['second.png', 'third.png'])
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:preview-1')
    wrapper.unmount()
    wrappers.splice(wrappers.indexOf(wrapper), 1)
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(3)
  })

  it('retains validation and clears reordered files without leaking captions across conversations', async () => {
    const wrapper = render()
    await wrapper.get('textarea').setValue('Private caption')
    await queue(wrapper, photos())
    await wrapper.get('[data-test="move-attachment-later"]').trigger('click')
    await queue(wrapper, [new File(['pdf'], 'bad.pdf', { type: 'application/pdf' })])
    expect(wrapper.get('[data-test="attachment-error"]').text()).toMatch(/supported image type/i)
    expect(names(wrapper)).toEqual(['second.png', 'first.png', 'third.png'])
    await wrapper.setProps({ conversationId: 'conv-2' })
    expect(wrapper.find('[data-test="attachment-tray"]').exists()).toBe(false)
    expect(wrapper.get('textarea').element.value).toBe('')
    expect(wrapper.get('[role="status"]').text()).toBe('')
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(3)
    await wrapper.setProps({ conversationId: 'conv-1' })
    expect(wrapper.get('textarea').element.value).toBe('Private caption')
    expect(wrapper.find('[data-test="attachment-tray"]').exists()).toBe(false)
  })

  it('keeps focus with a moved attachment and announces its new position', async () => {
    const wrapper = render()
    await queue(wrapper, photos())
    const button = wrapper.findAll('[data-test="move-attachment-earlier"]')[1]
    ;(button.element as HTMLButtonElement).focus()
    await button.trigger('click')
    expect(document.activeElement?.closest('[data-test="attachment-preview"]')?.querySelector('img')?.alt).toBe('second.png')
    expect(document.activeElement?.getAttribute('data-test')).toBe('move-attachment-later')
    expect(wrapper.get('[role="status"]').text()).toBe('Moved second.png to position 1 of 3.')
    await wrapper.setProps({ conversationId: 'conv-2' })
    expect(wrapper.get('[role="status"]').text()).toBe('')
  })

  it('moves previews in both directions and sends the same File order with the caption', async () => {
    const wrapper = render()
    const files = photos()
    await wrapper.get('textarea').setValue('Photo story')
    await queue(wrapper, files)
    await wrapper.get('[data-test="move-attachment-later"]').trigger('click')
    expect(names(wrapper)).toEqual(['second.png', 'first.png', 'third.png'])
    await wrapper.findAll('[data-test="move-attachment-earlier"]')[2].trigger('click')
    expect(names(wrapper)).toEqual(['second.png', 'third.png', 'first.png'])
    expect(wrapper.get('textarea').element.value).toBe('Photo story')
    expect(URL.createObjectURL).toHaveBeenCalledTimes(3)
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    await wrapper.get('button[title="Send message"]').trigger('click')
    const [sent, caption] = wrapper.emitted('sendImages')![0] as [File[], string]
    expect(toRaw(sent[0])).toBe(files[1])
    expect(toRaw(sent[1])).toBe(files[2])
    expect(toRaw(sent[2])).toBe(files[0])
    expect(caption).toBe('Photo story')
    expect(wrapper.find('[data-test="attachment-tray"]').exists()).toBe(false)
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(3)
  })
})
