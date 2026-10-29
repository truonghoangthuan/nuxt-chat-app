-- Enable UUID generation extension
create extension if not exists "pgcrypto";

-- ============================================================================
-- 1. Profiles Table (with Email Sync)
-- ============================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  avatar_color text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists bank_qr_url text;

create unique index if not exists profiles_email_lower_idx on public.profiles (lower(email)) where email is not null and email <> '';

alter table public.profiles enable row level security;

create or replace function public.lookup_profile_by_email(search_email text)
returns setof public.profiles
language sql
security definer
set search_path = public
stable
as $$
  select *
  from public.profiles
  where auth.role() = 'authenticated'
    and lower(email) = lower(trim(search_email))
  limit 1;
$$;

revoke all on function public.lookup_profile_by_email(text) from public, anon;
grant execute on function public.lookup_profile_by_email(text) to authenticated;

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

-- Trigger: auto-create or sync profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  d_name text;
  a_color text;
  u_email text;
begin
  u_email := coalesce(new.email, '');
  d_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
    nullif(split_part(u_email, '@', 1), ''),
    'Friend'
  );
  a_color := coalesce(new.raw_user_meta_data->>'avatar_color', '#0284c7');

  insert into public.profiles (id, email, display_name, avatar_color)
  values (new.id, u_email, d_name, a_color)
  on conflict (id) do update set
    email = excluded.email,
    display_name = excluded.display_name,
    avatar_color = excluded.avatar_color;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Backfill: insert profiles for any existing auth.users lacking a profile row
insert into public.profiles (id, email, display_name, avatar_color)
select
  u.id,
  coalesce(u.email, ''),
  coalesce(
    nullif(trim(u.raw_user_meta_data->>'display_name'), ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    'Friend'
  ),
  coalesce(u.raw_user_meta_data->>'avatar_color', '#0284c7')
from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
)
on conflict (id) do nothing;

-- ============================================================================
-- 2. Contacts Table (Personal Address Book)
-- ============================================================================
create table if not exists public.contacts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  contact_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, contact_user_id),
  constraint contacts_no_self_check check (user_id <> contact_user_id)
);

create index if not exists contacts_user_idx on public.contacts (user_id);

alter table public.contacts enable row level security;

create policy "Users can view their own contacts"
  on public.contacts for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own contacts"
  on public.contacts for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can delete their own contacts"
  on public.contacts for delete
  to authenticated
  using (auth.uid() = user_id);

-- Mutual Friendship Management
create or replace function public.add_mutual_friend(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or auth.uid() = target_user_id then
    return;
  end if;
  insert into public.contacts (user_id, contact_user_id)
  values (auth.uid(), target_user_id), (target_user_id, auth.uid())
  on conflict do nothing;
end;
$$;

create or replace function public.remove_mutual_friend(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  delete from public.contacts
  where (user_id = auth.uid() and contact_user_id = target_user_id)
     or (user_id = target_user_id and contact_user_id = auth.uid());
end;
$$;

revoke all on function public.add_mutual_friend(uuid) from public, anon;
grant execute on function public.add_mutual_friend(uuid) to authenticated;

revoke all on function public.remove_mutual_friend(uuid) from public, anon;
grant execute on function public.remove_mutual_friend(uuid) to authenticated;

-- ============================================================================
-- 3. Conversations & Conversation Members
-- ============================================================================
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('direct', 'group')),
  title text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_title_required check (type = 'direct' or (type = 'group' and title is not null and char_length(trim(title)) > 0))
);

alter table public.conversations enable row level security;

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists conv_members_user_idx on public.conversation_members (user_id);

alter table public.conversation_members enable row level security;

-- Function: check conversation membership access
create or replace function public.can_access_conversation(cid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = cid
      and cm.user_id = auth.uid()
  );
$$;

revoke execute on function public.can_access_conversation(uuid) from anon;
grant execute on function public.can_access_conversation(uuid) to authenticated;

-- Policies on conversations
create policy "Authenticated users can view accessible conversations"
  on public.conversations for select
  to authenticated
  using (public.can_access_conversation(id) or auth.uid() = created_by);

