import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import type { EncryptedImageMetadata } from '~/types/chat'
import MessageImageGrid from '~/components/MessageImageGrid.vue'
import MessageActionsMenu from '~/components/MessageActionsMenu.vue'
import MessageViewport from '~/components/MessageViewport.vue'
import { useImageAttachmentCache } from '~/composables/useImageAttachmentCache'

function makeMockImage(id: number, isBlob = false): EncryptedImageMetadata {
  return {
    path: isBlob ? `blob:mock-image-${id}` : `channels/ch-1/images/img-${id}.enc`,
    mimeType: 'image/jpeg',
    width: 800,
    height: 600,
    size: 50000,
  }
}

describe('MessageImageGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const cache = useImageAttachmentCache()
    cache.revokeAllUrls()
  })

  it('renders single image layout for 1 image and emits selectImage on click', async () => {
    const images = [makeMockImage(1, true)]
    const wrapper = mount(MessageImageGrid, {
      props: {
        images,
        channelId: 'ch-1',
      },
    })

    const tiles = wrapper.findAll('[data-test="image-grid-tile"]')
    expect(tiles).toHaveLength(1)

    const singleContainer = wrapper.find('[data-test="single-image-container"]')
    expect(singleContainer.exists()).toBe(true)
    expect(singleContainer.classes()).toContain('max-h-96')

    const img = wrapper.find('img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe(images[0].path)

    await tiles[0].trigger('click')
    expect(wrapper.emitted('selectImage')).toBeTruthy()
    expect(wrapper.emitted('selectImage')?.[0]).toEqual([
      { images, initialIndex: 0 },
    ])
  })

  it('renders 2-column grid for 2 images and emits selectImage with initialIndex', async () => {
    const images = [makeMockImage(1, true), makeMockImage(2, true)]
    const wrapper = mount(MessageImageGrid, {
      props: {
        images,
        channelId: 'ch-1',
      },
    })

    const grid = wrapper.find('[data-test="multi-image-grid"]')
    expect(grid.exists()).toBe(true)
    expect(grid.classes()).toContain('grid-cols-2')

    const tiles = wrapper.findAll('[data-test="image-grid-tile"]')
    expect(tiles).toHaveLength(2)

    await tiles[1].trigger('click')
    expect(wrapper.emitted('selectImage')?.[0]).toEqual([
      { images, initialIndex: 1 },
    ])
  })

  it('renders 3 images with first tile spanning 2 rows', async () => {
    const images = [makeMockImage(1, true), makeMockImage(2, true), makeMockImage(3, true)]
    const wrapper = mount(MessageImageGrid, {
      props: {
        images,
        channelId: 'ch-1',
      },
    })

    const tiles = wrapper.findAll('[data-test="image-grid-tile"]')
    expect(tiles).toHaveLength(3)
    expect(tiles[0].classes()).toContain('row-span-2')

    await tiles[2].trigger('click')
    expect(wrapper.emitted('selectImage')?.[0]).toEqual([
      { images, initialIndex: 2 },
    ])
  })

  it('renders 2x2 grid for 4 images', async () => {
    const images = [
      makeMockImage(1, true),
      makeMockImage(2, true),
      makeMockImage(3, true),
      makeMockImage(4, true),
    ]
    const wrapper = mount(MessageImageGrid, {
      props: {
        images,
        channelId: 'ch-1',
      },
    })

    const tiles = wrapper.findAll('[data-test="image-grid-tile"]')
    expect(tiles).toHaveLength(4)
    expect(wrapper.find('[data-test="image-overflow-badge"]').exists()).toBe(false)

    await tiles[3].trigger('click')
    expect(wrapper.emitted('selectImage')?.[0]).toEqual([
      { images, initialIndex: 3 },
    ])
  })

  it('renders 4 tiles with overlay badge +1 for 5 images', async () => {
    const images = [
      makeMockImage(1, true),
      makeMockImage(2, true),
      makeMockImage(3, true),
      makeMockImage(4, true),
      makeMockImage(5, true),
    ]
    const wrapper = mount(MessageImageGrid, {
      props: {
        images,
        channelId: 'ch-1',
      },
    })

    const tiles = wrapper.findAll('[data-test="image-grid-tile"]')
    expect(tiles).toHaveLength(4)

    const badge = wrapper.find('[data-test="image-overflow-badge"]')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('+1')

    await tiles[3].trigger('click')
    expect(wrapper.emitted('selectImage')?.[0]).toEqual([
      { images, initialIndex: 3 },
    ])
  })

  it('renders 4 tiles with overlay badge +2 for 6 images', async () => {
    const images = Array.from({ length: 6 }, (_, i) => makeMockImage(i + 1, true))
    const wrapper = mount(MessageImageGrid, {
      props: {
        images,
        channelId: 'ch-1',
      },
    })

    const badge = wrapper.find('[data-test="image-overflow-badge"]')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('+2')
  })

  it('uses blob URL directly for optimistic sending state', async () => {
    const images = [makeMockImage(1, true)]
    const wrapper = mount(MessageImageGrid, {
      props: {
        images,
        channelId: 'ch-1',
        isSending: true,
      },
    })

    const img = wrapper.find('img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe('blob:mock-image-1')
  })

  it('shows animated skeleton while decrypting/loading remote encrypted images', async () => {
    const fakeKey = {} as CryptoKey
    const cache = useImageAttachmentCache()
    let resolveImageFetch: (url: string) => void
    const pendingPromise = new Promise<string>((resolve) => {
      resolveImageFetch = resolve
    })

    vi.spyOn(cache, 'getOrFetchImage').mockReturnValue(pendingPromise)

    const images = [makeMockImage(1, false)]
    const wrapper = mount(MessageImageGrid, {
      props: {
        images,
        channelId: 'ch-1',
        e2eeKey: fakeKey,
      },
    })

    // Skeleton is displayed while loading
    const skeleton = wrapper.find('[data-test="image-skeleton"]')
    expect(skeleton.exists()).toBe(true)
    expect(skeleton.classes()).toContain('animate-pulse')

    // Resolve fetch
    resolveImageFetch!('blob:decrypted-url-1')
    await pendingPromise
    await wrapper.vm.$nextTick()

    expect(wrapper.find('img').attributes('src')).toBe('blob:decrypted-url-1')
  })
})

