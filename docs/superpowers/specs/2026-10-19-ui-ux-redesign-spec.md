# Design Specification — Friends Chat UI/UX Redesign

## 1. Project Overview & Audience
- **Product:** Friends Chat (`nuxt-chat-app`) — a lightweight, resilient Slack-style real-time web chat application for close friends across public topic channels.
- **Target Audience:** Groups of close friends who want a fast, expressive, high-craft hangout space without enterprise Slack bloat or generic SaaS template sterility.
- **Core Emotional Tone:** Three distinct explorations across the spectrum requested by the user:
  1. **Warm Tactile Editorial Lounge** (cozy, human, magazine/salon feel)
  2. **High-Craft Precision Studio** (crisp dark/light engineering craft inspired by Linear / Raycast / Campsite)
  3. **Bold Tactile Club / Neo-Brutalist Zine** (playful, high-contrast ink borders, tactile keycap buttons, asymmetrical message cards)
- **Output Format & Viewport:** Interactive desktop/responsive web application prototypes at `1440×900` (and `375×812` mobile drawer verification), followed by full implementation across all Nuxt 4 pages and components once a direction is chosen.

## 2. Core Functional Elements (Must Be Present in All 3 Prototypes)
Every prototype must use authentic domain data from `nuxt-chat-app` (no Lorem ipsum):
1. **Channel Navigation & Creation:**
   - Public topic channels (`#general`, `#random`, `#help`, `#design-crit`, `#late-night-gaming`) with descriptions, active channel indicator, unread count badges, and `+ New Channel` modal trigger with live slug preview (`#slug`).
2. **Online Friends Presence Roster:**
   - Deduplicated real-time online friends list using the exact 8-color `AVATAR_PALETTE` (`#0284c7`, `#0d9488`, `#7c3aed`, `#db2777`, `#ea580c`, `#16a34a`, `#2563eb`, `#4f46e5`), 1–2 character initials, live emerald presence dot, and `(you)` tag.
3. **Message Timeline Viewport:**
   - History pagination trigger (`Load older messages`), date dividers (`Today, Oct 19`), full message rows (avatar, author name, timestamp) and compact grouped rows (same author within 5m with hover timestamp).
   - Quoted reply preview (`@Alice: ...`), edited badge (`(edited)`), deleted message tombstone (`This message was deleted`), optimistic `Sending...` state, and `Failed to send` state with `Retry` / `Dismiss` actions.
   - Interactive emoji reaction pills (`👍`, `❤️`, `😂`, `🎉`, `🚀`, `👀`) with active user highlight and hover action toolbar (`React`, `Reply`, `Edit`, `Delete`).
   - Floating `↓ N new messages` scroll-lock pill.
4. **Message Composer & Real-Time Feedback:**
   - Replying-to banner with cancel button, animated typing indicator (`Minh is typing...`), auto-resizing textarea (`Enter` to send, `Shift+Enter` for newline), and tactile Send button.
5. **System & Profile Controls:**
   - Connection status indicator + reconnecting banner (`Disconnected from realtime chat. Reconnecting in 4s...` + `Retry now`).
   - User profile footer / pill with Profile Settings modal trigger (live avatar preview + 8-color swatch picker), Light/Dark theme toggle, and Log Out action.
   - Sign-In / Create Account screen (`/login`) matching the chosen design system.

## 3. Hard Constraints
- **Avatar Palette Compatibility:** Must preserve `AVATAR_PALETTE` (`['#0284c7', '#0d9488', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#2563eb', '#4f46e5']`) so existing user profiles and tests pass without regression.
- **Readability Floor:** Body text `>= 14px`, labels `>= 12px`, WCAG contrast `>= 4.5:1` for normal text and `>= 3:1` for large display text, hit targets `>= 44×44px` where applicable.
- **Test Preservation:** When applying the chosen direction to the Nuxt 4 codebase, all `data-test` attributes and Vitest suites (`npm test`) must remain 100% green.