create policy "Authenticated users can insert conversations"
  on public.conversations for insert
  to authenticated
  with check (auth.uid() = created_by or created_by is null);

create policy "Authenticated users can update accessible conversations"
  on public.conversations for update
  to authenticated
  using (public.can_access_conversation(id))
  with check (public.can_access_conversation(id));

-- Policies on conversation_members
create policy "Authenticated users can view accessible conversation members"
  on public.conversation_members for select
  to authenticated
  using (public.can_access_conversation(conversation_id));

create policy "Authenticated users can insert conversation members"
  on public.conversation_members for insert
  to authenticated
  with check (
    (
      public.can_access_conversation(conversation_id)
      and exists (
        select 1 from public.conversations c
        where c.id = conversation_id and c.type = 'group'
      )
    )
    or exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.created_by = auth.uid()
    )
  );

-- Users can leave, or owners can remove members
create policy "Users can remove themselves or owners can manage members"
  on public.conversation_members for delete
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = public.conversation_members.conversation_id
        and cm.user_id = auth.uid()
        and cm.role = 'owner'
    )
  );

-- Atomic helper: get or create direct conversation between auth.uid() and target_user_id
create or replace function public.get_or_create_direct_conversation(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  existing_cid uuid;
  new_cid uuid;
  lock_key bigint;
begin
  if caller_id is null then
    raise exception 'Not authenticated.';
  end if;
  if caller_id = target_user_id then
    raise exception 'Cannot start a direct message with yourself.';
  end if;

  -- Derive deterministic 64-bit advisory lock key from sorted UUIDs
  lock_key := ('x' || substr(md5(
    case when caller_id < target_user_id
         then caller_id::text || target_user_id::text
         else target_user_id::text || caller_id::text
    end
  ), 1, 15))::bit(64)::bigint;

  perform pg_advisory_xact_lock(lock_key);

  -- Check if direct conversation already exists for this pair
  select cm1.conversation_id into existing_cid
  from public.conversation_members cm1
  join public.conversation_members cm2 on cm1.conversation_id = cm2.conversation_id
  join public.conversations c on c.id = cm1.conversation_id
  where c.type = 'direct'
    and cm1.user_id = caller_id
    and cm2.user_id = target_user_id
  limit 1;

  if existing_cid is not null then
    return existing_cid;
  end if;

  -- Create new direct conversation
  insert into public.conversations (type, created_by)
  values ('direct', caller_id)
  returning id into new_cid;

  -- Insert both members
  insert into public.conversation_members (conversation_id, user_id, role)
  values
    (new_cid, caller_id, 'owner'),
    (new_cid, target_user_id, 'member');

  return new_cid;
end;
$$;

revoke all on function public.get_or_create_direct_conversation(uuid) from public, anon;
grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;

-- Profiles visibility policy (defined after contacts & conversation_members exist)
drop policy if exists "Authenticated users can view profiles" on public.profiles;
drop policy if exists "Users can view friends and conversation peers" on public.profiles;
create policy "Users can view friends and conversation peers"
  on public.profiles for select
  to authenticated
  using (
    auth.uid() = id
    or exists (
      select 1 from public.contacts c
      where c.user_id = auth.uid() and c.contact_user_id = profiles.id
    )
    or exists (
      select 1 from public.conversation_members cm_mine
      join public.conversation_members cm_peer on cm_peer.conversation_id = cm_mine.conversation_id
      where cm_mine.user_id = auth.uid() and cm_peer.user_id = profiles.id
    )
  );

-- ============================================================================
-- 4. Messages Table
-- ============================================================================
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid unique not null,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(trim(content)) > 0 and char_length(content) <= 24000),
  reply_to_id uuid references public.messages(id) on delete set null,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;

create index if not exists messages_conv_cursor_idx
  on public.messages (conversation_id, created_at desc, id desc);

create index if not exists messages_created_at_idx
  on public.messages (created_at desc);

create policy "Authenticated users can view accessible messages"
  on public.messages for select
  to authenticated
  using (public.can_access_conversation(conversation_id));

create policy "Authenticated users can insert accessible messages"
  on public.messages for insert
  to authenticated
  with check (auth.uid() = user_id and public.can_access_conversation(conversation_id));

