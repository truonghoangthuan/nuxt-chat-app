import type { Ref } from 'vue'
import type { Conversation, ConversationMember, Profile } from '~/types/chat'
import {
  validateBackgroundFile,
  serializeSystemMessage,
  CHAT_BACKGROUND_PRESETS,
} from '~/utils/chat'
import { sanitizeConfettiWords, normalizeConfettiWord } from '~/utils/confetti'

export interface ConversationsActionsDeps {
  supabase: any
  authProfile: {
    currentProfile: Ref<Profile | null>
    ensureProfile: () => Promise<Profile | null>
  }
  conversations: Ref<Conversation[]>
  activeConversationId: Ref<string | null>
  unreadCounts: Ref<Record<string, number>>
  profilesCache: Map<string, Profile>
  allProfiles: Ref<Profile[]>
  selectConversation: (convId: string) => Promise<void>
  loadConversations: () => Promise<void>
  messagesStore: { setInitialHistory: (msgs: any[], convId: string) => void }
  sendMessage: (content: string, replyTo?: any, conversationId?: string) => Promise<any>
  findUserByEmail: (email: string) => Promise<Profile | null>
}

export function createConversationsActions(deps: ConversationsActionsDeps) {
  const {
    supabase,
    authProfile,
    conversations,
    activeConversationId,
    unreadCounts,
    profilesCache,
    allProfiles,
    selectConversation,
    loadConversations,
    messagesStore,
    sendMessage,
    findUserByEmail,
  } = deps

  const inFlightDirectChats = new Map<string, Promise<Conversation>>()

  async function openOrCreateDirectChat(peerUserId: string): Promise<Conversation> {
    const inFlight = inFlightDirectChats.get(peerUserId)
    if (inFlight) {
      return inFlight
    }

    const task = (async () => {
      const current = authProfile.currentProfile.value || (await authProfile.ensureProfile())
      if (!current?.id) {
        throw new Error('Not authenticated.')
      }
      if (current.id === peerUserId) {
        throw new Error('Cannot start a direct message with yourself.')
      }

      let peerProfile = profilesCache.get(peerUserId) || allProfiles.value.find(p => p.id === peerUserId)
      if (!peerProfile) {
        try {
          const { data } = await supabase.from('profiles').select('*').eq('id', peerUserId).single()
          if (data) {
            peerProfile = data as Profile
            profilesCache.set(data.id, data as Profile)
            if (!allProfiles.value.some(p => p.id === data.id)) {
              allProfiles.value = [...allProfiles.value, data as Profile]
            }
          }
        } catch {
          // ignore
        }
      }

      const existingInMemory = conversations.value.find(c => {
        if (c.type !== 'direct') return false
        if (c.peer?.id === peerUserId) return true
        if (c.members?.some(m => m.user_id === peerUserId)) return true
        return false
      })

      if (existingInMemory) {
        await selectConversation(existingInMemory.id)
        return existingInMemory
      }

      if (typeof (supabase as any).rpc === 'function') {
        try {
          const { data: rpcConvId, error: rpcErr } = await (supabase as any).rpc(
            'get_or_create_direct_conversation',
            { target_user_id: peerUserId },
          )
          if (!rpcErr && typeof rpcConvId === 'string' && rpcConvId) {
            await loadConversations()
            let found = conversations.value.find(c => c.id === rpcConvId)
            if (!found) {
              const { data: freshConv } = await supabase
                .from('conversations')
                .select('*, members:conversation_members(*, profile:profiles(*))')
                .eq('id', rpcConvId)
                .single()
              if (freshConv) {
                const convObj: Conversation = {
                  id: freshConv.id,
                  type: 'direct',
                  title: null,
                  created_by: freshConv.created_by,
                  created_at: freshConv.created_at,
                  updated_at: freshConv.updated_at,
                  peer: peerProfile || null,
                  members: freshConv.members || [],
                  unreadCount: 0,
                  background_url: freshConv.background_url || null,
                }
                conversations.value = [convObj, ...conversations.value]
                found = convObj
              }
            }
            if (found) {
              if (peerProfile && !found.peer) {
                found.peer = peerProfile
              }
              await selectConversation(found.id)
              return found
            }
          }
        } catch {
          // RPC failed or unmocked; fall back to client queries
        }
      }

      try {
        const { data: existingMemberships } = await supabase
          .from('conversation_members')
          .select('conversation_id, conversation:conversations(*)')
          .eq('user_id', peerUserId)

        if (existingMemberships && existingMemberships.length > 0) {
          const matched = (existingMemberships as any[]).find(
            m => m.conversation && m.conversation.type === 'direct',
          )
          if (matched?.conversation) {
            const c = matched.conversation
            const conv: Conversation = {
              id: c.id,
              type: 'direct',
              title: null,
              created_by: c.created_by,
              created_at: c.created_at,
              updated_at: c.updated_at,
              peer: peerProfile || null,
              members: [
                { conversation_id: c.id, user_id: current.id, role: 'owner', joined_at: c.created_at, profile: current },
                { conversation_id: c.id, user_id: peerUserId, role: 'member', joined_at: c.created_at, profile: peerProfile || null },
              ],
              unreadCount: unreadCounts.value[c.id] || 0,
            }
            if (!conversations.value.some(item => item.id === conv.id)) {
              conversations.value = [conv, ...conversations.value]
            }
            await selectConversation(conv.id)
            return conv
          }
        }
      } catch {
        // ignore
      }

      const { data: convData, error: convError } = await supabase
        .from('conversations')
        .insert({
          type: 'direct',
          created_by: current.id,
        })
        .select('*')
        .single()

      if (convError || !convData) {
        throw new Error(convError?.message || 'Failed to create direct conversation.')
      }

      const membersToInsert = [
        { conversation_id: convData.id, user_id: current.id, role: 'owner' },
        { conversation_id: convData.id, user_id: peerUserId, role: 'member' },
      ]
      const { error: memberError } = await supabase.from('conversation_members').insert(membersToInsert)
      if (memberError) {
        throw new Error(memberError.message || 'Failed to add conversation members.')
      }

      const newConv: Conversation = {
        id: convData.id,
        type: 'direct',
        title: null,
        created_by: current.id,
        created_at: convData.created_at || new Date().toISOString(),
        updated_at: convData.updated_at || new Date().toISOString(),
        peer: peerProfile || null,
        members: [
          { conversation_id: convData.id, user_id: current.id, role: 'owner', joined_at: new Date().toISOString(), profile: current },
          { conversation_id: convData.id, user_id: peerUserId, role: 'member', joined_at: new Date().toISOString(), profile: peerProfile || null },
        ],
        unreadCount: 0,
        background_url: convData.background_url || null,
      }

      if (!conversations.value.some(c => c.id === newConv.id)) {
        conversations.value = [newConv, ...conversations.value]
      }
      await selectConversation(newConv.id)
      return newConv
    })()

    inFlightDirectChats.set(peerUserId, task)
    try {
      return await task
    } finally {
      inFlightDirectChats.delete(peerUserId)
    }
  }

  async function createGroup(title: string, memberUserIds: string[]): Promise<Conversation> {
    const cleanTitle = title?.trim()
    if (!cleanTitle) {
      throw new Error('Group title is required.')
    }

    const current = authProfile.currentProfile.value || (await authProfile.ensureProfile())
    if (!current?.id) {
      throw new Error('Not authenticated.')
    }

    const { data: convData, error: convError } = await supabase
      .from('conversations')
      .insert({
        type: 'group',
        title: cleanTitle,
        created_by: current.id,
      })
      .select('*')
      .single()

    if (convError || !convData) {
      throw new Error(convError?.message || 'Failed to create group conversation.')
    }

    const uniqueOtherIds = Array.from(new Set(memberUserIds.filter(id => id && id !== current.id)))
    const membersToInsert = [
      { conversation_id: convData.id, user_id: current.id, role: 'owner' },
      ...uniqueOtherIds.map(uid => ({
        conversation_id: convData.id,
        user_id: uid,
        role: 'member',
      })),
    ]

    const { error: memberError } = await supabase.from('conversation_members').insert(membersToInsert)
    if (memberError) {
      throw new Error(memberError.message || 'Failed to add group members.')
    }

    const memberList: ConversationMember[] = membersToInsert.map(m => ({
      conversation_id: convData.id,
      user_id: m.user_id,
      role: m.role as 'owner' | 'member',
      joined_at: new Date().toISOString(),
      profile: m.user_id === current.id ? current : (profilesCache.get(m.user_id) || allProfiles.value.find(p => p.id === m.user_id) || null),
    }))

    const newGroup: Conversation = {
      id: convData.id,
      type: 'group',
      title: cleanTitle,
      created_by: current.id,
      created_at: convData.created_at || new Date().toISOString(),
      updated_at: convData.updated_at || new Date().toISOString(),
      members: memberList,
      unreadCount: 0,
      background_url: convData.background_url || null,
    }

    if (!conversations.value.some(c => c.id === newGroup.id)) {
      conversations.value = [newGroup, ...conversations.value]
    }
    await selectConversation(newGroup.id)
    return newGroup
  }

  const createGroupChat = createGroup

  async function addMemberToGroup(conversationId: string, email: string): Promise<void> {
    const conv = conversations.value.find(c => c.id === conversationId)
    if (conv && conv.type !== 'group') {
      throw new Error('Cannot add members to a direct message.')
    }

    const user = await findUserByEmail(email)
    if (!user) {
      throw new Error(`User not found with email: ${email}`)
    }

    if (conv?.members?.some(m => m.user_id === user.id)) {
      return
    }

    const { error } = await supabase
      .from('conversation_members')
      .insert({
        conversation_id: conversationId,
        user_id: user.id,
        role: 'member',
      })

    if (error) {
      throw new Error(error.message)
    }

    if (conv) {
      const newMember: ConversationMember = {
        conversation_id: conversationId,
        user_id: user.id,
        role: 'member',
        joined_at: new Date().toISOString(),
        profile: user,
      }
      conv.members = [...(conv.members || []), newMember]
    }
  }

  const addGroupMember = addMemberToGroup

  async function leaveGroup(conversationId: string): Promise<void> {
    const current = authProfile.currentProfile.value || (await authProfile.ensureProfile())
    if (!current?.id) {
      throw new Error('Not authenticated.')
    }

    const { error: leaveError } = await supabase
      .from('conversation_members')
      .delete()
      .eq('conversation_id', conversationId)
      .eq('user_id', current.id)

    if (leaveError) {
      throw new Error(leaveError.message || 'Failed to leave group.')
    }

    conversations.value = conversations.value.filter(c => c.id !== conversationId)

    if (activeConversationId.value === conversationId) {
      const next = conversations.value[0]?.id || null
      if (next) {
        await selectConversation(next)
      } else {
        activeConversationId.value = null
        messagesStore.setInitialHistory([], '')
      }
    }
  }

  const leaveGroupChat = leaveGroup

  async function updateGroupTitle(
    conversationId: string,
    title: string,
  ): Promise<{ error: string | null }> {
    const cleanTitle = title?.trim()
    if (!cleanTitle || cleanTitle.length > 100) {
      return { error: 'Group title must be 1–100 characters.' }
    }

    const current = authProfile.currentProfile.value || (await authProfile.ensureProfile())
    if (!current?.id) {
      return { error: 'Not authenticated.' }
    }

    const targetConv = conversations.value.find(c => c.id === conversationId)
    if (!targetConv || targetConv.type !== 'group') {
      return { error: 'Group conversation not found.' }
    }

    const previousTitle = targetConv.title
    const previousUpdatedAt = targetConv.updated_at
    const nowIso = new Date().toISOString()

    targetConv.title = cleanTitle
    targetConv.updated_at = nowIso

    try {
      const { error } = await supabase
        .from('conversations')
        .update({
          title: cleanTitle,
          updated_at: nowIso,
        })
        .eq('id', conversationId)

      if (error) {
        targetConv.title = previousTitle
        targetConv.updated_at = previousUpdatedAt
        return { error: error.message || 'Failed to update group title.' }
      }

      const actorName = current.display_name || 'Someone'
      const sysPayload = serializeSystemMessage({
        type: 'system',
        event: 'group_rename',
        actorName,
        detail: cleanTitle,
      })
      await sendMessage(sysPayload, undefined, conversationId).catch(() => {})

      return { error: null }
    } catch (err: any) {
      targetConv.title = previousTitle
      targetConv.updated_at = previousUpdatedAt
      return { error: err?.message || 'Failed to update group title.' }
    }
  }

  const updateGroupName = updateGroupTitle

  async function updateChatBackground(
    conversationId: string,
    backgroundOrFile: string | File,
  ): Promise<{ error: string | null }> {
    const current = authProfile.currentProfile.value || (await authProfile.ensureProfile())
    if (!current?.id) {
      return { error: 'Not authenticated.' }
    }

    const targetConv = conversations.value.find(c => c.id === conversationId)
    if (!targetConv) {
      return { error: 'Conversation not found.' }
    }

    let finalUrl: string
    if (typeof backgroundOrFile !== 'string') {
      const file = backgroundOrFile
      const validation = validateBackgroundFile(file)
      if (!validation.valid) {
        return { error: validation.error || 'Invalid background file.' }
      }

      try {
        const ext = file.name ? file.name.split('.').pop() || 'jpg' : 'jpg'
        const filePath = `conversations/${conversationId}/bg-${Date.now()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('chat-backgrounds')
          .upload(filePath, file, { contentType: file.type, upsert: true })

        if (uploadError) {
          return { error: uploadError.message || 'Failed to upload background image.' }
        }

        const { data: publicUrlData } = supabase.storage
          .from('chat-backgrounds')
          .getPublicUrl(filePath)

        finalUrl = publicUrlData.publicUrl
      } catch (err: any) {
        return { error: err?.message || 'Failed to upload background image.' }
      }
    } else {
      finalUrl = backgroundOrFile.trim()
    }

    const prevBg = targetConv.background_url
    const prevUpdated = targetConv.updated_at
    const nowIso = new Date().toISOString()

    targetConv.background_url = finalUrl
    targetConv.updated_at = nowIso

    try {
      const { error: dbError } = await supabase
        .from('conversations')
        .update({ background_url: finalUrl, updated_at: nowIso })
        .eq('id', conversationId)

      if (dbError) {
        targetConv.background_url = prevBg
        targetConv.updated_at = prevUpdated
        return { error: dbError.message || 'Failed to update background.' }
      }

      const actorName = current.display_name || 'Someone'
      const preset = CHAT_BACKGROUND_PRESETS.find(p => p.value === finalUrl)
      const presetLabel = preset ? preset.label : 'a custom image'
      const sysPayload = serializeSystemMessage({
        type: 'system',
        event: 'background_change',
        actorName,
        detail: presetLabel,
      })
      await sendMessage(sysPayload, undefined, conversationId).catch(() => {})

      return { error: null }
    } catch (err: any) {
      targetConv.background_url = prevBg
      targetConv.updated_at = prevUpdated
      return { error: err?.message || 'Failed to update background.' }
    }
  }

  async function removeChatBackground(conversationId: string): Promise<{ error: string | null }> {
    const current = authProfile.currentProfile.value || (await authProfile.ensureProfile())
    if (!current?.id) {
      return { error: 'Not authenticated.' }
    }

    const targetConv = conversations.value.find(c => c.id === conversationId)
    if (!targetConv) {
      return { error: 'Conversation not found.' }
    }

    const prevBg = targetConv.background_url
    const prevUpdated = targetConv.updated_at
    const nowIso = new Date().toISOString()

    targetConv.background_url = null
    targetConv.updated_at = nowIso

    try {
      const { error: dbError } = await supabase
        .from('conversations')
        .update({ background_url: null, updated_at: nowIso })
        .eq('id', conversationId)

      if (dbError) {
        targetConv.background_url = prevBg
        targetConv.updated_at = prevUpdated
        return { error: dbError.message || 'Failed to remove background.' }
      }

      const actorName = current.display_name || 'Someone'
      const sysPayload = serializeSystemMessage({
        type: 'system',
        event: 'background_reset',
        actorName,
      })
      await sendMessage(sysPayload, undefined, conversationId).catch(() => {})

      return { error: null }
    } catch (err: any) {
      targetConv.background_url = prevBg
      targetConv.updated_at = prevUpdated
      return { error: err?.message || 'Failed to remove background.' }
    }
  }

  async function updateConfettiWords(
    conversationId: string,
    words: string[],
  ): Promise<{ error: string | null }> {
    const current = authProfile.currentProfile.value || (await authProfile.ensureProfile())
    if (!current?.id) {
      return { error: 'Not authenticated.' }
    }

    const targetConv = conversations.value.find(c => c.id === conversationId)
    if (!targetConv) {
      return { error: 'Conversation not found.' }
    }

    const sanitized = sanitizeConfettiWords(words)
    const prevWords = [...(targetConv.confetti_words || [])]
    const prevUpdated = targetConv.updated_at
    const nowIso = new Date().toISOString()

    targetConv.confetti_words = sanitized
    targetConv.updated_at = nowIso

    try {
      const { error: dbError } = await supabase
        .from('conversations')
        .update({ confetti_words: sanitized, updated_at: nowIso })
        .eq('id', conversationId)

      if (dbError) {
        targetConv.confetti_words = prevWords
        targetConv.updated_at = prevUpdated
        return { error: dbError.message || 'Failed to update confetti dictionary.' }
      }

      return { error: null }
    } catch (err: any) {
      targetConv.confetti_words = prevWords
      targetConv.updated_at = prevUpdated
      return { error: err?.message || 'Failed to update confetti dictionary.' }
    }
  }

  async function addConfettiWord(
    conversationId: string,
    wordInput: string,
  ): Promise<{ error: string | null }> {
    const targetConv = conversations.value.find(c => c.id === conversationId)
    if (!targetConv) {
      return { error: 'Conversation not found.' }
    }
    const existing = targetConv.confetti_words || []
    const next = sanitizeConfettiWords([...existing, wordInput])
    if (next.length === existing.length && next.every((w, i) => w === existing[i])) {
      return { error: null }
    }
    return updateConfettiWords(conversationId, next)
  }

  async function removeConfettiWord(
    conversationId: string,
    wordToRemove: string,
  ): Promise<{ error: string | null }> {
    const targetConv = conversations.value.find(c => c.id === conversationId)
    if (!targetConv) {
      return { error: 'Conversation not found.' }
    }
    const normalizedTarget = normalizeConfettiWord(wordToRemove)
    const existing = targetConv.confetti_words || []
    const next = existing.filter(w => normalizeConfettiWord(w) !== normalizedTarget)
    return updateConfettiWords(conversationId, next)
  }

  return {
    openOrCreateDirectChat,
    createGroup,
    createGroupChat,
    addMemberToGroup,
    addGroupMember,
    leaveGroup,
    leaveGroupChat,
    updateGroupTitle,
    updateGroupName,
    updateChatBackground,
    removeChatBackground,
    updateConfettiWords,
    addConfettiWord,
    removeConfettiWord,
  }
}
