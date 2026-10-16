# Nuxt 4 Real-Time Friends Chat App — Design Specification

## 1. Intent & Why

A lightweight, responsive, real-time web chat application built with **Nuxt 4**, **Supabase**, and **Tailwind CSS** for a group of friends to hang out and communicate across topic-based public channels. The goal is to deliver a snappy, resilient Slack-like experience where friends can sign up with an email and password, see who is online across the app, create or switch between public channels, and exchange real-time plain-text messages with optimistic delivery and seamless history loading.

## 2. Goals, Non-Goals & Anti-Goals

### Goals
- **Frictionless Friend Onboarding**: Email-and-password sign-up and login with a display name and deterministic auto-generated initials/color avatar.
- **Public Channels**: Seeded default channels (`#general`, `#random`) plus the ability for any logged-in user to create new public channels from the sidebar, synced in real time to all connected clients.
- **Real-Time Messaging & Ephemeral Signals**:
  - Instant message broadcasting to all clients viewing the channel via Supabase Realtime (`postgres_changes`).
  - Global online user presence (`presence:global`) showing all friends currently online across the entire application.
  - Per-channel typing indicators (`"Alice is typing..."`, `"Alice and Bob are typing..."`) via Supabase Realtime Broadcast with automatic timeout expiry.
- **Responsive Slack-Style UI (Option A) with Dark/Light Theme Toggle (Option C)**:
  - Unified left sidebar containing app header + connection status badge, Channels list (with unread count badges and `+ New` button), Online Friends list, and User Footer (profile, theme toggle, logout).
  - Mobile drawer (`< 768px`) for the sidebar.
  - Main message viewport with auto-scroll on new messages, upward infinite scroll for history, optimistic `"Sending..."` / `"Failed — Retry / Dismiss"` states, and `Enter`-to-send / `Shift+Enter`-for-newline composer.
- **Resiliency**:
  - Automatic reconnection with exponential backoff (1s, 2s, 4s, 8s, 16s, capped at 30s) when the realtime or network connection drops, paired with an amber status banner and manual `"Retry now"` action.
  - Gap recovery (fetching any missed messages in the active channel upon reconnecting).
  - Cursor-based historical pagination (40 messages per page) on channel join and upward scroll while preserving scroll position.

### Non-Goals (Out of Scope for v1)
- Direct messages (1-on-1 private chats) or private/invite-only channels.
- Rich text / Markdown formatting, file/image uploads, emoji reactions, message editing, or message deletion.
- Social OAuth providers (Google/GitHub/Discord) or custom avatar image uploads.
- Push notifications or email digests.

### Anti-Goals (What Would Make This a Failure)
- Losing or silently dropping a user's message when the connection flickers (optimistic messages must clearly show `Sending...` or `Failed to send` with a working `Retry` button).
- Jumping the user's scroll position to the bottom while they are scrolled up reading older messages, or losing their scroll anchor when older pages load at the top.
- Duplicate messages appearing when an optimistic message is confirmed by both the HTTP insert response and the Supabase Realtime `INSERT` broadcast.

## 3. Constraints & Tech Stack (User-Decided)

- **Framework**: Nuxt 4 (`^4.6.1`, using the `app/` source directory structure).
- **Backend / Auth / Database / Realtime**: **Supabase** (`@nuxtjs/supabase` / `@supabase/supabase-js`).
- **Styling**: **Tailwind CSS** (`@nuxtjs/tailwindcss`) with class-based dark mode (`dark` class on `<html>`), defaulting to **Dark Slate** with a persistent **Light/Dark toggle** in the sidebar footer.
- **Authentication**: Supabase Email + Password authentication. Sign-up collects `email`, `password`, and `display_name`.

## 4. Functional & Architectural Design

### 4.1 Database Schema & Row-Level Security (`supabase/schema.sql`)

1. **`public.profiles`**
   - `id` (`uuid`, primary key, references `auth.users(id)` on delete cascade)
   - `display_name` (`text`, not null)
   - `avatar_color` (`text`, not null — deterministic hex/Tailwind color token derived from user ID/name)
   - `created_at` (`timestamptz`, default `now()`)
   - **Trigger**: A Postgres trigger `on_auth_user_created` automatically inserts a `public.profiles` row from `raw_user_meta_data->>'display_name'` and `raw_user_meta_data->>'avatar_color'` upon sign-up.
   - **RLS**: Authenticated users can `SELECT` all profiles; users can `UPDATE` / `INSERT` only their own profile (`auth.uid() = id`).

2. **`public.channels`**
   - `id` (`uuid`, primary key, default `gen_random_uuid()`)
   - `slug` (`text`, unique, not null — lowercase alphanumeric + hyphens, e.g., `general`, `random`)
   - `description` (`text`, nullable)
   - `created_by` (`uuid`, nullable, references `public.profiles(id)`)
   - `created_at` (`timestamptz`, default `now()`)
   - **Seed Data**: `#general` ("General hangout for everyone") and `#random` ("Random links, jokes, and off-topic chat").
   - **RLS**: Authenticated users can `SELECT` all channels and `INSERT` new channels (`auth.uid() = created_by`).