create policy "Users can update accessible messages"
  on public.messages for update
  to authenticated
  using (auth.uid() = user_id and public.can_access_conversation(conversation_id))
  with check (auth.uid() = user_id and public.can_access_conversation(conversation_id));

-- Migration: add pinned_at and pinned_by columns and partial index
alter table public.messages
  add column if not exists pinned_at timestamptz,
  add column if not exists pinned_by uuid references public.profiles(id) on delete set null;

create index if not exists messages_pinned_idx
  on public.messages (conversation_id, pinned_at desc)
  where pinned_at is not null;

-- Function: atomically toggle pinned status of a message
create or replace function public.toggle_pin_message(p_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_msg record;
  v_pinned_at timestamptz;
  v_pinned_by uuid;
begin
  select id, conversation_id, pinned_at, pinned_by
  into v_msg
  from public.messages
  where id = p_message_id;

  if not found then
    return jsonb_build_object('error', 'Message not found');
  end if;

  if not public.can_access_conversation(v_msg.conversation_id) then
    return jsonb_build_object('error', 'Access denied');
  end if;

  if v_msg.pinned_at is null then
    v_pinned_at := now();
    v_pinned_by := auth.uid();
  else
    v_pinned_at := null;
    v_pinned_by := null;
  end if;

  update public.messages
  set pinned_at = v_pinned_at,
      pinned_by = v_pinned_by
  where id = p_message_id;

  return jsonb_build_object(
    'success', true,
    'pinned_at', v_pinned_at,
    'pinned_by', v_pinned_by
  );
end;
$$;

revoke execute on function public.toggle_pin_message(uuid) from anon;
grant execute on function public.toggle_pin_message(uuid) to authenticated;

-- ============================================================================
-- 5. Message Reactions Table
-- ============================================================================
-- Drop any legacy channel-based policies that fail PostgREST schema cache
drop policy if exists "Authenticated users can view message reactions" on public.message_reactions;
drop policy if exists "Authenticated users can view accessible message reactions" on public.message_reactions;
drop policy if exists "Authenticated users can insert their own reactions" on public.message_reactions;
drop policy if exists "Authenticated users can insert accessible reactions" on public.message_reactions;
drop policy if exists "Authenticated users can delete their own reactions" on public.message_reactions;
drop policy if exists "Authenticated users can delete accessible reactions" on public.message_reactions;

create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

-- Ensure conversation_id column exists if table was migrated from channel_id
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'message_reactions' and column_name = 'conversation_id'
  ) then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'message_reactions' and column_name = 'channel_id'
    ) then
      alter table public.message_reactions rename column channel_id to conversation_id;
    else
      alter table public.message_reactions add column conversation_id uuid references public.conversations(id) on delete cascade;
    end if;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'message_reactions' and column_name = 'channel_id'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'message_reactions' and column_name = 'conversation_id'
  ) then
    alter table public.message_reactions drop column if exists channel_id cascade;
  end if;
end;
$$;

drop index if exists public.message_reactions_channel_idx;

alter table public.message_reactions replica identity full;
alter table public.message_reactions enable row level security;

create index if not exists message_reactions_conv_idx
  on public.message_reactions (conversation_id, message_id);

create policy "Authenticated users can view accessible message reactions"
  on public.message_reactions for select
  to authenticated
  using (public.can_access_conversation(conversation_id));

create policy "Authenticated users can insert accessible reactions"
  on public.message_reactions for insert
  to authenticated
  with check (auth.uid() = user_id and public.can_access_conversation(conversation_id));

create policy "Authenticated users can delete accessible reactions"
  on public.message_reactions for delete
  to authenticated
  using (auth.uid() = user_id and public.can_access_conversation(conversation_id));

-- ============================================================================
-- 6. Conversation Reads Table (Persistent Unread Tracking)
-- ============================================================================
create table if not exists public.conversation_reads (
  user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, conversation_id)
);

alter table public.conversation_reads enable row level security;
alter table public.conversation_reads replica identity full;

