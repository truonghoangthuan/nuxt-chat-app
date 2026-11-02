export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          display_name: string
          avatar_color: string
          avatar_url: string | null
          bank_qr_url: string | null
          created_at: string
        }
        Insert: {
          id: string
          email: string
          display_name: string
          avatar_color: string
          avatar_url?: string | null
          bank_qr_url?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
      }
      contacts: {
        Row: {
          user_id: string
          contact_user_id: string
          created_at: string
        }
        Insert: {
          user_id: string
          contact_user_id: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['contacts']['Insert']>
      }
      conversations: {
        Row: {
          id: string
          type: 'direct' | 'group'
          title: string | null
          created_by: string | null
          background_url: string | null
          confetti_words: string[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          type: 'direct' | 'group'
          title?: string | null
          created_by?: string | null
          background_url?: string | null
          confetti_words?: string[]
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['conversations']['Insert']>
      }
      conversation_members: {
        Row: {
          conversation_id: string
          user_id: string
          role: 'owner' | 'member'
          joined_at: string
        }
        Insert: {
          conversation_id: string
          user_id: string
          role?: 'owner' | 'member'
          joined_at?: string
        }
        Update: Partial<Database['public']['Tables']['conversation_members']['Insert']>
      }
      messages: {
        Row: {
          id: string
          client_id: string
          conversation_id: string
          user_id: string
          content: string
          reply_to_id: string | null
          pinned_at: string | null
          pinned_by: string | null
          edited_at: string | null
          deleted_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          client_id: string
          conversation_id: string
          user_id: string
          content: string
          reply_to_id?: string | null
          pinned_at?: string | null
          pinned_by?: string | null
          edited_at?: string | null
          deleted_at?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['messages']['Insert']>
      }
      message_reactions: {
        Row: {
          id: string
          message_id: string
          conversation_id: string
          user_id: string
          emoji: string
          created_at: string
        }
        Insert: {
          id?: string
          message_id: string
          conversation_id: string
          user_id: string
          emoji: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['message_reactions']['Insert']>
      }
      conversation_reads: {
        Row: {
          user_id: string
          conversation_id: string
          last_read_at: string
        }
        Insert: {
          user_id: string
          conversation_id: string
          last_read_at?: string
        }
        Update: Partial<Database['public']['Tables']['conversation_reads']['Insert']>
      }
      e2ee_config: {
        Row: {
          id: number
          salt: string
          iterations: number
          verifier: string
          created_at: string
        }
        Insert: {
          id?: number
          salt: string
          iterations: number
          verifier: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['e2ee_config']['Insert']>
      }
      caro_games: {
        Row: {
          id: string
          player_x_id: string
          player_o_id: string | null
          status: 'waiting' | 'active' | 'won' | 'draw'
          current_player_id: string | null
          winner_id: string | null
          move_count: number
          created_at: string
        }
        Insert: {
          id?: string
          player_x_id: string
          player_o_id?: string | null
          status?: 'waiting' | 'active' | 'won' | 'draw'
          current_player_id?: string | null
          winner_id?: string | null
          move_count?: number
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['caro_games']['Insert']>
      }
      caro_moves: {
        Row: {
          game_id: string
          turn_number: number
          player_id: string
          row: number
          col: number
        }
        Insert: {
          game_id: string
          turn_number: number
          player_id: string
          row: number
          col: number
        }
        Update: Partial<Database['public']['Tables']['caro_moves']['Insert']>
      }
      chess_games: {
        Row: {
          id: string
          white_id: string
          black_id: string | null
          fen: string
          moves: string[]
          move_count: number
          turn: 'w' | 'b'
          status: 'waiting' | 'active' | 'check' | 'checkmate' | 'draw'
          result: string | null
          created_at: string
        }
        Insert: {
          id?: string
          white_id: string
          black_id?: string | null
          fen?: string
          moves?: string[]
          move_count?: number
          turn?: 'w' | 'b'
          status?: 'waiting' | 'active' | 'check' | 'checkmate' | 'draw'
          result?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['chess_games']['Insert']>
      }
    }
  }
}
