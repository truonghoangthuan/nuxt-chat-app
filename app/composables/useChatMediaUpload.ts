import type { Ref } from 'vue'
import type {
  Conversation,
  EncryptedImageMetadata,
  ImageMessagePayload,
  LocalImageAttachment,
  Profile,
} from '~/types/chat'
import { validateImageFiles, resizeImage } from '~/utils/image'
import { encryptBinary, encryptContent } from '~/utils/crypto'
import { isDuplicateKeyError } from '~/utils/chat'

export interface ChatMediaUploadOptions {
  supabase: any
  messagesStore: {
    addOptimisticMessage: (params: any) => any
    markMessageSent: (clientId: string, row: any) => void
    markMessageFailed: (clientId: string) => void
  }
  authProfile: {
    currentProfile: Ref<Profile | null>
    ensureProfile: () => Promise<Profile | null>
  }
  e2ee: {
    key: Ref<CryptoKey | null>
  }
  activeConversationId: Ref<string>
  conversations: Ref<Conversation[]>
}

export function useChatMediaUpload(options: ChatMediaUploadOptions) {
  const pendingImageFiles = new Map<string, {
    files: File[]
    caption?: string
    conversationId: string
    channelId?: string
  }>()

  async function sendImages(
    files: File[],
    captionOrClientId?: string,
    overrideClientId?: string,
  ): Promise<boolean> {
    let caption: string | undefined
    let clientIdOverride: string | undefined

    if (overrideClientId) {
      caption = captionOrClientId
      clientIdOverride = overrideClientId
    } else if (captionOrClientId) {
      if (pendingImageFiles.has(captionOrClientId)) {
        clientIdOverride = captionOrClientId
        caption = pendingImageFiles.get(captionOrClientId)?.caption
      } else {
        caption = captionOrClientId
      }
    }

    const conversationId = clientIdOverride
      ? (pendingImageFiles.get(clientIdOverride)?.conversationId || pendingImageFiles.get(clientIdOverride)?.channelId || options.activeConversationId.value)
      : options.activeConversationId.value

    if (!conversationId) return false

    let current = options.authProfile.currentProfile.value
    if (!current?.id) {
      current = await options.authProfile.ensureProfile()
    }
    if (!current?.id) return false

    const validation = validateImageFiles(files)
    if (!validation.valid) return false

    const key = options.e2ee.key.value
    if (!key) return false

    const clientId = clientIdOverride || (
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : '00000000-0000-4000-8000-' + Math.random().toString(16).slice(2, 14).padEnd(12, '0')
    )

    pendingImageFiles.set(clientId, { files, caption, conversationId, channelId: conversationId })

    const createdBlobUrls: string[] = []
    function revokeCreatedBlobs() {
      if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        for (const url of createdBlobUrls) {
          try {
            URL.revokeObjectURL(url)
          } catch {}
        }
      }
    }

    if (!clientIdOverride) {
      const localPreviews: LocalImageAttachment[] = files.map((file) => {
        const localUrl = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
          ? URL.createObjectURL(file)
          : ''
        if (localUrl) {
          createdBlobUrls.push(localUrl)
        }
        return {
          file,
          localUrl,
          width: 0,
          height: 0,
        }
      })

      const optimisticPayload: ImageMessagePayload = {
        type: 'images',
        images: localPreviews.map((p) => ({
          path: p.localUrl,
          mimeType: p.file.type || 'image/jpeg',
          width: p.width,
          height: p.height,
          size: p.file.size,
        })),
        ...(caption?.trim() ? { caption: caption.trim() } : {}),
      }

      const optimisticContent = JSON.stringify(optimisticPayload)
      const optimisticMessage = options.messagesStore.addOptimisticMessage({
        clientId,
        conversationId,
        channelId: conversationId,
        user: current,
        content: optimisticContent,
        encryption: 'e2ee',
      })
      const targetConv = options.conversations.value.find(c => c.id === conversationId)
      if (targetConv) {
        if (optimisticMessage) {
          targetConv.lastMessage = optimisticMessage
        }
        targetConv.updated_at = new Date().toISOString()
      }
    }

    const uploadedMetadatas: EncryptedImageMetadata[] = []

    for (let index = 0; index < files.length; index++) {
      const file = files[index]
      try {
        const resized = await resizeImage(file)
        const arrayBuffer = await resized.blob.arrayBuffer()
        const bytes = new Uint8Array(arrayBuffer)
        const encryptedBytes = await encryptBinary(key, bytes, conversationId)
        const storagePrefix = conversationId.startsWith('ch-') ? 'channels' : 'conversations'
        const storagePath = `${storagePrefix}/${conversationId}/${clientId}/${index}.enc`

        const { error: uploadError } = await options.supabase.storage
          .from('message-attachments')
          .upload(storagePath, encryptedBytes, {
            contentType: 'application/octet-stream',
            upsert: true,
          })

        if (uploadError) {
          options.messagesStore.markMessageFailed(clientId)
          return false
        }

        uploadedMetadatas.push({
          path: storagePath,
          mimeType: file.type || 'image/jpeg',
          width: resized.width,
          height: resized.height,
          size: resized.blob.size,
        })
      } catch {
        options.messagesStore.markMessageFailed(clientId)
        return false
      }
    }

    const finalPayload: ImageMessagePayload = {
      type: 'images',
      images: uploadedMetadatas,
      ...(caption?.trim() ? { caption: caption.trim() } : {}),
    }
    const payloadJson = JSON.stringify(finalPayload)

    try {
      const encryptedEnvelope = await encryptContent(key, payloadJson, conversationId)

      const { data, error } = await options.supabase
        .from('messages')
        .insert({
          client_id: clientId,
          conversation_id: conversationId,
          user_id: current.id,
          content: encryptedEnvelope,
        })
        .select('*, author:profiles!messages_user_id_fkey(id, display_name, avatar_color, avatar_url)')
        .single()

      if (error) {
        if (isDuplicateKeyError(error)) {
          const { data: existing } = await options.supabase
            .from('messages')
            .select('*, author:profiles!messages_user_id_fkey(id, display_name, avatar_color, avatar_url)')
            .eq('client_id', clientId)
            .single()
          if (existing) {
            revokeCreatedBlobs()
            pendingImageFiles.delete(clientId)
            options.messagesStore.markMessageSent(clientId, {
              ...existing,
              content: payloadJson,
              encryption: 'e2ee',
            })
            return true
          }
        }
        options.messagesStore.markMessageFailed(clientId)
        return false
      }

      if (data) {
        revokeCreatedBlobs()
        pendingImageFiles.delete(clientId)
        options.messagesStore.markMessageSent(clientId, {
          ...data,
          content: payloadJson,
          encryption: 'e2ee',
        })
        return true
      }

      options.messagesStore.markMessageFailed(clientId)
      return false
    } catch {
      options.messagesStore.markMessageFailed(clientId)
      return false
    }
  }

  return {
    pendingImageFiles,
    sendImages,
  }
}
