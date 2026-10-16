import { ref } from 'vue'
import type { Profile } from '~/types/chat'
import { getAvatarColor } from '~/utils/chat'

const currentProfile = ref<Profile | null>(null)

export function useAuthProfile() {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()

  async function ensureProfile(): Promise<Profile | null> {
    const authUser = user.value
    if (!authUser) {
      currentProfile.value = null
      return null
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
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
      || getAvatarColor(authUser.id)

    const fallbackProfile: Profile = {
      id: authUser.id,
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
    signInWithPassword,
    signUpWithProfile,
    signOut,
  }
}
