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

create unique index if not exists profiles_email_lower_idx on public.profiles (lower(email)) where email is not null and email <> '';

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
    public.can_access_conversation(conversation_id)
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

-- ============================================================================
-- 5. Message Reactions Table
-- ============================================================================
create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

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

create policy "Users can view their own conversation reads"
  on public.conversation_reads for select
  to authenticated
  using (auth.uid() = user_id);

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

-- ============================================================================
-- 9. Realtime Publication
-- ============================================================================
do $$
declare
  tbl text;
begin
  for tbl in select unnest(array['conversations', 'conversation_members', 'messages', 'message_reactions', 'profiles', 'contacts']) loop
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