describe('MessageActionsMenu and MessageViewport immutability for images', () => {
  const imagePayloadJson = JSON.stringify({
    type: 'images',
    images: [makeMockImage(1, false)],
  })

  it('MessageActionsMenu hides Edit action if message content is image payload', async () => {
    const message = {
      id: 'm-img-1',
      channel_id: 'ch-1',
      user_id: 'u-1',
      content: imagePayloadJson,
      created_at: '2026-10-19T12:00:00Z',
      status: 'sent' as const,
      author: { id: 'u-1', display_name: 'Alice', avatar_color: '#4f46e5' },
    }

    const wrapper = mount(MessageActionsMenu, {
      props: { message, currentUserId: 'u-1' },
    })

    await wrapper.find('[data-test="open-mobile-actions"]').trigger('click')
    expect(wrapper.find('[data-test="mobile-edit"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="mobile-delete"]').exists()).toBe(true)
  })

  it('MessageViewport hides Edit button in desktop hover toolbar for image messages', async () => {
    const message = {
      id: 'm-img-2',
      client_id: 'c-img-2',
      channel_id: 'ch-1',
      user_id: 'u-1',
      content: imagePayloadJson,
      created_at: '2026-10-19T12:00:00Z',
      status: 'sent' as const,
      author: { id: 'u-1', display_name: 'Alice', avatar_color: '#4f46e5' },
    }

    const wrapper = mount(MessageViewport, {
      props: {
        messages: [message],
        currentUserId: 'u-1',
        loadOlder: vi.fn().mockResolvedValue(0),
      },
    })

    expect(wrapper.find('[data-test="edit-m-img-2"]').exists()).toBe(false)
  })

  it('MessageViewport renders caption with tokenized mentions below MessageImageGrid when caption is present', async () => {
    const payloadWithCaption = JSON.stringify({
      type: 'images',
      images: [makeMockImage(1, false)],
      caption: 'Look at this photo @Bob check https://example.com',
    })
    const message = {
      id: 'm-img-caption',
      client_id: 'c-img-caption',
      channel_id: 'ch-1',
      user_id: 'u-1',
      content: payloadWithCaption,
      created_at: '2026-10-19T12:00:00Z',
      status: 'sent' as const,
      author: { id: 'u-1', display_name: 'Alice', avatar_color: '#4f46e5' },
    }

    const wrapper = mount(MessageViewport, {
      props: {
        messages: [message],
        currentUserId: 'u-1',
        currentDisplayName: 'Alice',
        loadOlder: vi.fn().mockResolvedValue(0),
      },
    })

    const captionEl = wrapper.find('[data-test="image-caption"]')
    expect(captionEl.exists()).toBe(true)
    expect(captionEl.text()).toContain('Look at this photo')
    expect(captionEl.find('[data-test="mention-token"]').exists()).toBe(true)
    expect(captionEl.find('[data-test="mention-token"]').text()).toBe('@Bob')
    expect(captionEl.find('[data-test="link-token"]').exists()).toBe(true)
  })

  it('MessageViewport does not render caption element when image payload has no caption', async () => {
    const message = {
      id: 'm-img-no-caption',
      client_id: 'c-img-no-caption',
      channel_id: 'ch-1',
      user_id: 'u-1',
      content: imagePayloadJson,
      created_at: '2026-10-19T12:00:00Z',
      status: 'sent' as const,
      author: { id: 'u-1', display_name: 'Alice', avatar_color: '#4f46e5' },
    }

    const wrapper = mount(MessageViewport, {
      props: {
        messages: [message],
        currentUserId: 'u-1',
        loadOlder: vi.fn().mockResolvedValue(0),
      },
    })

    expect(wrapper.find('[data-test="image-caption"]').exists()).toBe(false)
  })
})