drop policy if exists "Users can view their own conversation reads" on public.conversation_reads;
drop policy if exists "Users can view accessible conversation reads" on public.conversation_reads;
create policy "Users can view accessible conversation reads"
  on public.conversation_reads for select
  to authenticated
  using (public.can_access_conversation(conversation_id));

create policy "Users can insert accessible conversation reads"
  on public.conversation_reads for insert
  to authenticated
  with check (auth.uid() = user_id and public.can_access_conversation(conversation_id));

create policy "Users can update accessible conversation reads"
  on public.conversation_reads for update
  to authenticated
  using (auth.uid() = user_id and public.can_access_conversation(conversation_id))
  with check (auth.uid() = user_id and public.can_access_conversation(conversation_id));

-- ============================================================================
-- 7. End-to-End Encryption (E2EE) Configuration & Envelope Enforcement
-- ============================================================================
create table if not exists public.e2ee_config (
  id integer primary key check (id = 1),
  salt text not null,
  iterations integer not null,
  verifier text not null,
  created_at timestamptz not null default now()
);

alter table public.e2ee_config enable row level security;

create policy "Authenticated users can view e2ee config"
  on public.e2ee_config for select
  to authenticated
  using (true);

insert into public.e2ee_config (id, salt, iterations, verifier)
values (1, 'wDNmW-nuKO13SfRopF4rJw', 600000, 'e2ee:v1:usx_Wg2j4_dBIqeB:-Q6Gkgb4wHKN7QI0dlA1YJ96EqoRqnFsnSWRzUwbSmJ15zE27EcK1QR8')
on conflict (id) do nothing;

create or replace function public.enforce_message_e2ee_envelope()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if (tg_op = 'INSERT') or (tg_op = 'UPDATE' and new.content is distinct from old.content) then
    if new.content not like 'e2ee:v1:%' then
      raise exception 'Message content must be encrypted with an e2ee:v1: envelope';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists check_message_e2ee_envelope on public.messages;
create trigger check_message_e2ee_envelope
  before insert or update on public.messages
  for each row execute procedure public.enforce_message_e2ee_envelope();

-- ============================================================================
-- 8. Storage Bucket & Conversation-Aware Storage RLS for Encrypted Attachments
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('message-attachments', 'message-attachments', false)
on conflict (id) do nothing;

create or replace function public.storage_conversation_id(path text)
returns uuid
language plpgsql
immutable
as $$
declare
  parts text[];
begin
  parts := string_to_array(ltrim(path, '/'), '/');
  if array_length(parts, 1) >= 2
     and parts[1] in ('conversations', 'channels')
     and parts[2] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return parts[2]::uuid;
  end if;
  return null;
exception when others then
  return null;
end;
$$;

drop policy if exists "Authenticated users can upload conversation attachments" on storage.objects;
create policy "Authenticated users can upload conversation attachments"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'message-attachments'
    and public.can_access_conversation(public.storage_conversation_id(name))
  );

drop policy if exists "Authenticated users can view conversation attachments" on storage.objects;
create policy "Authenticated users can view conversation attachments"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'message-attachments'
    and public.can_access_conversation(public.storage_conversation_id(name))
  );

drop policy if exists "Authenticated users can delete conversation attachments" on storage.objects;
create policy "Authenticated users can delete conversation attachments"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'message-attachments'
    and owner = auth.uid()
    and public.can_access_conversation(public.storage_conversation_id(name))
  );

-- Migration: add background_url column to conversations
alter table public.conversations
  add column if not exists background_url text;

-- Migration: add confetti_words dictionary array to conversations
alter table public.conversations
  add column if not exists confetti_words text[] not null default '{}';

-- Storage Bucket for shared chat backgrounds (publicly readable)
insert into storage.buckets (id, name, public)
values ('chat-backgrounds', 'chat-backgrounds', true)
on conflict (id) do nothing;

drop policy if exists "Authenticated users can upload chat backgrounds" on storage.objects;
create policy "Authenticated users can upload chat backgrounds"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'chat-backgrounds'
    and public.can_access_conversation(public.storage_conversation_id(name))
  );

drop policy if exists "Anyone can view chat backgrounds" on storage.objects;
create policy "Anyone can view chat backgrounds"
  on storage.objects for select
  to authenticated, anon
  using (bucket_id = 'chat-backgrounds');

