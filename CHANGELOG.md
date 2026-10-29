# Changelog

All notable changes to the **Nuxt 4 Real-Time Friends Chat App** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added
- **Reaction Reactor Popover**: Hovering (or focusing) a reaction pill in `MessageViewport.vue` now opens a styled popover listing who reacted, with avatars ("You" for the current user).

## [0.8.0] - 2026-10-29

### Added
- **Media Session API for Background & Lock-Screen Playback**:
  - Registered `navigator.mediaSession` metadata (title, artist, thumbnail artwork) and `playbackState`, synced automatically whenever the active track or play/pause state changes.
  - Wired `play`, `pause`, `nexttrack`, and `seekto` action handlers to the existing music controller (`musicTogglePlayPause`, `musicSkipToNext`, `musicSeekTo`), enabling lock-screen and notification-shade playback controls on Android/iOS PWA installs.
  - Reported scrubber position via `setPositionState` on every `timeupdate`/`loadedmetadata`, keeping the OS-level progress bar in sync with the shared room playback.
  - Prevents Android Chrome from freezing the backgrounded tab during music playback (previously caused "nghe nhạc tự tắt khi khoá máy" on mobile installs), with handlers cleanly registered on mount and torn down on unmount.

### Fixed
- **Music Playback Stopping on Lock/Background (Mobile PWA)**: Backgrounding the app or locking the screen while a track was playing silently paused or killed playback because the browser had no signal that an active media session was in progress. Registering the Media Session API gives Android/iOS the same background-audio signal native music apps rely on.

## [0.7.0] - 2026-10-27

### Added
- **In-App Version Indicator & Interactive Release Notes**:
  - Embedded application version tag (`v0.7.0`) in the sidebar footer with one-click access to release highlights (`ChangelogModal.vue`).
  - Interactive "What's New" modal with Cupertino frosted styling, categorized release notes, and version history.
- **Apple-Level UI/UX & Fluid Interaction Refinements**:
  - **Adaptive Cupertino Modal Theming**: Resolved Invariant 7 theme discrepancies by upgrading `ProfileSettingsModal`, `ContactsModal`, `CreateGroupModal`, `GroupInfoModal`, `ChatBackgroundModal`, and `ConfettiDictionaryModal` to semantic frosted tokens (`bg-white/95 dark:bg-[#161824]/95`, `border-black/10 dark:border-white/15`, adaptive text colors) for parity between Light and Dark modes.
  - **Modal Motion & Spatial Continuity**: Wrapped all modal dialogs with smooth Vue `<Transition name="modal-fade">` entry/exit physics (`opacity-0 scale-[0.96]` to `opacity-100 scale-100` via cubic-bezier easing).
  - **Sidebar Activities Section**: Organized Caro and Chess links into a dedicated "Activities" section within the sidebar scroll flow featuring `Gamepad2` icons, subtle pill outlines, and active press feedback (`active:scale-95`), preserving the footer profile capsule as the bottom anchor.
  - **Micro-Physics & Feedback**:
    - Message hover action bar spring reveal (`translate-y-1 group-hover:translate-y-0 opacity-0 group-hover:opacity-100`).
    - Tactile active press states (`active:scale-95`, `active:scale-90`) across list items, action buttons, and composer dock controls.
    - Calmer, non-fatiguing floating unread pill notifications.
    - Subtle inner glow and focus rings on the floating composer dock (`focus-within:border-blue-500/50 focus-within:shadow-[0_4px_24px_rgba(0,122,255,0.12)]`).
    - Standardized `prefers-reduced-motion` safety rules in global CSS.
  - **Segmented Subtabs Control**: Elevated the stage subtabs navigation (`Messages`, `Media`, `Links`) with Cupertino capsule pill styling and smooth active state indicator.
  - **Caro Game Board Polish**: Modernized the Caro board (`app/pages/caro.vue`) with a frosted stage container, colored stone identifiers (Blue X / Rose O), and clean back navigation.

### Fixed
- **UserAvatar Online Dot Coordinate Detachment**: Added `relative` positioning to the outer container in `UserAvatar.vue` to anchor the online presence indicator firmly to the avatar corner across all size scales (`xs` through `2xl`).

---

## [0.6.0] - 2026-10-27

### Added
- **Multiplayer Chess**:
  - Full two-player online chess engine powered by `chess.js` and server-authoritative move validation.
  - Room invite links, color assignment (White / Black), algebraic move history, check/checkmate detection, and Realtime synchronization (`app/pages/chess.vue`).
- **YouTube Music Room & Server-Proxied Streaming**:
  - Realtime room music player with track search, playback controls, seek synchronization, and autoplay unblock detection (`MusicPlayerBar.vue`, `YouTubeSearchModal.vue`).
  - Nitro audio proxy endpoint (`/api/youtube/stream`) streaming audio directly via server proxy with client `User-Agent` forwarding, range capping, and iTunes fallback on 502 upstream errors.

---

## [0.5.0] - 2026-10-26

### Added
- **Multiplayer Caro (Gomoku)**:
  - Real-time 15×15 Caro game with room creation, invite links, and server-validated turns and win conditions (`app/pages/caro.vue`).
- **Chat Wallpapers & Aesthetics**:
  - Custom conversation background selection with curated presets and custom image uploads synced across participants (`ChatBackgroundModal.vue`).
- **Celebration Confetti Dictionary**:
  - In-app configurable keyword triggers that pop celebratory particle canvas confetti on matching messages (`ConfettiDictionaryModal.vue`, `ConfettiOverlay.vue`).

---

## [0.4.0] - 2026-10-25

### Added
- **Seen-By Read Receipts**:
  - Per-message seen avatar indicators rendering peer profile initials or photos at message footer (`computeSeenByMessageId`).
- **In-Memory E2EE Search**:
  - Client-side keyword search over decrypted message timeline with `<mark>` highlight wrappers and jump-to-result navigation without leaking plaintext over the network.
- **Service Worker Web Notifications**:
  - Action Center desktop notification delivery with absolute URL asset resolution and audio chimes via `public/sw.js`.

---

## [0.3.0] - 2026-10-24

### Added
- **Encrypted Image Attachments & Lightbox**:
  - Multi-image encrypted uploads with client-side thumbnail previews, AES-GCM-256 media envelopes, and full-screen lightbox viewer (`ImageViewerModal.vue`).
- **Emoji Reactions & Pinned Messages**:
  - Optimistic emoji reaction toggling with summary count pills and atomic pinned message banner navigation.
- **Direct Messages & Group Chats**:
  - Mutual contacts address book, group creation modal with multiselect members, and group ownership management.

---

## [0.2.0] - 2026-10-23

### Added
- **End-to-End Encryption (E2EE)**:
  - Client-side AES-GCM-256 message encryption bound with conversation AAD.
  - PBKDF2-HMAC-SHA256 key derivation with 600,000 iterations and transparent workspace auto-unlock.
  - Postgres database trigger rejecting non-E2EE plaintext inserts.

---

## [0.1.0] - 2026-10-22

### Added
- Initial project scaffold with Nuxt 4, Supabase Auth, PostgreSQL schema, Tailwind CSS, and Realtime messaging.
