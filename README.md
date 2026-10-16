# Nuxt 4 Real-Time Friends Chat App

A lightweight, responsive, real-time web chat application built with **Nuxt 4**, **Supabase**, and **Tailwind CSS**. Designed for friends to hang out across topic-based public channels with a fast, resilient Slack-style interface.

## Features

- **Frictionless Onboarding**: Email and password authentication with display names and deterministic auto-generated initials/color avatars.
- **Public Channels**: Seeded default channels (`#general`, `#random`) plus real-time channel creation synced across all connected clients with unread message counters.
- **Real-Time Messaging & Ephemeral Signals**:
  - Instant message broadcasting via Supabase Realtime (`postgres_changes`).
  - Global online presence (`presence:global`) showing friends currently online across the app.
  - Per-channel typing indicators via Supabase Realtime Broadcast with automatic timeout expiry.
- **Optimistic UI & Delivery Guarantees**:
  - Immediate `"Sending..."` state with client-generated UUIDs (`client_id`) for idempotent deduplication.
  - `"Failed — Retry / Dismiss"` controls when messages fail to send.
- **Connection Resiliency & History Pagination**:
  - Automatic reconnection with exponential backoff (`1s` to `30s` max) and manual `"Retry now"` recovery banner.
  - Automatic gap recovery on reconnect to fetch missed messages.
  - Cursor-based infinite upward scroll (40 messages per page) with scroll-position locking and a floating `"↓ X new messages"` pill when scrolled up.
- **Responsive Themeable UI**: Unified sidebar (with mobile drawer on `< 768px`) and persistent Dark/Light theme toggle.

## Tech Stack

- **Framework**: [Nuxt 4](https://nuxt.com/) (`app/` directory structure) & Vue 3
- **Backend / Auth / Realtime**: [Supabase](https://supabase.com/) (`@nuxtjs/supabase`)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) (`@nuxtjs/tailwindcss`)
- **Testing**: [Vitest](https://vitest.dev/) & `@vue/test-utils` (`happy-dom`)

## Prerequisites & Supabase Setup

1. Create a project on [Supabase](https://supabase.com/).
2. Open the **SQL Editor** in your Supabase dashboard and run the contents of [`supabase/schema.sql`](./supabase/schema.sql). This sets up:
   - `public.profiles`, `public.channels`, and `public.messages` tables with Row-Level Security (RLS) policies.
   - Automatic profile creation trigger (`on_auth_user_created`) upon user sign-up.
   - Default `#general` and `#random` channels.
   - Composite cursor index and `supabase_realtime` publication for `messages` and `channels`.
3. *(Optional for quick onboarding)* In **Authentication → Providers → Email**, disable **Confirm email** so users can sign in immediately without email verification. (If left enabled, the `/confirm` page handles confirmation redirects.)

## Environment Variables

Copy `.env.example` to `.env` in the project root and fill in your Supabase project credentials:

```bash
cp .env.example .env
```

```dotenv
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_KEY=your-anon-public-key
```

## Getting Started

Install dependencies:

```bash
npm install
```

Start the development server at `http://localhost:3000`:

```bash
npm run dev
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start Nuxt development server on `http://localhost:3000` |
| `npm test` | Run unit and component tests with Vitest |
| `npm run build` | Build application for production |
| `npm run preview` | Locally preview production build |
| `npm run generate` | Generate static site |

## Project Structure

```text
├── app/
│   ├── components/       # Chat UI components (Sidebar, Viewport, Composer, Modal, Banner, Avatar)
│   ├── composables/      # State & realtime orchestration (useChatRoom, useConnectionManager, etc.)
│   ├── middleware/       # Global auth route guard (auth.global.ts)
│   ├── pages/            # Application routes (index.vue, login.vue, confirm.vue)
│   ├── types/            # TypeScript interfaces for channels, messages, profiles, presence
│   └── utils/            # Pure helpers (slug normalization, backoff math, deterministic avatars)
├── supabase/
│   └── schema.sql        # Database tables, triggers, RLS policies, and realtime publication
└── tests/                # Vitest unit and component test suites
```
