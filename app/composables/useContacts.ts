import type { Ref } from 'vue'
import type { Contact, Profile } from '~/types/chat'
import { isValidEmail, isDuplicateKeyError } from '~/utils/chat'

export { isDuplicateKeyError }

export interface ContactsActionsDeps {
  supabase: any
  authProfile: {
    currentProfile: Ref<Profile | null>
    ensureProfile: () => Promise<Profile | null>
  }
  contacts: Ref<Contact[]>
  profilesCache: Map<string, Profile>
  allProfiles: Ref<Profile[]>
  syncOnlineFriends: () => void
}

export function createContactsActions(deps: {
  supabase: any
  authProfile: {
    currentProfile: Ref<Profile | null>
    ensureProfile: () => Promise<Profile | null>
  }
  contacts: Ref<Contact[]>
  profilesCache: Map<string, Profile>
  allProfiles: Ref<Profile[]>
  syncOnlineFriends: () => void
}) {
  const { supabase, authProfile, contacts, profilesCache, allProfiles, syncOnlineFriends } = deps

  async function findUserByEmail(email: string): Promise<Profile | null> {
    if (!email || !isValidEmail(email)) {
      return null
    }
    const cleanEmail = email.trim().toLowerCase()

    try {
      if (typeof supabase.rpc === 'function') {
        const { data, error } = await supabase.rpc('lookup_profile_by_email', { search_email: cleanEmail })
        if (!error && data) {
          const profile = (Array.isArray(data) ? data[0] : data) as Profile
          if (profile && profile.id) {
            profilesCache.set(profile.id, profile)
            if (!allProfiles.value.some(p => p.id === profile.id)) {
              allProfiles.value = [...allProfiles.value, profile].sort((a, b) =>
                a.display_name.localeCompare(b.display_name),
              )
            }
            return profile
          }
        }
      }
    } catch {
      // Fallback to direct query below
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .ilike('email', cleanEmail)
        .single()

      if (error || !data) {
        return null
      }
      const profile = data as Profile
      profilesCache.set(profile.id, profile)
      if (!allProfiles.value.some(p => p.id === profile.id)) {
        allProfiles.value = [...allProfiles.value, profile].sort((a, b) =>
          a.display_name.localeCompare(b.display_name),
        )
      }
      return profile
    } catch {
      return null
    }
  }

  const lookupUserByEmail = findUserByEmail

  async function loadContacts(): Promise<void> {
    const current = authProfile.currentProfile.value || (await authProfile.ensureProfile())
    if (!current?.id) return

    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('user_id, contact_user_id, created_at, profile:profiles!contacts_contact_user_id_fkey(*)')
        .eq('user_id', current.id)
        .order('created_at', { ascending: true })

      if (data && !error) {
        contacts.value = (data as any[]).map((row) => {
          let profile = row.profile
          if (profile) {
            profilesCache.set(profile.id, profile)
          } else {
            profile = profilesCache.get(row.contact_user_id) || allProfiles.value.find(p => p.id === row.contact_user_id) || null
          }
          return {
            user_id: row.user_id,
            contact_user_id: row.contact_user_id,
            created_at: row.created_at,
            profile,
          }
        })
        syncOnlineFriends()
      }
    } catch {
      // Ignore contacts load failure
    }
  }

  async function addContact(contactUserId: string): Promise<{ contact: Contact | null; error: string | null }> {
    const current = authProfile.currentProfile.value || (await authProfile.ensureProfile())
    if (!current?.id) {
      return { contact: null, error: 'Not authenticated.' }
    }
    if (current.id === contactUserId) {
      return { contact: null, error: 'Cannot add yourself as a contact.' }
    }

    const existing = contacts.value.find(c => c.contact_user_id === contactUserId)
    if (existing) {
      return { contact: existing, error: null }
    }

    let peerProfile = profilesCache.get(contactUserId) || allProfiles.value.find(p => p.id === contactUserId)
    if (!peerProfile) {
      try {
        const { data } = await supabase.from('profiles').select('*').eq('id', contactUserId).single()
        if (data) {
          peerProfile = data as Profile
          profilesCache.set(data.id, data as Profile)
        }
      } catch {
        // ignore
      }
    }

    try {
      let data: any = null
      let addError: any = null

      if (typeof supabase.rpc === 'function') {
        const { error: rpcError } = await supabase.rpc('add_mutual_friend', { target_user_id: contactUserId })
        addError = rpcError
      }

      if (addError || typeof supabase.rpc !== 'function') {
        const res = await supabase
          .from('contacts')
          .insert({
            user_id: current.id,
            contact_user_id: contactUserId,
          })
          .select('*')
          .single()

        if (res.error && !isDuplicateKeyError(res.error)) {
          return { contact: null, error: res.error.message }
        }
        data = res.data
      }

      if (!peerProfile) {
        try {
          const { data: fetchedProfile } = await supabase.from('profiles').select('*').eq('id', contactUserId).maybeSingle()
          if (fetchedProfile) {
            peerProfile = fetchedProfile as Profile
            profilesCache.set(fetchedProfile.id, fetchedProfile as Profile)
          }
        } catch {
          // ignore
        }
      }

      const newContact: Contact = {
        user_id: current.id,
        contact_user_id: contactUserId,
        created_at: data?.created_at || new Date().toISOString(),
        profile: (data as any)?.profile || peerProfile || null,
      }

      if (!contacts.value.some(c => c.contact_user_id === contactUserId)) {
        contacts.value = [...contacts.value, newContact]
        syncOnlineFriends()
      }

      return { contact: newContact, error: null }
    } catch (err: any) {
      return { contact: null, error: err?.message || 'Failed to add contact.' }
    }
  }

  async function removeContact(contactUserId: string): Promise<{ error: string | null }> {
    const current = authProfile.currentProfile.value || (await authProfile.ensureProfile())
    if (!current?.id) {
      return { error: 'Not authenticated.' }
    }

    contacts.value = contacts.value.filter(c => c.contact_user_id !== contactUserId)
    syncOnlineFriends()

    try {
      if (typeof supabase.rpc === 'function') {
        const { error: rpcError } = await supabase.rpc('remove_mutual_friend', { target_user_id: contactUserId })
        if (!rpcError) {
          return { error: null }
        }
      }

      const { error } = await supabase
        .from('contacts')
        .delete()
        .eq('user_id', current.id)
        .eq('contact_user_id', contactUserId)

      return { error: error ? error.message : null }
    } catch (err: any) {
      return { error: err?.message || 'Failed to remove contact.' }
    }
  }

  return {
    findUserByEmail,
    lookupUserByEmail,
    loadContacts,
    addContact,
    removeContact,
  }
}