3. **`public.messages`**
   - `id` (`uuid`, primary key, default `gen_random_uuid()`)
   - `client_id` (`uuid`, not null, unique — generated by the client before sending to guarantee idempotency and optimistic deduplication)
   - `channel_id` (`uuid`, not null, references `public.channels(id)` on delete cascade)
   - `user_id` (`uuid`, not null, references `public.profiles(id)` on delete cascade)
   - `content` (`text`, not null, check `char_length(trim(content)) > 0 and char_length(content) <= 4000`)
   - `created_at` (`timestamptz`, not null, default `now()`)
   - **Index**: `(channel_id, created_at DESC, id DESC)` for fast cursor pagination.
   - **RLS**: Authenticated users can `SELECT` all messages and `INSERT` messages where `auth.uid() = user_id`.
   - **Realtime Publication**: `public.messages` and `public.channels` added to `supabase_realtime` publication.

### 4.2 Real-Time & Resiliency Architecture

1. **Global Presence (`presence:global` channel)**
   - On authenticated mount, the client joins a single Supabase Realtime channel `presence:global` with `config: { presence: { key: user.id } }`.
   - Tracks `{ user_id, display_name, avatar_color, online_at }`.
   - Listens to `presence` `sync`, `join`, and `leave` events to maintain a reactive list of all friends currently online across the entire app (deduplicated by `user_id` in case a friend has multiple tabs open).

2. **Channel Subscription & Unread Tracking (`chat:room:<channel_id>` + global message listener)**
   - **Messages (`postgres_changes`)**: Subscribes to `INSERT` events on `public.messages`.
     - If `new.channel_id === activeChannelId`: looks up matching optimistic message by `client_id`. If found, upgrades it in-place to `status: 'sent'`; otherwise appends the message (hydrating author info from cached `profiles` map or fetching on cache miss).
     - If `new.channel_id !== activeChannelId`: increments the unread badge counter for `new.channel_id` in the sidebar.
   - **Channels (`postgres_changes`)**: Subscribes to `INSERT` events on `public.channels` so newly created channels appear immediately in every connected user's sidebar.
   - **Typing Indicators (`broadcast` on `typing:<channel_id>`)**:
     - When a user types in the composer, broadcasts `{ user_id, display_name, is_typing: true }` throttled to once per 1.5 seconds.
     - Remote clients display `"Alice is typing..."` (or `"Alice and Bob are typing..."`, `"3 people are typing..."`) and clear each user's typing state after 3 seconds without a refresh event, or immediately when a message from that `user_id` arrives.

3. **Optimistic UI & Retry Flow**
   - Sending a message immediately appends an item to the active channel's message list:
     ```ts
     {
       id: clientId,
       client_id: clientId,
       channel_id: activeChannelId,
       user_id: currentUser.id,
       content,
       created_at: new Date().toISOString(),
       status: 'sending', // 'sending' | 'sent' | 'failed'
       author: currentProfile
     }
     ```
   - The viewport scrolls to the bottom immediately for the sender.
   - If the Supabase `insert` succeeds, `status` becomes `'sent'` and `id` updates to the server row's `id`.
   - If the `insert` fails (network error / timeout), `status` becomes `'failed'`. The user can click **Retry** (which re-attempts `insert` with the same `client_id` so it cannot duplicate) or **Dismiss** (removes the local item).

4. **Auto-Reconnection with Exponential Backoff**
   - A dedicated `useConnectionManager` composable monitors browser `online`/`offline` events and Supabase Realtime channel states (`SUBSCRIBED`, `TIMED_OUT`, `CLOSED`, `CHANNEL_ERROR`).
   - On disconnect/error, connection status enters `'reconnecting'`, scheduling a reconnect attempt after `min(1000 * 2 ** attempt, 30000)` ms (with small jitter).
   - Displays an amber banner at the top of the viewport showing the current backoff countdown and a **Retry now** button that resets the timer and reconnects immediately.
   - Upon successful reconnection, re-subscribes channels and fetches any messages in the active channel with `created_at > lastConfirmedMessageTimestamp` to heal any gap.

5. **Historical Pagination & Scroll Management**
   - **Initial Join**: Fetches the latest 40 messages (`ORDER BY created_at DESC, id DESC LIMIT 40`), reverses them into chronological order, and scrolls to the bottom (`scrollTop = scrollHeight`).
   - **Infinite Upward Scroll**: An `IntersectionObserver` (or scroll threshold `< 60px` from top) triggers `loadMoreHistory()` using a composite cursor `(oldestMessage.created_at, oldestMessage.id)`.
   - **Scroll Locking**: Before prepending older messages, records `prevScrollHeight = container.scrollHeight` and `prevScrollTop = container.scrollTop`. Inside `nextTick()`, sets `container.scrollTop = container.scrollHeight - prevScrollHeight + prevScrollTop` so the viewport does not jump.
   - **Smart Auto-Scroll on Incoming Messages**: If the user is within `120px` of the bottom (or sent the message themselves), smoothly scrolls to bottom. If scrolled further up reading history, increments a floating `"↓ X new messages"` pill above the composer.

## 5. What's Left to the Builder (Builder's Calls)

- **Channel slug normalization**: Automatically format user-entered channel names into lowercase slugs (`"Movie Night!"` → `movie-night`) and validate uniqueness (`2–32` chars).
- **Deterministic avatar palette**: Use an 8-color accessible palette (sky, violet, emerald, amber, rose, indigo, cyan, fuchsia) hashed from the user's ID/display name, paired with 1–2 uppercase initials.
- **Email confirmation note**: Document disabling "Confirm email" in Supabase Auth settings for instant dev/friend sign-up, while handling the "Check your email to confirm" state gracefully in the UI if enabled.
- **Testing setup**: Configure Vitest for unit-testing core state logic (optimistic deduplication, exponential backoff calculator, slug normalization, and typing timeout expiry).
