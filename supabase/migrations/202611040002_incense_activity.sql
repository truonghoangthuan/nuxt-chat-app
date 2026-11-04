-- Opt-in milestones, not prayer text or Presence. Apply only after operator approval.
begin;
create table if not exists public.incense_events (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null unique,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists incense_events_history_idx on public.incense_events(conversation_id, created_at desc, id desc);
create index if not exists incense_events_cooldown_idx on public.incense_events(conversation_id, user_id, created_at desc);
alter table public.incense_events enable row level security;
revoke all on public.incense_events from public, anon, authenticated;
grant select on public.incense_events to authenticated;
drop policy if exists "Members read incense milestones" on public.incense_events;
create policy "Members read incense milestones" on public.incense_events for select to authenticated
  using (public.can_access_conversation(conversation_id));

create or replace function public.list_incense_events(p_conversation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- Lock membership against concurrent deletion until this transaction completes.
  perform 1 from public.conversation_members where conversation_id=p_conversation_id and user_id=auth.uid() for share;
  if not found or auth.uid() is null then
    raise exception 'Conversation member required' using errcode='42501';
  end if;
  return coalesce((select jsonb_agg(e.item order by e.created_at desc, e.id desc) from (
    select ie.created_at, ie.id, to_jsonb(ie) || jsonb_build_object('actor',jsonb_build_object('id',p.id,'display_name',p.display_name)) as item
    from public.incense_events ie join public.profiles p on p.id=ie.user_id
    where ie.conversation_id=p_conversation_id order by ie.created_at desc, ie.id desc limit 30
  ) e), '[]'::jsonb);
end;
$$;

create or replace function public.offer_incense(p_conversation_id uuid, p_client_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor uuid := auth.uid();
  event public.incense_events;
begin
  if actor is null then raise exception 'Conversation member required' using errcode='42501'; end if;
  if p_client_id is null then raise exception 'Client id required' using errcode='22023'; end if;
  perform 1 from public.conversation_members where conversation_id=p_conversation_id and user_id=actor for share;
  if not found then raise exception 'Conversation member required' using errcode='42501'; end if;
  -- Serialize retries and independent tabs for this actor. Different actors remain independent.
  perform pg_advisory_xact_lock(hashtextextended('incense:' || actor::text, 0));
  select * into event from public.incense_events where client_id=p_client_id;
  if found then
    if event.user_id<>actor or event.conversation_id<>p_conversation_id then
      raise exception 'Client id belongs to another offering' using errcode='22023';
    end if;
  else
    if exists(select 1 from public.incense_events where user_id=actor and conversation_id=p_conversation_id and created_at > clock_timestamp()-interval '60 seconds') then
      raise exception 'Incense cooldown: wait one minute' using errcode='P0001';
    end if;
    insert into public.incense_events(conversation_id,user_id,client_id)
      values(p_conversation_id,actor,p_client_id) returning * into event;
  end if;
  return to_jsonb(event) || jsonb_build_object('actor',(
    select jsonb_build_object('id',p.id,'display_name',p.display_name) from public.profiles p where p.id=actor
  ));
end;
$$;
revoke all on function public.list_incense_events(uuid) from public, anon;
revoke all on function public.offer_incense(uuid,uuid) from public, anon;
grant execute on function public.list_incense_events(uuid) to authenticated;
grant execute on function public.offer_incense(uuid,uuid) to authenticated;
commit;
