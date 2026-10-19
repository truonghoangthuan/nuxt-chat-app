import { ref } from 'vue'
import type { Profile } from '~/types/chat'
import { getAvatarColor, isValidDisplayName, isValidAvatarColor, isValidAvatarUrl } from '~/utils/chat'

const testProfileRef = ref<Profile | null>(null)

export function extractAuthUserId(authUser: { id?: string; sub?: string } | null | undefined): string | null {
  if (!authUser) return null
  return authUser.id || authUser.sub || null
}

export function useAuthProfile() {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()
  const currentProfile = typeof useState !== 'undefined'
    ? useState<Profile | null>('auth-profile', () => null)
    : testProfileRef

  async function ensureProfile(): Promise<Profile | null> {
    let authUser: any = user.value
    let userId = extractAuthUserId(authUser)

    if (!userId && supabase?.auth?.getUser) {
      try {
        const { data } = await supabase.auth.getUser()
        if (data?.user) {
          authUser = data.user
          userId = extractAuthUserId(authUser)
        }
      } catch {
        // Ignore auth lookup error
      }
    }

    if (!authUser || !userId) {
      currentProfile.value = null
      return null
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (data && !error) {
        currentProfile.value = data as Profile
        return currentProfile.value
      }
    } catch {
      // Fallback to upsert below if profile fetch failed
    }

    // Fallback: create/upsert profile if missing
    const fallbackName = (authUser.user_metadata?.display_name as string | undefined)?.trim()
      || authUser.email?.split('@')[0]
      || 'Friend'
    const fallbackColor = (authUser.user_metadata?.avatar_color as string | undefined)
      || getAvatarColor(userId)

    const fallbackProfile: Profile = {
      id: userId,
      display_name: fallbackName,
      avatar_color: fallbackColor,
    }

    const { data: upsertedData } = await supabase
      .from('profiles')
      .upsert(fallbackProfile)
      .select('*')
      .single()

    currentProfile.value = (upsertedData as Profile) || fallbackProfile
    return currentProfile.value
  }

  async function updateProfile(
    displayName: string,
    avatarColor: string,
    avatarUrl = '',
  ): Promise<{ profile: Profile | null; error: string | null }> {
    const cleanName = displayName.trim()
    if (!isValidDisplayName(cleanName)) {
      return { profile: null, error: 'Display name must be between 1 and 40 characters.' }
    }
    if (!isValidAvatarColor(avatarColor)) {
      return { profile: null, error: 'Please select a valid avatar color.' }
    }
    const cleanAvatarUrl = avatarUrl.trim()
    if (!isValidAvatarUrl(cleanAvatarUrl)) {
      return { profile: null, error: 'Avatar URL must be a valid HTTP or HTTPS URL.' }
    }

    let authUser: any = user.value
    let userId = extractAuthUserId(authUser) || currentProfile.value?.id || null

    if (!userId && supabase?.auth?.getUser) {
      try {
        const { data } = await supabase.auth.getUser()
        if (data?.user) {
          authUser = data.user
          userId = extractAuthUserId(authUser)
        }
      } catch {
        // Ignore auth lookup error
      }
    }

    if (!userId) {
      return { profile: null, error: 'You must be signed in to update your profile.' }
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({
        display_name: cleanName,
        avatar_color: avatarColor,
        avatar_url: cleanAvatarUrl || null,
      })
      .eq('id', userId)
      .select('*')
      .single()

    if (error) {
      return { profile: null, error: error.message }
    }

    const updated = (data as Profile) || {
      id: userId,
      display_name: cleanName,
      avatar_color: avatarColor,
      avatar_url: cleanAvatarUrl || null,
    }
    currentProfile.value = updated
    return { profile: updated, error: null }
  }

  async function signInWithPassword(email: string, password: string): Promise<{ error: string | null }> {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (error) {
      return { error: error.message }
    }

    await ensureProfile()
    return { error: null }
  }

  async function signUpWithProfile(
    email: string,
    password: string,
    displayName: string,
  ): Promise<{ error: string | null; needsEmailConfirmation: boolean }> {
    const cleanEmail = email.trim()
    const cleanName = displayName.trim() || cleanEmail.split('@')[0]
    const avatarColor = getAvatarColor(cleanEmail)

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          display_name: cleanName,
          avatar_color: avatarColor,
        },
      },
    })

    if (error) {
      return { error: error.message, needsEmailConfirmation: false }
    }

    if (data.session) {
      await ensureProfile()
      return { error: null, needsEmailConfirmation: false }
    }

    return { error: null, needsEmailConfirmation: true }
  }

  async function signOut(): Promise<void> {
    await supabase.auth.signOut()
    currentProfile.value = null
  }

  return {
    currentProfile,
    ensureProfile,
    updateProfile,
    signInWithPassword,
    signUpWithProfile,
    signOut,
  }
}

