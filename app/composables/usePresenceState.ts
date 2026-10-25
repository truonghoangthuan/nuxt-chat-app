import type { Profile } from '~/types/chat'

export function deduplicatePresenceState(
  rawState: Record<string, Array<{ user_id: string; display_name: string; avatar_color: string; avatar_url?: string | null; online_at?: string }>>,
): Profile[] {
  const profileMap = new Map<string, Profile>()

  for (const presences of Object.values(rawState)) {
    if (!Array.isArray(presences)) continue

    for (const presence of presences) {
      if (!presence || !presence.user_id) continue

      if (!profileMap.has(presence.user_id)) {
        profileMap.set(presence.user_id, {
          id: presence.user_id,
          display_name: presence.display_name,
          avatar_color: presence.avatar_color,
          ...(presence.avatar_url ? { avatar_url: presence.avatar_url } : {}),
        })
      }
    }
  }

  const profiles = Array.from(profileMap.values())
  profiles.sort((a, b) => a.display_name.localeCompare(b.display_name))
  return profiles
}