drop policy if exists "Authenticated users can update chat backgrounds" on storage.objects;
create policy "Authenticated users can update chat backgrounds"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'chat-backgrounds'
    and owner = auth.uid()
    and public.can_access_conversation(public.storage_conversation_id(name))
  );

drop policy if exists "Authenticated users can delete chat backgrounds" on storage.objects;
create policy "Authenticated users can delete chat backgrounds"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'chat-backgrounds'
    and owner = auth.uid()
    and public.can_access_conversation(public.storage_conversation_id(name))
  );

-- ============================================================================
-- 9. Realtime Publication
-- ============================================================================
do $$
declare
  tbl text;
begin
  for tbl in select unnest(array['conversations', 'conversation_members', 'messages', 'message_reactions', 'profiles', 'contacts', 'conversation_reads']) loop
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (
         select 1 from pg_publication_tables
         where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = tbl
       ) then
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    end if;
  end loop;
end;
$$;
-- Caro: apply this entire section as one transaction before enabling the UI.
begin;
create table if not exists public.caro_games (
  id uuid primary key default gen_random_uuid(),
  player_x_id uuid not null references auth.users(id),
  player_o_id uuid references auth.users(id),
  status text not null default 'waiting' check (status in ('waiting', 'active', 'won', 'draw')),
  current_player_id uuid references auth.users(id),
  winner_id uuid references auth.users(id),
  move_count integer not null default 0 check (move_count between 0 and 225),
  created_at timestamptz not null default now(),
  check (player_o_id is null or player_o_id <> player_x_id),
  check (current_player_id is null or current_player_id = player_x_id or current_player_id = player_o_id),
  check (winner_id is null or winner_id = player_x_id or winner_id = player_o_id),
  check (
    (status = 'waiting' and player_o_id is null and current_player_id is null and winner_id is null and move_count = 0) or
    (status = 'active' and player_o_id is not null and current_player_id is not null and winner_id is null and move_count < 225) or
    (status = 'won' and player_o_id is not null and current_player_id is null and winner_id is not null) or
    (status = 'draw' and player_o_id is not null and current_player_id is null and winner_id is null and move_count = 225)
  )
);
create table if not exists public.caro_moves (
  game_id uuid not null references public.caro_games(id) on delete cascade,
  turn_number integer not null check (turn_number between 1 and 225),
  player_id uuid not null references auth.users(id),
  row integer not null check (row between 0 and 14),
  col integer not null check (col between 0 and 14),
  primary key (game_id, turn_number),
  unique (game_id, row, col)
);
create index if not exists caro_games_player_x_idx on public.caro_games(player_x_id);
create index if not exists caro_games_player_o_idx on public.caro_games(player_o_id);
alter table public.caro_games enable row level security;
alter table public.caro_moves enable row level security;
revoke all on public.caro_games, public.caro_moves from public, anon, authenticated;
grant select on public.caro_games, public.caro_moves to authenticated;
drop policy if exists caro_games_participants on public.caro_games;
create policy caro_games_participants on public.caro_games for select to authenticated
  using (auth.uid() = player_x_id or auth.uid() = player_o_id);
drop policy if exists caro_moves_participants on public.caro_moves;
create policy caro_moves_participants on public.caro_moves for select to authenticated
  using (exists (select 1 from public.caro_games g where g.id = game_id and (auth.uid() = g.player_x_id or auth.uid() = g.player_o_id)));
-- No INSERT/UPDATE/DELETE policies or grants: all mutations go through these RPCs.
create or replace function public.create_caro_game()
returns public.caro_games language plpgsql security definer set search_path = pg_catalog, public as $$
declare g public.caro_games;
begin
  if auth.uid() is null then raise exception 'Sign in to play'; end if;
  insert into public.caro_games(player_x_id) values (auth.uid()) returning * into g;
  return g;
