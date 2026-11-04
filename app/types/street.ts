export interface StreetParticipant {
  user_id: string
  display_name: string
  avatar_color: string
  session_id: string
  /** Zero-based deterministic position; positions beyond scene capacity are overflow. */
  seat: number
}

export type StreetStatus = 'idle' | 'connecting' | 'connected' | 'error'

export interface StreetTeaNotice {
  user_id: string
  id: string
  at: number
}
