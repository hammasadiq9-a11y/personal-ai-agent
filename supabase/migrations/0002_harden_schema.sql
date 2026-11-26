-- Harden the initial schema for existing installations.
alter function public.set_updated_at() set search_path = '';
revoke all on function public.set_updated_at() from public, anon, authenticated;

revoke all on function public.handle_new_user() from public, anon, authenticated;

drop function if exists public.consume_chat_rate_limit(integer, integer);
create or replace function public.consume_chat_rate_limit(
  p_user_id uuid,
  p_max_requests integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_request_count integer;
begin
  if p_user_id is null then
    return false;
  end if;

  if p_max_requests < 1 or p_max_requests > 1000
    or p_window_seconds < 1 or p_window_seconds > 3600 then
    raise exception 'Invalid rate limit parameters';
  end if;

  insert into public.api_rate_limits (user_id, window_started_at, request_count)
  values (p_user_id, now(), 1)
  on conflict (user_id) do update
  set
    window_started_at = case
      when now() >= public.api_rate_limits.window_started_at + make_interval(secs => p_window_seconds)
      then now()
      else public.api_rate_limits.window_started_at
    end,
    request_count = case
      when now() >= public.api_rate_limits.window_started_at + make_interval(secs => p_window_seconds)
      then 1
      else public.api_rate_limits.request_count + 1
    end
  returning request_count into v_request_count;

  return v_request_count <= p_max_requests;
end;
$$;

revoke all on function public.consume_chat_rate_limit(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_chat_rate_limit(uuid, integer, integer) to service_role;

create index if not exists memories_project_user_idx on public.memories(project_id, user_id);
create index if not exists messages_conversation_user_idx on public.messages(conversation_id, user_id);
create index if not exists messages_user_id_idx on public.messages(user_id);
create index if not exists tasks_project_user_idx on public.tasks(project_id, user_id);