end;
$$;
create or replace function public.join_caro_game(p_game_id uuid)
returns public.caro_games language plpgsql security definer set search_path = pg_catalog, public as $$
declare g public.caro_games; actor uuid := auth.uid();
begin
  if actor is null then raise exception 'Sign in to play'; end if;
  select * into g from public.caro_games where id = p_game_id for update;
  if not found then raise exception 'Room unavailable'; end if;
  -- Existing participants can reopen even a completed room.
  if actor = g.player_x_id or actor = g.player_o_id then return g; end if;
  if g.status <> 'waiting' or g.player_o_id is not null then raise exception 'Room unavailable'; end if;
  update public.caro_games set player_o_id = actor, status = 'active', current_player_id = player_x_id
    where id = p_game_id returning * into g;
  return g;
end;
$$;
create or replace function public.make_caro_move(p_game_id uuid, p_row integer, p_col integer)
returns public.caro_games language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  g public.caro_games; actor uuid := auth.uid(); direction integer[];
  dr integer; dc integer; sign integer; distance integer; total integer; won boolean := false;
begin
  if actor is null then raise exception 'Sign in to play'; end if;
  select * into g from public.caro_games where id = p_game_id for update;
  if not found then raise exception 'Room unavailable'; end if;
  if actor is distinct from g.player_x_id and actor is distinct from g.player_o_id then raise exception 'Room unavailable'; end if;
  if g.status <> 'active' then raise exception 'Game is not active'; end if;
  if actor is distinct from g.current_player_id then raise exception 'Not your turn'; end if;
  if p_row is null or p_col is null or p_row not between 0 and 14 or p_col not between 0 and 14 then raise exception 'Invalid cell'; end if;
  if exists (select 1 from public.caro_moves where game_id = p_game_id and row = p_row and col = p_col) then raise exception 'Cell occupied'; end if;
  insert into public.caro_moves(game_id, turn_number, player_id, row, col)
    values (p_game_id, g.move_count + 1, actor, p_row, p_col);
  foreach direction slice 1 in array array[[0,1],[1,0],[1,1],[1,-1]] loop
    dr := direction[1]; dc := direction[2]; total := 1;
    foreach sign in array array[-1,1] loop
      for distance in 1..14 loop
        exit when not exists (select 1 from public.caro_moves where game_id = p_game_id and player_id = actor
          and row = p_row + dr * sign * distance and col = p_col + dc * sign * distance);
        total := total + 1;
      end loop;
    end loop;
    if total >= 5 then won := true; exit; end if;
  end loop;
  update public.caro_games set
    move_count = g.move_count + 1,
    status = case when won then 'won' when g.move_count + 1 = 225 then 'draw' else 'active' end,
    winner_id = case when won then actor else null end,
    current_player_id = case when won or g.move_count + 1 = 225 then null when actor = g.player_x_id then g.player_o_id else g.player_x_id end
    where id = p_game_id returning * into g;
  return g;
end;
$$;
revoke all on function public.create_caro_game() from public, anon;
revoke all on function public.join_caro_game(uuid) from public, anon;
revoke all on function public.make_caro_move(uuid, integer, integer) from public, anon;
grant execute on function public.create_caro_game() to authenticated;
grant execute on function public.join_caro_game(uuid) to authenticated;
grant execute on function public.make_caro_move(uuid, integer, integer) to authenticated;
do $$
declare tbl text;
begin
  foreach tbl in array array['caro_games', 'caro_moves'] loop
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
      and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = tbl) then
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    end if;
  end loop;
end;
$$;
commit;

-- BEGIN CHESS
-- Apply this entire section independently for existing installations.
begin;
create table if not exists public.chess_games (
  id uuid primary key default gen_random_uuid(),
  white_id uuid not null references auth.users(id),
  black_id uuid references auth.users(id),
  fen text not null default 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  moves text[] not null default '{}',
  move_count integer not null default 0 check (move_count >= 0),
  turn text not null default 'w' check (turn in ('w', 'b')),
  status text not null default 'waiting' check (status in ('waiting', 'active', 'check', 'checkmate', 'draw')),
  result text check (result in ('white', 'black', 'stalemate', 'repetition', 'insufficient_material', 'fifty_moves')),
  created_at timestamptz not null default now(),
  check (black_id is null or black_id <> white_id),
  check (cardinality(moves) = move_count),
  check (
    (status = 'waiting' and black_id is null and move_count = 0 and turn = 'w' and result is null) or
    (status in ('active', 'check') and black_id is not null and result is null) or
    (status = 'checkmate' and black_id is not null and result is not null and result in ('white', 'black')) or
    (status = 'draw' and black_id is not null and result is not null and result in ('stalemate', 'repetition', 'insufficient_material', 'fifty_moves'))
  )
);
create index if not exists chess_games_white_idx on public.chess_games(white_id);
create index if not exists chess_games_black_idx on public.chess_games(black_id);
alter table public.chess_games enable row level security;
revoke all on public.chess_games from public, anon, authenticated, service_role;
grant select on public.chess_games to authenticated, service_role;
drop policy if exists chess_participants on public.chess_games;
create policy chess_participants on public.chess_games for select to authenticated
  using (auth.uid() = white_id or auth.uid() = black_id);

