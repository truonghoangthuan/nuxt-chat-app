-- Enable UUID generation extension
create extension if not exists "pgcrypto";

-- 1. Profiles Table
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_color text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Authenticated users can view profiles"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

-- Trigger: auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  d_name text;
  a_color text;
begin
  d_name := coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1));
  a_color := coalesce(new.raw_user_meta_data->>'avatar_color', '#0284c7');

  insert into public.profiles (id, display_name, avatar_color)
  values (new.id, d_name, a_color)
  on conflict (id) do update set
    display_name = excluded.display_name,
    avatar_color = excluded.avatar_color;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. Channels Table
create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  description text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.channels enable row level security;

create policy "Authenticated users can view channels"
  on public.channels for select
  to authenticated
  using (true);

create policy "Authenticated users can create channels"
  on public.channels for insert
  to authenticated
  with check (auth.uid() = created_by or created_by is null);

-- Seed Default Channels
insert into public.channels (slug, description)
values
  ('general', 'General hangout for everyone'),
  ('random', 'Random links, jokes, and off-topic chat')
on conflict (slug) do nothing;

-- 3. Messages Table
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid unique not null,
  channel_id uuid not null references public.channels(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(trim(content)) > 0 and char_length(content) <= 4000),
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;

create policy "Authenticated users can view messages"
  on public.messages for select
  to authenticated
  using (true);

create policy "Authenticated users can insert messages"
  on public.messages for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Index for composite cursor pagination
create index if not exists messages_channel_cursor_idx
  on public.messages (channel_id, created_at desc, id desc);

-- 3b. Message Lifecycle Extensions (Edit, Soft-Delete, Replies)
alter table public.messages
  add column if not exists reply_to_id uuid references public.messages(id) on delete set null,
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz;

create policy "Users can update their own messages"
  on public.messages for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 4. Message Reactions Table
create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

alter table public.message_reactions replica identity full;
alter table public.message_reactions enable row level security;

create policy "Authenticated users can view message reactions"
  on public.message_reactions for select
  to authenticated
  using (true);

create policy "Authenticated users can insert their own reactions"
  on public.message_reactions for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Authenticated users can delete their own reactions"
  on public.message_reactions for delete
  to authenticated
  using (auth.uid() = user_id);

create index if not exists message_reactions_channel_idx
  on public.message_reactions (channel_id, message_id);

-- Realtime Publication
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages, public.channels;
  end if;
exception when duplicate_object then
  -- tables already in publication
  null;
end;
$$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.profiles;
  end if;
exception when duplicate_object then
  -- table already in publication
  null;
end;
$$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
exception when duplicate_object then
  null;
end;
$$;

