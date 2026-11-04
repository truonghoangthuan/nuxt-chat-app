-- Operator-applied only. Supabase already owns/enables RLS on realtime.messages.
-- Private channel authorization is cached at join: membership revocation takes
-- effect on the next authorization/rejoin, not as immediate socket eviction.
-- Keep project-wide public access settings and unrelated realtime policies intact.
begin;

do $street$
declare
  permission text := $permission$
    case
      when realtime.topic() ~* '^street:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then
        (select auth.role()) = 'authenticated'
        and (select auth.uid()) is not null
        and extension in ('presence', 'broadcast')
        and exists (
          select 1 from public.conversations c
          -- Keep the cast itself inside CASE: the planner may hoist the
          -- EXISTS subquery above the outer CASE during policy evaluation.
          where c.id = case
            when realtime.topic() ~* '^street:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            then substring(realtime.topic() from 8)::uuid
            else null::uuid
          end
            and c.type = 'group'
            and public.can_access_conversation(c.id)
        )
      else false
    end
  $permission$;
  operation text;
  clause text;
  policy_name text;
begin
  foreach operation in array array['select', 'insert'] loop
    clause := case when operation = 'select' then 'using' else 'with check' end;
    policy_name := 'street_member_' || operation;
    execute format('drop policy if exists %I on realtime.messages', policy_name);
    execute format(
      'create policy %I on realtime.messages as permissive for %s to authenticated %s (%s)',
      policy_name, operation, clause, permission
    );

    -- PostgreSQL ORs permissive policies. A namespace-only restrictive guard
    -- prevents legacy broad grants from bypassing street membership checks.
    -- Other topics (typing/music/global presence) retain their existing rules.
    policy_name := 'street_namespace_' || operation;
    execute format('drop policy if exists %I on realtime.messages', policy_name);
    execute format(
      'create policy %I on realtime.messages as restrictive for %s to public %s
       (case when left(coalesce(realtime.topic(), ''''), 7) = ''street:'' then (%s) else true end)',
      policy_name, operation, clause, permission
    );
  end loop;
end
$street$;

commit;