create or replace function public.create_chess_game()
returns public.chess_games language plpgsql security definer set search_path = pg_catalog, public as $$
declare g public.chess_games; actor uuid := auth.uid();
begin
  if actor is null then raise exception 'Sign in to play'; end if;
  insert into public.chess_games(white_id) values (actor) returning * into g;
  return g;
end;
$$;
create or replace function public.join_chess_game(p_game_id uuid)
returns public.chess_games language plpgsql security definer set search_path = pg_catalog, public as $$
declare g public.chess_games; actor uuid := auth.uid();
begin
  if actor is null then raise exception 'Sign in to play'; end if;
  select * into g from public.chess_games where id = p_game_id for update;
  if not found then raise exception 'Room unavailable'; end if;
  -- Idempotent reopen, including finished games; never put the creator in both seats.
  if actor = g.white_id or actor = g.black_id then return g; end if;
  if g.status <> 'waiting' or g.black_id is not null then raise exception 'Room unavailable'; end if;
  update public.chess_games set black_id = actor, status = 'active' where id = p_game_id returning * into g;
  return g;
end;
$$;

-- Only trusted Nitro code may supply engine-derived fields. No browser EXECUTE grant.
create or replace function public.commit_chess_move(
  p_game_id uuid, p_actor uuid, p_expected_count integer, p_expected_fen text,
  p_fen text, p_san text, p_turn text, p_status text, p_result text
)
returns public.chess_games language plpgsql security definer set search_path = pg_catalog, public as $$
declare g public.chess_games;
begin
  select * into g from public.chess_games where id = p_game_id for update;
  if not found then raise exception 'Room unavailable'; end if;
  if p_actor is null or (p_actor is distinct from g.white_id and p_actor is distinct from g.black_id) then raise exception 'Room unavailable'; end if;
  if g.status not in ('active', 'check') or g.black_id is null then raise exception 'Game is not active'; end if;
  if p_actor is distinct from (case when g.turn = 'w' then g.white_id else g.black_id end) then raise exception 'Not your turn'; end if;
  if p_expected_count is distinct from g.move_count or p_expected_fen is distinct from g.fen then raise exception 'Stale move'; end if;
  if p_turn is null or p_turn not in ('w', 'b') or p_turn = g.turn
    or p_san is null or length(p_san) not between 1 and 16
    or p_fen is null or length(p_fen) not between 15 and 120
    or p_status is null or p_status not in ('active', 'check', 'checkmate', 'draw') then raise exception 'Invalid move state'; end if;
  update public.chess_games set fen = p_fen, moves = array_append(g.moves, p_san),
    move_count = g.move_count + 1, turn = p_turn, status = p_status, result = p_result
    where id = p_game_id returning * into g;
  return g;
end;
$$;
revoke all on function public.create_chess_game() from public, anon, authenticated, service_role;
revoke all on function public.join_chess_game(uuid) from public, anon, authenticated, service_role;
revoke all on function public.commit_chess_move(uuid, uuid, integer, text, text, text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.create_chess_game() to authenticated;
grant execute on function public.join_chess_game(uuid) to authenticated;
grant execute on function public.commit_chess_move(uuid, uuid, integer, text, text, text, text, text, text) to service_role;
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chess_games') then
    alter publication supabase_realtime add table public.chess_games;
  end if;
end;
$$;
commit;
-- END CHESS
